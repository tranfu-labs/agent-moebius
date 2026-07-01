import fs from "node:fs/promises";
import path from "node:path";
import { AGENTS_DIR } from "./config.js";
import { run as runCodex, type CodexRunResult } from "./codex.js";
import { ALL_STAGES, parseTrailingStageMarker } from "./stages.js";

export const CEO_CORRECTED_METADATA = "<!-- agent-moebius:ceo-corrected -->";
export const DEFAULT_CEO_TIMEOUT_MS = 60_000;

export interface FormatCeoInput {
  agent: string;
  originalRequest: string;
  latestResponse: string;
  lastReflectorHook: string | null;
  runDir: string;
  agentsDir?: string;
  timeoutMs?: number;
  runCodex?: typeof runCodex;
}

export type FormatCeoResult =
  | {
      action: "NO_CHANGE";
      body: string;
      reason: "already-corrected" | "ceo-no-change";
    }
  | {
      action: "REPLACE";
      body: string;
      reason: "repaired";
    }
  | {
      action: "FAIL_OPEN";
      body: string;
      reason:
        | "codex-failed"
        | "codex-timeout"
        | "empty-output"
        | "post-validate-failed"
        | "persona-load-failed";
      detail?: string;
    };

export async function formatCeoComment(input: FormatCeoInput): Promise<FormatCeoResult> {
  if (hasCeoCorrectedMetadata(input.latestResponse)) {
    return { action: "NO_CHANGE", body: input.latestResponse, reason: "already-corrected" };
  }

  let persona: string;
  try {
    persona = await fs.readFile(path.join(input.agentsDir ?? AGENTS_DIR, "ceo.md"), "utf8");
  } catch (error) {
    return {
      action: "FAIL_OPEN",
      body: input.latestResponse,
      reason: "persona-load-failed",
      detail: formatError(error),
    };
  }

  const run = input.runCodex ?? runCodex;
  const runDir = `${input.runDir}-ceo`;
  let result: CodexRunResult;
  const controller = new AbortController();
  try {
    result = await withTimeout(
      run({
        prompt: buildCeoPrompt({
          persona,
          agent: input.agent,
          originalRequest: input.originalRequest,
          latestResponse: input.latestResponse,
          lastReflectorHook: input.lastReflectorHook,
        }),
        runDir,
        mode: { kind: "full" },
        signal: controller.signal,
      }),
      input.timeoutMs ?? DEFAULT_CEO_TIMEOUT_MS,
      () => controller.abort(),
    );
  } catch (error) {
    return {
      action: "FAIL_OPEN",
      body: input.latestResponse,
      reason: error instanceof TimeoutError ? "codex-timeout" : "codex-failed",
      detail: formatError(error),
    };
  }

  if (!result.ok) {
    return {
      action: "FAIL_OPEN",
      body: input.latestResponse,
      reason: "codex-failed",
      detail: result.reason,
    };
  }

  const parsed = parseCeoOutput(result.finalText);
  if (parsed.kind === "NO_CHANGE") {
    return { action: "NO_CHANGE", body: input.latestResponse, reason: "ceo-no-change" };
  }

  if (parsed.body.trim() === "") {
    return { action: "FAIL_OPEN", body: input.latestResponse, reason: "empty-output" };
  }

  if (parseTrailingStageMarker(parsed.body, ALL_STAGES) === null) {
    return { action: "FAIL_OPEN", body: input.latestResponse, reason: "post-validate-failed" };
  }

  return {
    action: "REPLACE",
    body: appendCeoCorrectedMetadata(parsed.body),
    reason: "repaired",
  };
}

export function appendCeoCorrectedMetadata(body: string): string {
  return `${body.trimEnd()}\n\n${CEO_CORRECTED_METADATA}`;
}

export function hasCeoCorrectedMetadata(body: string): boolean {
  return body.includes(CEO_CORRECTED_METADATA);
}

export function parseCeoOutput(output: string): { kind: "NO_CHANGE" } | { kind: "REPLACE"; body: string } {
  const trimmed = output.trim();
  if (trimmed === "NO_CHANGE") {
    return { kind: "NO_CHANGE" };
  }

  const fenced = trimmed.match(/^```(?:[A-Za-z0-9_-]+)?\s*([\s\S]*?)\s*```$/);
  if (fenced?.[1]?.trim() === "NO_CHANGE") {
    return { kind: "NO_CHANGE" };
  }

  return { kind: "REPLACE", body: output.trimEnd() };
}

function buildCeoPrompt(input: {
  persona: string;
  agent: string;
  originalRequest: string;
  latestResponse: string;
  lastReflectorHook: string | null;
}): string {
  return `${input.persona.trimEnd()}

请根据以下短上下文判断是否需要校正最新 agent 响应。只能返回 NO_CHANGE，或返回校正后的完整评论正文。

输入：
agent:
${input.agent}

allowedStages:
${ALL_STAGES.join(", ")}

originalRequest:
${input.originalRequest.trimEnd()}

latestResponse:
${input.latestResponse.trimEnd()}

lastReflectorHook:
${input.lastReflectorHook?.trimEnd() ?? ""}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout();
          reject(new TimeoutError(`timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

class TimeoutError extends Error {}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
