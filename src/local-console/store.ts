import fs from "node:fs/promises";
import path from "node:path";
import { LOCAL_CONSOLE_STORE_TIMEOUT_MS } from "../config.js";
import { runSqliteStateCommand, type SqliteStateCommand } from "../sqlite-state.js";
import {
  type LocalConsoleMessage,
  type LocalConsoleMessageStatus,
  type LocalConsoleSessionStatus,
  type LocalConsoleSessionSummary,
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

  async createSession(input: { sessionId: string; title: string; now: string }): Promise<LocalConsoleSessionSummary> {
    return this.run({ kind: "local-create-session", ...input });
  }

  async listSessions(): Promise<LocalConsoleSessionSummary[]> {
    return this.run({ kind: "local-list-sessions" });
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

  async recordMessageProcessed(input: {
    userMessageId: number;
    sessionId: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.run({ kind: "local-record-message-processed", ...input });
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

function normalizeResult(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeStoreRecordIfNeeded);
  }
  return normalizeStoreRecordIfNeeded(value);
}

function normalizeStoreRecordIfNeeded(value: unknown): unknown {
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
      createdAt: readString(value.createdAt, "createdAt"),
      updatedAt: readString(value.updatedAt, "updatedAt"),
    } satisfies LocalConsoleMessage;
  }
  return {
    sessionId: readString(value.sessionId, "sessionId"),
    title: readString(value.title, "title"),
    status: readSessionStatus(value.status),
    runningCount: readNumber(value.runningCount, "runningCount"),
    waitingCount: readNumber(value.waitingCount, "waitingCount"),
    stuckCount: readNumber(value.stuckCount, "stuckCount"),
    errorCount: readNumber(value.errorCount, "errorCount"),
    interruptedCount: readNumber(value.interruptedCount, "interruptedCount"),
    createdAt: readString(value.createdAt, "createdAt"),
    updatedAt: readString(value.updatedAt, "updatedAt"),
  } satisfies LocalConsoleSessionSummary;
}
