import fs from "node:fs/promises";
import path from "node:path";
import { LOCAL_CONSOLE_STORE_TIMEOUT_MS } from "../config.js";
import { runSqliteStateCommand, type SqliteStateCommand } from "../sqlite-state.js";
import {
  LOCAL_CONSOLE_PROJECT_ID,
  LocalConsoleSessionProjectError,
  LocalConsoleSessionRunningError,
  type LocalConsoleMessage,
  type LocalConsoleMessageStatus,
  type LocalConsoleAwaitsHumanReason,
  type MoveEmptySessionResult,
  type LocalConsoleProjectRemovalResult,
  type LocalConsoleProjectSummary,
  type LocalConsoleSessionArchiveResult,
  type LocalRouteDecisionRecord,
  type LocalConsoleSessionStatus,
  type LocalConsoleSessionSummary,
  type LocalConsoleSessionWorkspaceSource,
  type LocalConsoleAgentTeamSnapshot,
  type LocalConsoleWorkspaceMode,
  type LocalConsoleAgentTeamOwnership,
  type LocalConsoleSpeaker,
  type LocalConsoleStore,
} from "./types.js";

export interface SqliteLocalConsoleStoreOptions {
  sqlitePath: string;
  busyTimeoutMs?: number;
  timeoutMs?: number;
}

export async function createSqliteLocalConsoleStore(
  options: SqliteLocalConsoleStoreOptions,
): Promise<LocalConsoleStore> {
  await fs.mkdir(path.dirname(options.sqlitePath), { recursive: true });
  return new SqliteLocalConsoleStore(
    options.sqlitePath,
    options.busyTimeoutMs ?? 2_000,
    options.timeoutMs ?? LOCAL_CONSOLE_STORE_TIMEOUT_MS,
  );
}

export class SqliteLocalConsoleStore implements LocalConsoleStore {
  constructor(
    readonly sqlitePath: string,
    private readonly busyTimeoutMs = 2_000,
    private readonly timeoutMs = LOCAL_CONSOLE_STORE_TIMEOUT_MS,
  ) {}

  async init(): Promise<void> {
    await this.run({ kind: "local-init" });
  }

  async close(): Promise<void> {}

  async createProject(input: { folderPath: string; worktreeMode: boolean; now: string }): Promise<LocalConsoleProjectSummary> {
    return this.run({ kind: "local-create-project", ...input });
  }

  async updateProject(input: { projectId: string; worktreeMode: boolean; now: string }): Promise<LocalConsoleProjectSummary> {
    return this.run({ kind: "local-update-project", ...input });
  }

  async renameProject(input: { projectId: string; title: string; now: string }): Promise<LocalConsoleProjectSummary> {
    return this.run({ kind: "local-rename-project", ...input });
  }

  async repairProjectFolder(input: { projectId: string; folderPath: string; now: string }): Promise<LocalConsoleProjectSummary> {
    return this.run({ kind: "local-repair-project-folder", ...input });
  }

  async removeProject(input: { projectId: string; force: boolean; now: string }): Promise<LocalConsoleProjectRemovalResult> {
    return this.run({ kind: "local-remove-project", ...input });
  }

  async reorderProjects(projectIds: string[]): Promise<LocalConsoleProjectSummary[]> {
    return this.run({ kind: "local-reorder-projects", projectIds });
  }

  async listProjects(): Promise<LocalConsoleProjectSummary[]> {
    return this.run({ kind: "local-list-projects" });
  }

  async getSessionWorkspace(sessionId: string): Promise<LocalConsoleSessionWorkspaceSource> {
    return this.run({ kind: "local-get-session-workspace", sessionId });
  }

  async switchSessionWorkspace(input: {
    sessionId: string;
    workspaceMode: LocalConsoleWorkspaceMode;
    now: string;
  }): Promise<LocalConsoleSessionSummary> {
    return this.run({ kind: "local-switch-session-workspace", ...input });
  }

  async switchSessionTeam(input: {
    sessionId: string;
    agentTeamOwnership: LocalConsoleAgentTeamOwnership;
    agentTeamId: string;
    agentTeamSnapshot?: LocalConsoleAgentTeamSnapshot;
    now: string;
  }): Promise<LocalConsoleSessionSummary> {
    return this.run({ kind: "local-switch-session-team", ...input });
  }

