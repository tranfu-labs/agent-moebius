import { runSqliteStateCommand } from "../sqlite-state.js";
import type { LocalConsoleSessionSummary } from "./types.js";

export interface LocalT5CommandOptions {
  sqlitePath: string;
  busyTimeoutMs?: number;
  timeoutMs?: number;
}

export interface LocalT5Facts {
  routeDecisions: unknown[];
  acceptanceFacts: unknown[];
  integrationEvents: unknown[];
  deadLetters: unknown[];
  workspaceDiffs: unknown[];
  sessionEdges: unknown[];
}

export interface LocalAcceptancePrePassRecordInput {
  sessionId: string;
  messageId: number;
  runId: string;
  taskId: string;
  role: string;
  verdict: "passed" | "failed" | "format_error" | "blocked";
  evidence: unknown;
  visibleBody: string;
  parentSessionId?: string | null;
  parentEventKey?: string | null;
  parentEventStatus?: "requested" | "completed" | "failed" | "blocked" | null;
  parentEventDetail?: unknown;
  repairChildSessionId?: string | null;
  repairTitle?: string | null;
  repairHiddenKey?: string | null;
  repairInitialBody?: string | null;
  now: string;
}

export async function createLocalChildSession(
  options: LocalT5CommandOptions,
  input: {
    parentSessionId: string;
    childSessionId: string;
    projectId: string;
    title: string;
    relation: string;
    hiddenKey: string;
    initialBody: string;
    initialRole?: string | null;
    now: string;
  },
): Promise<LocalConsoleSessionSummary> {
  return await runLocalT5Command<LocalConsoleSessionSummary>(options, {
    kind: "local-create-child-session",
    ...input,
    initialRole: input.initialRole ?? null,
  });
}

export async function recordLocalRouteDecision(
  options: LocalT5CommandOptions,
  input: {
    sessionId: string;
    messageId: number;
    routeKey: string;
    outcome: "append" | "no_action" | "fail_open" | "dead_letter";
    targetRole?: string | null;
    reason: string;
    now: string;
  },
): Promise<void> {
  await runLocalT5Command(options, {
    kind: "local-record-route-decision",
    ...input,
    targetRole: input.targetRole ?? null,
  });
}

export async function recordLocalAcceptanceFact(
  options: LocalT5CommandOptions,
  input: {
    sessionId: string;
    taskId: string;
    role: string;
    verdict: "passed" | "failed";
    evidence: unknown;
    now: string;
  },
): Promise<void> {
  await runLocalT5Command(options, {
    kind: "local-record-acceptance-fact",
    sessionId: input.sessionId,
    taskId: input.taskId,
    role: input.role,
    verdict: input.verdict,
    evidenceJson: JSON.stringify(input.evidence),
    now: input.now,
  });
}

export async function recordLocalIntegrationEvent(
  options: LocalT5CommandOptions,
  input: {
    sessionId: string;
    eventKey: string;
    status: "requested" | "completed" | "failed" | "blocked";
    detail: unknown;
    now: string;
  },
): Promise<void> {
  await runLocalT5Command(options, {
    kind: "local-record-integration-event",
    sessionId: input.sessionId,
    eventKey: input.eventKey,
    status: input.status,
    detailJson: JSON.stringify(input.detail),
    now: input.now,
  });
}

export async function recordLocalDeadLetter(
  options: LocalT5CommandOptions,
  input: {
    sessionId: string;
    sourceMessageId: number;
    failureCount: number;
    reason: string;
    recovered: boolean;
    now: string;
  },
): Promise<void> {
  await runLocalT5Command(options, {
    kind: "local-record-dead-letter",
    ...input,
  });
}

export async function recordLocalWorkspaceDiff(
  options: LocalT5CommandOptions,
  input: {
    sessionId: string;
    runId: string;
    baseRef: string;
    branchName: string;
    worktreePath: string;
    patchPath: string;
    status: "generated" | "applied" | "failed";
    error?: string | null;
    now: string;
  },
): Promise<void> {
  await runLocalT5Command(options, {
    kind: "local-record-workspace-diff",
    ...input,
    error: input.error ?? null,
  });
}

export async function recordLocalAcceptancePrePassResult(
  options: LocalT5CommandOptions,
  input: LocalAcceptancePrePassRecordInput,
): Promise<void> {
  await runLocalT5Command(options, {
    kind: "local-record-acceptance-prepass-result",
    sessionId: input.sessionId,
    messageId: input.messageId,
    runId: input.runId,
    taskId: input.taskId,
    role: input.role,
    verdict: input.verdict,
    evidenceJson: JSON.stringify(input.evidence),
    visibleBody: input.visibleBody,
    parentSessionId: input.parentSessionId ?? null,
    parentEventKey: input.parentEventKey ?? null,
    parentEventStatus: input.parentEventStatus ?? null,
    parentEventDetailJson: input.parentEventDetail === undefined || input.parentEventDetail === null
      ? null
      : JSON.stringify(input.parentEventDetail),
    repairChildSessionId: input.repairChildSessionId ?? null,
    repairTitle: input.repairTitle ?? null,
    repairHiddenKey: input.repairHiddenKey ?? null,
    repairInitialBody: input.repairInitialBody ?? null,
    now: input.now,
  });
}

export async function listLocalT5Facts(
  options: LocalT5CommandOptions,
  sessionId: string | null = null,
): Promise<LocalT5Facts> {
  return await runLocalT5Command<LocalT5Facts>(options, {
    kind: "local-list-t5-facts",
    sessionId,
  });
}

async function runLocalT5Command<T = void>(
  options: LocalT5CommandOptions,
  command: Parameters<typeof runSqliteStateCommand>[0]["command"],
): Promise<T> {
  return await runSqliteStateCommand<T>({
    sqlitePath: options.sqlitePath,
    command,
    ...(options.busyTimeoutMs === undefined ? {} : { busyTimeoutMs: options.busyTimeoutMs }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
}
