import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  LOCAL_CONSOLE_DEFAULT_SESSION_ID,
  type LocalConsoleMessage,
  type LocalConsoleMessageStatus,
  type LocalConsoleSpeaker,
  type LocalConsoleStore,
} from "./types.js";

interface SqliteRunResult {
  changes?: number | bigint;
  lastInsertRowid?: number | bigint;
}

interface SqliteStatement {
  run(...params: unknown[]): SqliteRunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

export interface SqliteLocalConsoleStoreOptions {
  sqlitePath: string;
  busyTimeoutMs?: number;
}

export async function createSqliteLocalConsoleStore(
  options: SqliteLocalConsoleStoreOptions,
): Promise<LocalConsoleStore> {
  await fs.mkdir(path.dirname(options.sqlitePath), { recursive: true });
  const database = new DatabaseSync(options.sqlitePath);
  return new SqliteLocalConsoleStore(database, options.sqlitePath, options.busyTimeoutMs ?? 2_000);
}

export class SqliteLocalConsoleStore implements LocalConsoleStore {
  readonly sqlitePath: string;

  constructor(
    private readonly database: SqliteDatabase,
    sqlitePath: string,
    private readonly busyTimeoutMs = 2_000,
  ) {
    this.sqlitePath = sqlitePath;
  }

  async init(): Promise<void> {
    this.database.exec(`PRAGMA busy_timeout = ${String(this.busyTimeoutMs)}`);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS local_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        speaker TEXT NOT NULL,
        role TEXT,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        run_id TEXT,
        run_dir TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    this.database.exec("CREATE INDEX IF NOT EXISTS idx_local_messages_session_id_id ON local_messages(session_id, id)");
    this.database.exec("CREATE INDEX IF NOT EXISTS idx_local_messages_session_status_id ON local_messages(session_id, status, id)");
  }

  async close(): Promise<void> {
    this.database.close();
  }

  async appendUserMessage(input: { sessionId: string; body: string; now: string }): Promise<LocalConsoleMessage> {
    const result = this.database
      .prepare(
        `INSERT INTO local_messages
          (session_id, speaker, role, body, status, run_id, run_dir, error, created_at, updated_at)
        VALUES (?, 'user', NULL, ?, 'pending', NULL, NULL, NULL, ?, ?)`,
      )
      .run(input.sessionId, input.body, input.now, input.now);
    return this.requireMessage(toNumberId(result.lastInsertRowid), input.sessionId);
  }

  async listMessages(sessionId: string): Promise<LocalConsoleMessage[]> {
    return this.database
      .prepare("SELECT * FROM local_messages WHERE session_id = ? ORDER BY id ASC")
      .all(sessionId)
      .map(readMessageRow);
  }

  async hasRunningMessage(sessionId: string): Promise<boolean> {
    return (
      this.database
        .prepare("SELECT id FROM local_messages WHERE session_id = ? AND status = 'running' ORDER BY id ASC LIMIT 1")
        .get(sessionId) !== undefined
    );
  }

  async claimNextPendingMessage(input: {
    sessionId: string;
    runId: string;
    now: string;
  }): Promise<LocalConsoleMessage | null> {
    return this.transaction(() => {
      const row = this.database
        .prepare("SELECT * FROM local_messages WHERE session_id = ? AND status = 'pending' ORDER BY id ASC LIMIT 1")
        .get(input.sessionId);
      if (row === undefined) {
        return null;
      }

      const message = readMessageRow(row);
      const result = this.database
        .prepare("UPDATE local_messages SET status = 'running', run_id = ?, error = NULL, updated_at = ? WHERE id = ? AND status = 'pending'")
        .run(input.runId, input.now, message.id);
      if (Number(result.changes ?? 0) !== 1) {
        return null;
      }

      return this.requireMessage(message.id, input.sessionId);
    });
  }

