import path from "node:path";
import {
  DEFAULT_CEO_TIMEOUT_MS,
  loadCeoPersonaWithScripts,
  parseExternalCommentRouteOutput,
  type FormatExternalCommentRouteResult,
  validateExternalRouteAppendBody,
} from "../format-ceo.js";
import type { CodexRunOptions, CodexRunResult } from "../codex.js";
import type { TimelineMessage } from "../conversation.js";
import type { LocalConsoleMessage, LocalConsoleStore } from "./types.js";

export type LocalRouteJudgment = (
  input: LocalRouteJudgmentInput,
) => Promise<FormatExternalCommentRouteResult>;

export interface LocalRouteJudgmentInput {
  timeline: TimelineMessage[];
  latestMessage: LocalConsoleMessage;
  availableAgentNames: string[];
  runDir: string;
  agentsDir: string;
  timeoutMs?: number;
  runCodex?: (options: CodexRunOptions) => Promise<CodexRunResult>;
}

export interface LocalNoMentionRouteInput {
  store: LocalConsoleStore;
  message: LocalConsoleMessage;
  sessionId: string;
  timeline: TimelineMessage[];
  availableAgentNames: string[];
  runId: string;
  runDir: string | null;
  agentsDir: string;
  now: string;
  routeJudgment?: LocalRouteJudgment;
  timeoutMs?: number;
  runCodex?: (options: CodexRunOptions) => Promise<CodexRunResult>;
}

export type LocalNoMentionRouteResult =
  | { kind: "routed"; outcome: "append"; targetRole: string }
  | { kind: "processed"; outcome: "no_action" | "fail_open" | "already-routed"; reason: string }
  | { kind: "retry"; reason: string };

export async function maybeRouteLocalNoMentionMessage(
  input: LocalNoMentionRouteInput,
): Promise<LocalNoMentionRouteResult> {
  if (input.message.speaker !== "user") {
    await input.store.recordMessageProcessed({
      userMessageId: input.message.id,
      sessionId: input.sessionId,
      runId: input.runId,
      runDir: input.runDir,
      now: input.now,
    });
    return { kind: "processed", outcome: "no_action", reason: "non-user-no-route" };
  }

  const routeKey = routeKeyForLocalMessage(input.message);
  const existing = await input.store.findRouteDecision({ sessionId: input.sessionId, routeKey });
  if (existing !== null) {
    await input.store.recordMessageProcessed({
      userMessageId: input.message.id,
      sessionId: input.sessionId,
      runId: input.runId,
      runDir: input.runDir,
      now: input.now,
    });
    return { kind: "processed", outcome: "already-routed", reason: existing.reason };
  }

  const judge = input.routeJudgment ?? defaultLocalRouteJudgment;
  const routeResult = await judge({
    timeline: input.timeline,
    latestMessage: input.message,
    availableAgentNames: input.availableAgentNames,
    runDir: input.runDir ?? path.join("/tmp", `agent-moebius-local-route-${String(input.message.id)}`),
    agentsDir: input.agentsDir,
    timeoutMs: input.timeoutMs,
    runCodex: input.runCodex,
  });

  if (routeResult.action === "APPEND") {
    const validation = validateExternalRouteAppendBody(routeResult.body, input.availableAgentNames);
    if (!validation.ok) {
      return await handleFailedRouteJudgment(input, routeKey, validation.reason);
    }
    await input.store.recordRouteAppend({
      userMessageId: input.message.id,
      sessionId: input.sessionId,
      routeKey,
      body: routeResult.body,
      targetRole: validation.targetRole,
      runId: input.runId,
      runDir: input.runDir,
      now: input.now,
    });
    return { kind: "routed", outcome: "append", targetRole: validation.targetRole };
  }

  if (routeResult.action === "NO_ACTION") {
    await input.store.recordRouteNoAction({
      userMessageId: input.message.id,
      sessionId: input.sessionId,
      routeKey,
      outcome: "no_action",
      reason: routeResult.reason,
      runId: input.runId,
      runDir: input.runDir,
      now: input.now,
    });
    return { kind: "processed", outcome: "no_action", reason: routeResult.reason };
  }

  return await handleFailedRouteJudgment(input, routeKey, routeResult.reason);
}

async function handleFailedRouteJudgment(
  input: LocalNoMentionRouteInput,
  routeKey: string,
  reason: string,
): Promise<LocalNoMentionRouteResult> {
  if (isClearHandoffCandidate(input.message, input.availableAgentNames)) {
    await input.store.releaseMessageForRetry({
      userMessageId: input.message.id,
      sessionId: input.sessionId,
      now: input.now,
    });
    return { kind: "retry", reason };
  }

  await input.store.recordRouteNoAction({
    userMessageId: input.message.id,
    sessionId: input.sessionId,
    routeKey,
    outcome: "fail_open",
    reason,
    runId: input.runId,
    runDir: input.runDir,
    now: input.now,
  });
  return { kind: "processed", outcome: "fail_open", reason };
}

