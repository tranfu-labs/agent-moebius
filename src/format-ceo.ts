import fs from "node:fs/promises";
import path from "node:path";
import { AGENTS_DIR } from "./config.js";
import { run as runCodex, type CodexRunResult } from "./codex.js";
import { ALL_STAGES, parseTrailingStageMarker } from "./stages.js";

export const CEO_CORRECTED_METADATA = "<!-- agent-moebius:ceo-corrected -->";
export const DEFAULT_CEO_TIMEOUT_MS = 300_000;

export const CEO_APPEND_ROLES = ["ceo", "dev", "dev-manager", "product-manager", "hermes-user"] as const;
export type CeoAppendRole = (typeof CEO_APPEND_ROLES)[number];

export interface CeoIssueCommentContext {
  body: string;
}

export interface CeoIssueContext {
  issueUrl: string;
  issueBody: string;
  comments: CeoIssueCommentContext[];
}

export interface FormatCeoInput {
  agent: string;
  issueContext: CeoIssueContext;
  latestResponse: string;
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
      action: "APPEND";
      body: string;
      as: CeoAppendRole;
      reason: "appended";
    }
  | {
      action: "FAIL_OPEN";
      body: string;
      reason:
        | "codex-failed"
        | "codex-timeout"
        | "empty-output"
        | "invalid-json"
        | "unknown-action"
        | "unknown-as"
        | "empty-body"
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
          issueContext: input.issueContext,
          latestResponse: input.latestResponse,
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

  if (parsed.kind === "invalid_json") {
    return { action: "FAIL_OPEN", body: input.latestResponse, reason: "invalid-json", detail: parsed.detail };
  }

  if (parsed.kind === "unknown_action") {
    return { action: "FAIL_OPEN", body: input.latestResponse, reason: "unknown-action", detail: parsed.detail };
  }

  if (parsed.kind === "no_change") {
    return { action: "NO_CHANGE", body: input.latestResponse, reason: "ceo-no-change" };
  }

  if (parsed.kind === "replace") {
    if (parsed.body.trim() === "") {
      return { action: "FAIL_OPEN", body: input.latestResponse, reason: "empty-body" };
    }
    if (parseTrailingStageMarker(parsed.body, ALL_STAGES) === null) {
      return { action: "FAIL_OPEN", body: input.latestResponse, reason: "post-validate-failed" };
    }
    return { action: "REPLACE", body: appendCeoCorrectedMetadata(parsed.body), reason: "repaired" };
  }

  // parsed.kind === "append"
  if (!isCeoAppendRole(parsed.as)) {
    return { action: "FAIL_OPEN", body: input.latestResponse, reason: "unknown-as", detail: parsed.as };
  }
  if (parsed.body.trim() === "") {
    return { action: "FAIL_OPEN", body: input.latestResponse, reason: "empty-body" };
  }
  return { action: "APPEND", body: parsed.body, as: parsed.as, reason: "appended" };
}

export function appendCeoCorrectedMetadata(body: string): string {
  return `${body.trimEnd()}\n\n${CEO_CORRECTED_METADATA}`;
}

export function hasCeoCorrectedMetadata(body: string): boolean {
  return body.includes(CEO_CORRECTED_METADATA);
}

export function isCeoAppendRole(value: string): value is CeoAppendRole {
  return (CEO_APPEND_ROLES as readonly string[]).includes(value);
}

type ParsedCeoOutput =
  | { kind: "no_change" }
  | { kind: "replace"; body: string }
  | { kind: "append"; as: string; body: string }
  | { kind: "invalid_json"; detail: string }
  | { kind: "unknown_action"; detail: string };

export function parseCeoOutput(output: string): ParsedCeoOutput {
  const raw = stripFencedCodeBlock(output.trim());

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { kind: "invalid_json", detail: formatError(error) };
  }

  if (!isPlainObject(parsed)) {
    return { kind: "invalid_json", detail: "output is not a JSON object" };
  }

  const action = parsed["action"];

  if (action === "no_change") {
    return { kind: "no_change" };
  }

  if (action === "replace") {
    const body = typeof parsed["body"] === "string" ? parsed["body"] : "";
    return { kind: "replace", body: body.trimEnd() };
  }

  if (action === "append") {
    const as = typeof parsed["as"] === "string" ? parsed["as"] : "";
    const body = typeof parsed["body"] === "string" ? parsed["body"] : "";
    return { kind: "append", as, body: body.trimEnd() };
  }

  return { kind: "unknown_action", detail: typeof action === "string" ? action : JSON.stringify(action) };
}

function stripFencedCodeBlock(text: string): string {
  const fenced = text.match(/^```(?:[A-Za-z0-9_-]+)?\s*([\s\S]*?)\s*```$/);
  return fenced?.[1]?.trim() ?? text;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildCeoPrompt(input: {
  persona: string;
  agent: string;
  issueContext: CeoIssueContext;
  latestResponse: string;
}): string {
  return `${input.persona.trimEnd()}

请根据以下完整公开 issue 上下文判断是否需要校正最新 agent 响应，并按 ceo.md 输出契约返回一个 JSON 对象。
latestResponse 是本轮唯一待发布的 agent 响应；issueContext 只用于理解用户流程、后续覆盖指令、反思 hook 历史和交付规范。

输入：
agent:
${input.agent}

allowedStages:
${ALL_STAGES.join(", ")}

issueContext.issueUrl:
${input.issueContext.issueUrl}

issueContext.issueBody:
${input.issueContext.issueBody.trimEnd()}

issueContext.comments:
${formatIssueContextComments(input.issueContext.comments)}

latestResponse:
${input.latestResponse.trimEnd()}`;
}

function formatIssueContextComments(comments: CeoIssueCommentContext[]): string {
  if (comments.length === 0) {
    return "(none)";
  }

  return comments
    .map((comment, index) => `#${index + 1} comment:\n${comment.body.trimEnd()}`)
    .join("\n\n");
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
