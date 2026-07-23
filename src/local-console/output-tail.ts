import fs from "node:fs/promises";
import path from "node:path";

export interface LocalConsoleTailOptions {
  maxBytes?: number;
  timeoutMs?: number;
}

export interface LocalConsoleOutputTail {
  stdoutTail: string | null;
  stderrTail: string | null;
  stdoutState: LocalConsoleOutputFileState;
  stderrState: LocalConsoleOutputFileState;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  lastOutputSummary: string;
  tailDiagnostic: string | null;
}

export type LocalConsoleOutputFileState = "available" | "empty" | "missing";

const DEFAULT_MAX_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 250;

export async function readLocalConsoleOutputTail(
  runDir: string | null,
  options: LocalConsoleTailOptions = {},
): Promise<LocalConsoleOutputTail> {
  if (runDir === null) {
    return fallbackTail("正在运行，等待输出", null);
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stdoutPath = path.join(runDir, "stdout.jsonl");
  const stderrPath = path.join(runDir, "stderr.log");
  const [stdout, stderr] = await Promise.all([
    readTailBounded(stdoutPath, maxBytes, timeoutMs),
    readTailBounded(stderrPath, maxBytes, timeoutMs),
  ]);

  const diagnostics = [stdout.diagnostic, stderr.diagnostic].filter((value): value is string => value !== null);
  const summary = summarizeTail(stdout.text, stderr.text);
  return {
    stdoutTail: stdout.text,
    stderrTail: stderr.text,
    stdoutState: stdout.state,
    stderrState: stderr.state,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    lastOutputSummary: summary,
    tailDiagnostic: diagnostics.length > 0 ? diagnostics.join("; ") : null,
  };
}

export function summarizeTail(stdoutTail: string | null, stderrTail: string | null): string {
  const parsed = summarizeJsonl(stdoutTail);
  if (parsed !== null) {
    return parsed;
  }
  const raw = lastNonEmptyLine(stdoutTail) ?? lastNonEmptyLine(stderrTail);
  return raw ?? "正在运行，等待输出";
}

async function readTailBounded(
  filePath: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<OutputFileTail> {
  return await withTimeout(readTail(filePath, maxBytes), timeoutMs, `tail-timeout:${path.basename(filePath)}`);
}

interface OutputFileTail {
  text: string | null;
  diagnostic: string | null;
  state: LocalConsoleOutputFileState;
  truncated: boolean;
}

async function readTail(filePath: string, maxBytes: number): Promise<OutputFileTail> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(filePath, "r");
    const stat = await handle.stat();
    const length = Math.min(maxBytes, stat.size);
    if (length <= 0) {
      return { text: null, diagnostic: null, state: "empty", truncated: false };
    }
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, stat.size - length);
    const truncated = stat.size > maxBytes;
    return {
      text: buffer.toString("utf8"),
      diagnostic: truncated ? `tail-truncated:${path.basename(filePath)}` : null,
      state: "available",
      truncated,
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { text: null, diagnostic: null, state: "missing", truncated: false };
    }
    return {
      text: null,
      diagnostic: `tail-read-failed:${path.basename(filePath)}:${formatError(error)}`,
      state: "missing",
      truncated: false,
    };
  } finally {
    await handle?.close();
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, diagnostic: string): Promise<T | OutputFileTail> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<OutputFileTail>((resolve) => {
        timer = setTimeout(() => resolve({
          text: null,
          diagnostic,
          state: "missing",
          truncated: false,
        }), timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

function summarizeJsonl(text: string | null): string | null {
  if (text === null) {
    return null;
  }
  const lines = text.split(/\r?\n/u).reverse();
  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as unknown;
      const extracted = extractText(parsed);
      if (extracted !== null && extracted.trim() !== "") {
        return collapse(extracted);
      }
    } catch {
      // Try the next line; a bounded tail can start mid-JSON.
    }
  }
  return null;
}

function extractText(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const parts = value.map(extractText).filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join("") : null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["message", "content", "text", "summary"]) {
    const text = extractText(record[key]);
    if (text !== null) {
      return text;
    }
  }
  for (const key of ["item", "data", "delta"]) {
    const text = extractText(record[key]);
    if (text !== null) {
      return text;
    }
  }
  return null;
}

function lastNonEmptyLine(text: string | null): string | null {
  if (text === null) {
    return null;
  }
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const line = lines.at(-1);
  return line === undefined ? null : collapse(line);
}

function collapse(text: string): string {
  const collapsed = text.trim().replace(/\s+/gu, " ");
  return collapsed.length > 160 ? `${collapsed.slice(0, 160)}...` : collapsed;
}

function fallbackTail(summary: string, diagnostic: string | null): LocalConsoleOutputTail {
  return {
    stdoutTail: null,
    stderrTail: null,
    stdoutState: "missing",
    stderrState: "missing",
    stdoutTruncated: false,
    stderrTruncated: false,
    lastOutputSummary: summary,
    tailDiagnostic: diagnostic,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
