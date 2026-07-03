import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { CODEX_EXEC_OPTIONS } from "./config.js";

export type CodexRunMode = { kind: "full" } | { kind: "resume"; threadId: string };

export interface CodexRunOptions {
  prompt: string;
  runDir: string;
  mode?: CodexRunMode;
  cwd?: string;
  signal?: AbortSignal;
  imagePaths?: string[];
}

export type CodexRunResult =
  | {
      ok: true;
      finalText: string;
      threadId: string | null;
      cachedInputTokens: number | null;
      runDir: string;
      stdoutPath: string;
      stderrPath: string;
    }
  | {
      ok: false;
      reason: string;
      runDir: string;
      stdoutPath: string;
      stderrPath: string;
    };

const INTERRUPT_TERMINATION_DELAY_MS = 5_000;

export async function run(options: CodexRunOptions): Promise<CodexRunResult> {
  const { prompt, runDir, mode = { kind: "full" }, cwd, signal, imagePaths = [] } = options;
  await fs.mkdir(runDir, { recursive: true });
  const stdoutPath = path.join(runDir, "stdout.jsonl");
  const stderrPath = path.join(runDir, "stderr.log");
  if (signal?.aborted === true) {
    return {
      ok: false,
      reason: interruptedReason(signal.reason),
      runDir,
      stdoutPath,
      stderrPath,
    };
  }

  const stdoutFile = createWriteStream(stdoutPath, { flags: "a" });
  const stderrFile = createWriteStream(stderrPath, { flags: "a" });

  const child = spawn("codex", buildCodexArgs(prompt, mode, imagePaths), {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let abortReason: string | null = null;
  let terminationTimer: NodeJS.Timeout | null = null;
  const handleAbort = () => {
    abortReason = interruptedReason(signal?.reason);
    child.kill("SIGINT");
    terminationTimer = setTimeout(() => {
      child.kill("SIGTERM");
    }, INTERRUPT_TERMINATION_DELAY_MS);
    terminationTimer.unref();
  };

  signal?.addEventListener("abort", handleAbort, { once: true });

  child.stdout.pipe(stdoutFile, { end: false });
  child.stderr.pipe(stderrFile, { end: false });

  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null } | { error: Error }>((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("close", (code, signal) => resolve({ code, signal }));
  });

  signal?.removeEventListener("abort", handleAbort);
  if (terminationTimer !== null) {
    clearTimeout(terminationTimer);
  }

  await Promise.all([finishWritable(stdoutFile), finishWritable(stderrFile)]);

  if (abortReason !== null) {
    return {
      ok: false,
      reason: abortReason,
      runDir,
      stdoutPath,
      stderrPath,
    };
  }

  if ("error" in exit) {
    return {
      ok: false,
      reason: `spawn-error:${exit.error.message}`,
      runDir,
      stdoutPath,
      stderrPath,
    };
  }

  if (exit.code !== 0) {
    const detail = exit.signal ? `signal-${exit.signal}` : `exit-code-${exit.code}`;
    return {
      ok: false,
      reason: detail,
      runDir,
      stdoutPath,
      stderrPath,
    };
  }

  const lines = (await fs.readFile(stdoutPath, "utf8")).split(/\r?\n/);
  const output = extractCodexOutput(lines);

  if (output.finalText === null) {
    return {
      ok: false,
      reason: "no-final-message",
      runDir,
      stdoutPath,
      stderrPath,
    };
  }

  return {
    ok: true,
    finalText: output.finalText,
    threadId: output.threadId,
    cachedInputTokens: output.cachedInputTokens,
    runDir,
    stdoutPath,
    stderrPath,
  };
}

export function extractFinalAssistant(lines: string[]): string | null {
  return extractCodexOutput(lines).finalText;
}

export interface CodexOutputSummary {
  finalText: string | null;
  threadId: string | null;
  cachedInputTokens: number | null;
}

export function extractCodexOutput(lines: string[]): CodexOutputSummary {
  let finalText: string | null = null;
  let threadId: string | null = null;
  let cachedInputTokens: number | null = null;

  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }

    const event = parseJsonLine(line);
    if (event === null) {
      continue;
    }

    const nextThreadId = extractThreadId(event);
    if (nextThreadId !== null) {
      threadId = nextThreadId;
    }

    const nextCachedInputTokens = extractCachedInputTokens(event);
    if (nextCachedInputTokens !== null) {
      cachedInputTokens = nextCachedInputTokens;
    }

    if (isAssistantEvent(event)) {
      const text = extractText(event);
      if (text !== null && text.length > 0) {
        finalText = text;
      }
    }
  }

  return {
    finalText,
    threadId,
    cachedInputTokens,
  };
}

export function buildCodexArgs(
  prompt: string,
  mode: CodexRunMode = { kind: "full" },
  imagePaths: string[] = [],
): string[] {
  const imageArgs = imagePaths.flatMap((imagePath) => ["--image", imagePath]);
  if (mode.kind === "resume") {
    return ["exec", "resume", ...CODEX_EXEC_OPTIONS, ...imageArgs, mode.threadId, prompt];
  }

  return ["exec", ...CODEX_EXEC_OPTIONS, ...imageArgs, prompt];
}

export function isInterruptedCodexRunResult(
  result: CodexRunResult,
): result is Extract<CodexRunResult, { ok: false }> & { reason: `interrupted:${string}` } {
  return !result.ok && result.reason.startsWith("interrupted:");
}

function parseJsonLine(line: string): unknown | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function isAssistantEvent(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : undefined;
  const role = findRole(record);

  if (role !== undefined) {
    return role === "assistant";
  }

  if (type === "agent_message" || type === "assistant_message" || type === "message") {
    return true;
  }

  for (const key of ["item", "data"]) {
    const nested = record[key];
    if (typeof nested === "object" && nested !== null && isAssistantEvent(nested)) {
      return true;
    }
  }

  return false;
}

function findRole(value: Record<string, unknown>): string | undefined {
  if (typeof value.role === "string") {
    return value.role;
  }

  for (const key of ["message", "item", "data"]) {
    const nested = value[key];
    if (typeof nested === "object" && nested !== null && "role" in nested) {
      const role = (nested as Record<string, unknown>).role;
      if (typeof role === "string") {
        return role;
      }
    }
  }

  return undefined;
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
  for (const key of ["message", "content", "text"]) {
    const text = extractText(record[key]);
    if (text !== null) {
      return text;
    }
  }

  for (const key of ["item", "data"]) {
    const text = extractText(record[key]);
    if (text !== null) {
      return text;
    }
  }

  return null;
}

function extractThreadId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.type === "thread.started" && typeof record.thread_id === "string") {
    return record.thread_id;
  }

  return null;
}

function extractCachedInputTokens(value: unknown): number | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.type !== "turn.completed") {
    return null;
  }

  const usage = record.usage;
  if (typeof usage !== "object" || usage === null) {
    return null;
  }

  const cachedInputTokens = (usage as Record<string, unknown>).cached_input_tokens;
  return typeof cachedInputTokens === "number" && Number.isFinite(cachedInputTokens) ? cachedInputTokens : null;
}

function interruptedReason(reason: unknown): string {
  if (typeof reason === "string" && reason.length > 0) {
    return `interrupted:${reason}`;
  }

  if (reason instanceof Error) {
    return `interrupted:${reason.message}`;
  }

  if (reason === undefined || reason === null) {
    return "interrupted:abort-signal";
  }

  return `interrupted:${String(reason)}`;
}

async function finishWritable(stream: NodeJS.WritableStream): Promise<void> {
  stream.end();
  await once(stream, "finish");
}