  async applyPendingSessionContext(input: { sessionId: string; now: string }): Promise<LocalConsoleSessionSummary> {
    return this.run({ kind: "local-apply-pending-session-context", ...input });
  }

  async listSessionAgentTeamSnapshot(sessionId: string): Promise<LocalConsoleAgentTeamSnapshot | null> {
    return this.run({ kind: "local-list-session-agent-team-snapshot", sessionId });
  }

  async recordProjectWorkspaceStatus(input: {
    projectId: string;
    cwd: string;
    mode: "direct" | "worktree";
    worktreePath: string | null;
    worktreeUnavailableReason: string | null;
    now: string;
  }): Promise<void> {
    await this.run({ kind: "local-record-project-workspace-status", ...input });
  }

  async createSession(input: {
    sessionId: string;
    projectId?: string;
    title: string;
    agentTeamOwnership?: "system" | "user";
    agentTeamId?: string;
    agentTeamSnapshot?: LocalConsoleAgentTeamSnapshot;
    initialMessage?: string;
    now: string;
  }): Promise<LocalConsoleSessionSummary> {
    return this.run({ kind: "local-create-session", ...input, projectId: input.projectId ?? LOCAL_CONSOLE_PROJECT_ID });
  }

  async moveEmptySessionToProject(input: {
    sessionId: string;
    projectId: string;
    now: string;
  }): Promise<LocalConsoleSessionSummary> {
    const result = await this.run<MoveEmptySessionResult>({
      kind: "local-move-empty-session",
      ...input,
    });
    if (!result.ok) {
      throw new LocalConsoleSessionProjectError(result.code);
    }
    return result.session;
  }

  async archiveSession(input: { sessionId: string; now: string }): Promise<LocalConsoleSessionArchiveResult> {
    try {
      return await this.run({ kind: "local-archive-session", ...input });
    } catch (error) {
      if (error instanceof Error && error.message.includes("SESSION_HAS_RUNNING_AGENT")) {
        throw new LocalConsoleSessionRunningError();
      }
      throw error;
    }
  }

  async restoreSession(input: { sessionId: string; now: string }): Promise<LocalConsoleSessionSummary> {
    return this.run({ kind: "local-restore-session", ...input });
  }

  async listSessions(): Promise<LocalConsoleSessionSummary[]> {
    return this.run({ kind: "local-list-sessions" });
  }

  async markSessionResultRead(input: { sessionId: string; unreadSince: string; now: string }): Promise<boolean> {
    return this.run({ kind: "local-mark-session-result-read", ...input });
  }

  async appendUserMessage(input: { sessionId: string; body: string; now: string }): Promise<LocalConsoleMessage> {
    return this.run({ kind: "local-append-user", ...input });
  }

  async listMessages(sessionId: string): Promise<LocalConsoleMessage[]> {
    return this.run({ kind: "local-list", sessionId });
  }

  async hasRunningMessage(sessionId: string): Promise<boolean> {
    return this.run({ kind: "local-has-running", sessionId });
  }

  async claimNextPendingMessage(input: {
    sessionId: string;
    runId: string;
    now: string;
  }): Promise<LocalConsoleMessage | null> {
    return this.run({ kind: "local-claim-next", ...input });
  }

  async setRunDir(input: { id: number; runDir: string; now: string }): Promise<void> {
    await this.run({ kind: "local-set-run-dir", ...input });
  }

  async recordAgentResponse(input: {
    userMessageId: number;
    sessionId: string;
    role: string;
    body: string;
    runId: string;
    runDir: string;
    now: string;
  }): Promise<void> {
    await this.run({ kind: "local-record-agent-response", ...input });
  }