  async setRunDir(input: { id: number; runDir: string; now: string }): Promise<void> {
    this.database
      .prepare("UPDATE local_messages SET run_dir = ?, updated_at = ? WHERE id = ?")
      .run(input.runDir, input.now, input.id);
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
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO local_messages
            (session_id, speaker, role, body, status, run_id, run_dir, error, created_at, updated_at)
          VALUES (?, 'agent', ?, ?, 'displayed', ?, ?, NULL, ?, ?)`,
        )
        .run(input.sessionId, input.role, input.body, input.runId, input.runDir, input.now, input.now);
      this.database
        .prepare("UPDATE local_messages SET status = 'completed', run_id = ?, run_dir = ?, error = NULL, updated_at = ? WHERE id = ?")
        .run(input.runId, input.runDir, input.now, input.userMessageId);
    });
  }

  async recordSystemAndComplete(input: {
    userMessageId: number;
    sessionId: string;
    body: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    this.transaction(() => {
      this.insertSystemMessage(input.sessionId, input.body, input.runId, input.runDir, null, input.now);
      this.database
        .prepare("UPDATE local_messages SET status = 'completed', run_id = ?, run_dir = ?, error = NULL, updated_at = ? WHERE id = ?")
        .run(input.runId, input.runDir, input.now, input.userMessageId);
    });
  }

  async recordFailure(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    this.transaction(() => {
      this.insertSystemMessage(input.sessionId, `Codex failed: ${input.error}`, input.runId, input.runDir, input.error, input.now);
      this.database
        .prepare("UPDATE local_messages SET status = 'failed', run_id = ?, run_dir = ?, error = ?, updated_at = ? WHERE id = ?")
        .run(input.runId, input.runDir, input.error, input.now, input.userMessageId);
    });
  }

  async markStaleRunning(input: {
    sessionId: string;
    cutoffIso: string;
    now: string;
    reason: string;
  }): Promise<number> {
    const rows = this.database
      .prepare("SELECT * FROM local_messages WHERE session_id = ? AND status = 'running' AND updated_at < ? ORDER BY id ASC")
      .all(input.sessionId, input.cutoffIso)
      .map(readMessageRow);

    for (const row of rows) {
      this.database
        .prepare("UPDATE local_messages SET status = 'failed', error = ?, updated_at = ? WHERE id = ?")
        .run(input.reason, input.now, row.id);
      this.insertSystemMessage(input.sessionId, `Recovered stale local run: ${input.reason}`, row.runId, row.runDir, input.reason, input.now);
    }

    return rows.length;
  }

  private insertSystemMessage(
    sessionId: string,
    body: string,
    runId: string | null,
    runDir: string | null,
    error: string | null,
    now: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO local_messages
          (session_id, speaker, role, body, status, run_id, run_dir, error, created_at, updated_at)
        VALUES (?, 'system', NULL, ?, 'displayed', ?, ?, ?, ?, ?)`,
      )
      .run(sessionId, body, runId, runDir, error, now, now);
  }

  private requireMessage(id: number, sessionId = LOCAL_CONSOLE_DEFAULT_SESSION_ID): LocalConsoleMessage {
    const row = this.database.prepare("SELECT * FROM local_messages WHERE id = ? AND session_id = ?").get(id, sessionId);
    if (row === undefined) {
      throw new Error(`local console message not found: ${String(id)}`);
    }
    return readMessageRow(row);
  }

  private transaction<T>(body: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = body();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Keep the original error.
      }
      throw error;
    }
  }
}

function readMessageRow(row: unknown): LocalConsoleMessage {
  if (!isRecord(row)) {
    throw new Error("Invalid local console message row");
  }

  return {
    id: readNumber(row.id, "id"),
    sessionId: readString(row.session_id, "session_id"),
    speaker: readSpeaker(row.speaker),
    role: readNullableString(row.role, "role"),
    body: readString(row.body, "body"),
    status: readStatus(row.status),
    runId: readNullableString(row.run_id, "run_id"),
    runDir: readNullableString(row.run_dir, "run_dir"),
    error: readNullableString(row.error, "error"),
    createdAt: readString(row.created_at, "created_at"),
    updatedAt: readString(row.updated_at, "updated_at"),
  };
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
  if (value === "pending" || value === "running" || value === "completed" || value === "failed" || value === "displayed") {
    return value;
  }
  throw new Error(`Invalid local console message status: ${String(value)}`);
}

function toNumberId(value: number | bigint | undefined): number {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  throw new Error("SQLite insert did not return a row id");
}