export function routeKeyForLocalMessage(message: LocalConsoleMessage): string {
  const prefix = message.speaker === "agent" ? "local-child-agent" : "local-message";
  return `${prefix}:${String(message.id)}`;
}

function isClearHandoffCandidate(message: LocalConsoleMessage, availableAgentNames: string[]): boolean {
  if (message.speaker !== "user") {
    return false;
  }
  const normalized = message.body.toLowerCase();
  if (/(交给|交棒|移交|handoff|route|转给|继续处理|继续推进)/i.test(message.body)) {
    return true;
  }
  return availableAgentNames.some((agent) => {
    const escaped = agent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9_-])${escaped}([^a-z0-9_-]|$)`, "i").test(normalized);
  });
}

async function defaultLocalRouteJudgment(input: LocalRouteJudgmentInput): Promise<FormatExternalCommentRouteResult> {
  const run = input.runCodex;
  if (run === undefined) {
    return { action: "FAIL_OPEN", reason: "codex-failed", detail: "missing-local-route-runner" };
  }

  let persona: string;
  try {
    persona = await loadCeoPersonaWithScripts(input.agentsDir);
  } catch (error) {
    return { action: "FAIL_OPEN", reason: "persona-load-failed", detail: formatError(error) };
  }

  const controller = new AbortController();
  let result: CodexRunResult;
  try {
    result = await withTimeout(
      run({
        prompt: buildLocalRoutePrompt({
          persona,
          timeline: input.timeline,
          latestMessage: input.latestMessage,
          availableAgentNames: input.availableAgentNames,
        }),
        runDir: `${input.runDir}-local-route`,
        mode: { kind: "full" },
        signal: controller.signal,
      }),
      input.timeoutMs ?? DEFAULT_CEO_TIMEOUT_MS,
      () => controller.abort(),
    );
  } catch (error) {
    return { action: "FAIL_OPEN", reason: "codex-failed", detail: formatError(error) };
  }

  if (!result.ok) {
    return { action: "FAIL_OPEN", reason: "codex-failed", detail: result.reason };
  }
  if (result.finalText.trim() === "") {
    return { action: "FAIL_OPEN", reason: "empty-output" };
  }

  const parsed = parseExternalCommentRouteOutput(result.finalText);
  if (parsed.kind === "invalid_json") {
    return { action: "FAIL_OPEN", reason: "invalid-json", detail: parsed.detail };
  }
  if (parsed.kind === "unknown_action") {
    return { action: "FAIL_OPEN", reason: "unknown-action", detail: parsed.detail };
  }
  if (parsed.kind === "no_action") {
    return { action: "NO_ACTION", reason: "ceo-no-action" };
  }

  const validation = validateExternalRouteAppendBody(parsed.body, input.availableAgentNames);
  if (!validation.ok) {
    return { action: "FAIL_OPEN", reason: validation.reason, detail: validation.detail };
  }
  return { action: "APPEND", body: parsed.body, targetRole: validation.targetRole, reason: "appended" };
}

function buildLocalRoutePrompt(input: {
  persona: string;
  timeline: TimelineMessage[];
  latestMessage: LocalConsoleMessage;
  availableAgentNames: string[];
}): string {
  const latest = input.timeline[input.timeline.length - 1];
  return `${input.persona.trimEnd()}

请根据以下本地对话操作台 session 上下文，对最新无 mention 本地消息做一次轻量路由判定。
这是 local-console no-trigger 兜底：如果最新消息没有明确下一步控制权移交意图，输出 no_action；如果有明确路由意图，只能输出一条 append 正文，正文必须包含且只包含一个合法 agent mention。不要使用 GitHub issue/comment/reaction 语义。

输出格式只能是以下 JSON 之一：
{"action":"no_action"}
{"action":"append","body":"<一条只含单个合法 agent mention 的追加本地消息>"}

可触发 agent:
${input.availableAgentNames.join(", ")}

localSessionId:
${input.latestMessage.sessionId}

localTimeline:
${formatLocalTimeline(input.timeline)}

latestLocalMessage:
${(latest?.body ?? input.latestMessage.body).trimEnd()}`;
}

function formatLocalTimeline(timeline: TimelineMessage[]): string {
  if (timeline.length === 0) {
    return "(none)";
  }
  return timeline
    .map((message) => `${String(message.index)} ${message.speaker}:\n${message.body.trimEnd()}`)
    .join("\n\n");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timeout = setTimeout(() => {
        onTimeout();
        reject(new Error(`local-route-timeout:${String(timeoutMs)}ms`));
      }, timeoutMs);
      promise.then(resolve, reject);
    });
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