  async recordSystemAndComplete(input: {
    userMessageId: number;
    sessionId: string;
    body: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.run({ kind: "local-record-system-and-complete", ...input });
  }

  async recordSystemMessage(input: {
    sessionId: string;
    body: string;
    runId: string | null;
    runDir: string | null;
    error: string | null;
    status?: "displayed" | "failed" | "stuck";
    now: string;
  }): Promise<void> {
    await this.run({ kind: "local-record-system", ...input });
  }

  async recordMessageProcessed(input: {
    userMessageId: number;
    sessionId: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.run({ kind: "local-record-message-processed", ...input });
  }

  async findRouteDecision(input: { sessionId: string; routeKey: string }): Promise<LocalRouteDecisionRecord | null> {
    return this.run({ kind: "local-find-route-decision", ...input });
  }

  async recordRouteAppend(input: {
    userMessageId: number;
    sessionId: string;
    routeKey: string;
    body: string;
    targetRole: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.run({ kind: "local-record-route-append", ...input });
  }

  async recordRouteNoAction(input: {
    userMessageId: number;
    sessionId: string;
    routeKey: string;
    outcome: "no_action" | "fail_open" | "dead_letter";
    reason: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.run({ kind: "local-record-route-no-action", ...input });
  }

  async releaseMessageForRetry(input: { userMessageId: number; sessionId: string; now: string }): Promise<void> {
    await this.run({ kind: "local-release-message-for-retry", ...input });
  }

  async recordFailure(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.run({ kind: "local-record-failure", ...input });
  }

  async recordRetryableFailure(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<LocalConsoleMessage> {
    return this.run({ kind: "local-record-retryable-failure", ...input });
  }

  async recordDeadLetter(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    failureCount: number;
    now: string;
  }): Promise<void> {
    await this.run({ kind: "local-record-dead-letter-and-complete", ...input });
  }

  async recordInterrupted(input: {
    userMessageId: number;
    sessionId: string;
    reason: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.run({ kind: "local-record-interrupted", ...input });
  }

  async recordStuck(input: {
    userMessageId: number;
    sessionId: string;
    reason: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.run({ kind: "local-record-stuck", ...input });
  }

  async markStaleRunning(input: {
    sessionId: string;
    cutoffIso: string;
    now: string;
    reason: string;
  }): Promise<number> {
    return this.run({ kind: "local-mark-stale-running", ...input });
  }

  private async run<T>(command: SqliteStateCommand): Promise<T> {
    const result = await runSqliteStateCommand<unknown>({
      sqlitePath: this.sqlitePath,
      busyTimeoutMs: this.busyTimeoutMs,
      timeoutMs: this.timeoutMs,
      command,
    });
    return normalizeResult(result) as T;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid local console message ${field}`);
  }
  return value;
}

function readNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return readString(value, field);
}

function readNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid local console message ${field}`);
  }
  return value;
}

function readSpeaker(value: unknown): LocalConsoleSpeaker {
  if (value === "user" || value === "agent" || value === "system") {
    return value;
  }
  throw new Error(`Invalid local console message speaker: ${String(value)}`);
}

function readStatus(value: unknown): LocalConsoleMessageStatus {
  if (
    value === "pending" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "interrupted" ||
    value === "stuck" ||
    value === "displayed"
  ) {
    return value;
  }
  throw new Error(`Invalid local console message status: ${String(value)}`);
}

function readSessionStatus(value: unknown): LocalConsoleSessionStatus {
  if (
    value === "idle" ||
    value === "running" ||
    value === "waiting" ||
    value === "stuck" ||
    value === "failed" ||
    value === "interrupted"
  ) {
    return value;
  }
  throw new Error(`Invalid local console session status: ${String(value)}`);
}

function normalizeRouteDecision(value: unknown): LocalRouteDecisionRecord | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error("Invalid local route decision");
  }
  return {
    sessionId: readString(value.sessionId, "sessionId"),
    messageId: readNumber(value.messageId, "messageId"),
    routeKey: readString(value.routeKey, "routeKey"),
    outcome: readRouteDecisionOutcome(value.outcome),
    targetRole: readNullableString(value.targetRole, "targetRole"),
    reason: readString(value.reason, "reason"),
    createdAt: readString(value.createdAt, "createdAt"),
  };
}

function readRouteDecisionOutcome(value: unknown): LocalRouteDecisionRecord["outcome"] {
  if (value === "append" || value === "no_action" || value === "fail_open" || value === "dead_letter") {
    return value;
  }
  throw new Error(`Invalid local route decision outcome: ${String(value)}`);
}

function normalizeResult(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeStoreRecordIfNeeded);
  }
  return normalizeStoreRecordIfNeeded(value);
}

function normalizeStoreRecordIfNeeded(value: unknown): unknown {
  if (isRecord(value) && "routeKey" in value && "outcome" in value) {
    return normalizeRouteDecision(value);
  }
  if (isRecord(value) && "selectedSessionId" in value && "sessionId" in value && "projectId" in value) {
    return {
      sessionId: readString(value.sessionId, "sessionId"),
      projectId: readString(value.projectId, "projectId"),
      selectedSessionId: readNullableString(value.selectedSessionId, "selectedSessionId"),
    } satisfies LocalConsoleSessionArchiveResult;
  }
  if (!isRecord(value) || !("sessionId" in value)) {
    return value;
  }
  if ("speaker" in value) {
    return {
      id: readNumber(value.id, "id"),
      sessionId: readString(value.sessionId, "sessionId"),
      speaker: readSpeaker(value.speaker),
      role: readNullableString(value.role, "role"),
      body: readString(value.body, "body"),
      status: readStatus(value.status),
      runId: readNullableString(value.runId, "runId"),
      runDir: readNullableString(value.runDir, "runDir"),
      error: readNullableString(value.error, "error"),
      failureCount: "failureCount" in value ? readNumber(value.failureCount, "failureCount") : 0,
      lastFailureReason: "lastFailureReason" in value ? readNullableString(value.lastFailureReason, "lastFailureReason") : null,
      createdAt: readString(value.createdAt, "createdAt"),
      updatedAt: readString(value.updatedAt, "updatedAt"),
    } satisfies LocalConsoleMessage;
  }
  return {
    sessionId: readString(value.sessionId, "sessionId"),
    projectId: readString(value.projectId, "projectId"),
    parentSessionId: "parentSessionId" in value ? readNullableString(value.parentSessionId, "parentSessionId") : null,
    agentTeamOwnership: "agentTeamOwnership" in value
      ? readNullableAgentTeamOwnership(value.agentTeamOwnership)
      : null,
    agentTeamId: "agentTeamId" in value ? readNullableString(value.agentTeamId, "agentTeamId") : null,
    agentTeamPendingOwnership: "agentTeamPendingOwnership" in value
      ? readNullableAgentTeamOwnership(value.agentTeamPendingOwnership)
      : null,
    agentTeamPendingId: "agentTeamPendingId" in value
      ? readNullableString(value.agentTeamPendingId, "agentTeamPendingId")
      : null,
    workspaceMode: "workspaceMode" in value ? readWorkspaceMode(value.workspaceMode, "workspaceMode") : "direct",
    workspacePendingMode: "workspacePendingMode" in value
      ? readNullableWorkspaceMode(value.workspacePendingMode, "workspacePendingMode")
      : null,
    workspaceUnavailableReason: "workspaceUnavailableReason" in value
      ? readNullableString(value.workspaceUnavailableReason, "workspaceUnavailableReason")
      : null,
    branchName: "branchName" in value ? readNullableString(value.branchName, "branchName") : null,
    title: readString(value.title, "title"),
    status: readSessionStatus(value.status),
    awaitsHumanReason: readAwaitsHumanReason(value.awaitsHumanReason),
    unreadSince: readNullableString(value.unreadSince, "unreadSince"),
    runningCount: readNumber(value.runningCount, "runningCount"),
    waitingCount: readNumber(value.waitingCount, "waitingCount"),
    stuckCount: readNumber(value.stuckCount, "stuckCount"),
    errorCount: readNumber(value.errorCount, "errorCount"),
    interruptedCount: readNumber(value.interruptedCount, "interruptedCount"),
    childCount: "childCount" in value ? readNumber(value.childCount, "childCount") : 0,
    createdAt: readString(value.createdAt, "createdAt"),
    updatedAt: readString(value.updatedAt, "updatedAt"),
  } satisfies LocalConsoleSessionSummary;
}

function readNullableAgentTeamOwnership(value: unknown): "system" | "user" | null {
  if (value === null || value === "system" || value === "user") {
    return value;
  }
  throw new Error(`Invalid local console agent team ownership: ${String(value)}`);
}

function readWorkspaceMode(value: unknown, field: string): "direct" | "worktree" {
  const mode = readString(value, field);
  if (mode === "direct" || mode === "worktree") {
    return mode;
  }
  throw new Error(`Invalid local console ${field}: ${String(value)}`);
}

function readNullableWorkspaceMode(value: unknown, field: string): "direct" | "worktree" | null {
  if (value === null) {
    return null;
  }
  return readWorkspaceMode(value, field);
}

function readAwaitsHumanReason(value: unknown): LocalConsoleAwaitsHumanReason | null {
  if (value === null) {
    return null;
  }
  if (value === "answer" || value === "confirmation" || value === "acceptance" || value === "exception") {
    return value;
  }
  throw new Error(`Invalid local console awaits human reason: ${String(value)}`);
}
