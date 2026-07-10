import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";
import { issueKeyToSessionId, parseIssueKey, sessionIdToIssueKey } from "./session-key.js";
import {
  LOCAL_CONSOLE_DEFAULT_SESSION_ID,
  LOCAL_CONSOLE_PROJECT_ID,
  LOCAL_CONSOLE_PROJECT_SOURCE_TYPE,
} from "./local-console/types.js";
import type { SqliteStateCommand, SqliteStateSource } from "./sqlite-state.js";

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

interface WorkerInput {
  sqlitePath: string;
  busyTimeoutMs: number;
  command: SqliteStateCommand;
  readOnly: boolean;
}

interface WorkerLocalMessage {
  id: number;
  sessionId: string;
  speaker: string;
  role: string | null;
  body: string;
  status: string;
  runId: string | null;
  runDir: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

try {
  const input = workerData as WorkerInput;
  const result = runCommand(input);
  parentPort?.postMessage({ ok: true, result });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    error: {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
  });
}

function runCommand(input: WorkerInput): unknown {
  if (!input.readOnly) {
    fs.mkdirSync(path.dirname(input.sqlitePath), { recursive: true });
  }
  const database = new DatabaseSync(input.sqlitePath, { readOnly: input.readOnly });
  try {
    database.exec(`PRAGMA busy_timeout = ${String(input.busyTimeoutMs)}`);
    database.exec("PRAGMA foreign_keys = ON");
    if (!input.readOnly) {
      ensureSchema(database, input.sqlitePath);
      migrateLocalMessages(database);
    }

    switch (input.command.kind) {
      case "get-migration-status":
        return getMigrationStatus(database, input.command.source);
      case "import-role-threads":
        return importRoleThreads(database, input.command.store, input.command.legacyDigest);
      case "load-role-threads":
        return loadRoleThreads(database);
      case "save-role-threads":
        return replaceRoleThreads(database, input.command.store, true);
      case "save-role-thread-entry":
        return saveRoleThreadEntry(database, input.command.issueKey, input.command.role, input.command.state);
      case "import-agent-contexts":
        return importAgentContexts(database, input.command.store, input.command.legacyDigest);
      case "load-agent-contexts":
        return loadAgentContexts(database);
      case "save-agent-contexts":
        return replaceAgentContexts(database, input.command.store, true);
      case "save-agent-context-entry":
        return saveAgentContextEntry(database, input.command.issueKey, input.command.role, input.command.state);
      case "import-github-intake":
        return importGitHubIntake(database, input.command.state, input.command.legacyDigest);
      case "load-github-intake":
        return loadGitHubIntake(database);
      case "save-github-intake":
        return replaceGitHubIntake(database, input.command.state, true);
      case "import-goal-ledger":
        return importGoalLedger(database, input.command.state, input.command.legacyDigest);
      case "load-goal-ledger":
        return loadGoalLedger(database);
      case "save-goal-ledger":
        return saveGoalLedger(database, input.command.state, true);
      case "local-init":
        return initLocalConsole(database);
      case "local-create-project":
        return createLocalProject(database, input.command);
      case "local-update-project":
        return updateLocalProject(database, input.command);
      case "local-list-projects":
        return listLocalProjects(database);
      case "local-get-session-workspace":
        return getLocalSessionWorkspace(database, input.command.sessionId);
      case "local-record-project-workspace-status":
        return recordLocalProjectWorkspaceStatus(database, input.command);
      case "local-create-session":
        return createLocalSession(database, input.command);
      case "local-list-sessions":
        return listLocalSessions(database);
      case "local-append-user":
        return appendUserMessage(database, input.command);
      case "local-list":
        return listLocalMessages(database, input.command.sessionId);
      case "local-has-running":
        return hasRunningMessage(database, input.command.sessionId);
      case "local-claim-next":
        return claimNextPendingMessage(database, input.command);
      case "local-set-run-dir":
        return setRunDir(database, input.command);
      case "local-record-message-processed":
        return recordMessageProcessed(database, input.command);
      case "local-release-message-for-retry":
        return releaseMessageForRetry(database, input.command);
      case "local-record-agent-response":
        return recordAgentResponse(database, input.command);
      case "local-record-system-and-complete":
        return recordSystemAndComplete(database, input.command);
      case "local-record-failure":
        return recordFailure(database, input.command);
      case "local-record-interrupted":
        return recordInterrupted(database, input.command);
      case "local-record-stuck":
        return recordStuck(database, input.command);
      case "local-mark-stale-running":
        return markStaleRunning(database, input.command);
      default:
        assertNever(input.command);
    }
  } finally {
    database.close();
  }
}

function ensureSchema(database: SqliteDatabase, sqlitePath: string): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS legacy_migration_sources (
      source TEXT PRIMARY KEY,
      legacy_digest TEXT,
      status TEXT NOT NULL,
      imported_at TEXT,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      title TEXT NOT NULL,
      folder_path TEXT NOT NULL UNIQUE,
      worktree_mode INTEGER NOT NULL DEFAULT 0,
      workspace_cwd TEXT,
      workspace_mode TEXT CHECK (workspace_mode IS NULL OR workspace_mode IN ('direct', 'worktree')),
      worktree_path TEXT,
      worktree_unavailable_reason TEXT,
      workspace_updated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(project_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      source_type TEXT NOT NULL,
      source_owner TEXT,
      source_repo TEXT,
      source_issue_number INTEGER,
      parent_session_id TEXT,
      title TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (source_type <> 'local' OR project_id IS NOT NULL)
    );
    CREATE TABLE IF NOT EXISTS session_edges (
      parent_session_id TEXT NOT NULL,
      child_session_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(parent_session_id, child_session_id, relation)
    );
    CREATE TABLE IF NOT EXISTS session_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      speaker TEXT NOT NULL,
      role TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      run_id TEXT,
      run_dir TEXT,
      error TEXT,
      source_kind TEXT,
      source_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_messages_session_id_id ON session_messages(session_id, id);
    CREATE INDEX IF NOT EXISTS idx_session_messages_session_status_id ON session_messages(session_id, status, id);
    CREATE TABLE IF NOT EXISTS local_message_cursors (
      session_id TEXT PRIMARY KEY,
      processed_through_message_id INTEGER NOT NULL DEFAULT 0,
      active_message_id INTEGER,
      active_run_id TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_role_threads (
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      last_seen_index INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(session_id, role)
    );
    CREATE TABLE IF NOT EXISTS session_agent_contexts (
      session_id TEXT NOT NULL,
      context_key TEXT NOT NULL,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(session_id, context_key)
    );
    CREATE TABLE IF NOT EXISTS github_intake_repositories (
      repo_key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS github_intake_issues (
      session_id TEXT PRIMARY KEY,
      issue_key TEXT NOT NULL UNIQUE,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goal_ledger_documents (
      document_key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const now = new Date().toISOString();
  ensureDefaultLocalProject(database, defaultLocalProjectFolderPath(sqlitePath), now);
  migrateSessionsProjectId(database, now);
  markSchemaMigration(database, "t3-unified-sqlite-state");
  markSchemaMigration(database, "t46-local-project-workspace-source");
}

function migrateSessionsProjectId(database: SqliteDatabase, now: string): void {
  if (tableHasColumn(database, "sessions", "project_id")) {
    return;
  }
  transaction(database, () => {
    database.exec("ALTER TABLE sessions RENAME TO sessions_legacy_project_migration");
    database.exec(`
      CREATE TABLE sessions (
        session_id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(project_id) ON UPDATE CASCADE ON DELETE RESTRICT,
        source_type TEXT NOT NULL,
        source_owner TEXT,
        source_repo TEXT,
        source_issue_number INTEGER,
        parent_session_id TEXT,
        title TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (source_type <> 'local' OR project_id IS NOT NULL)
      );
      INSERT INTO sessions
        (session_id, project_id, source_type, source_owner, source_repo, source_issue_number, parent_session_id, title, status, created_at, updated_at)
      SELECT
        session_id,
        CASE WHEN source_type = 'local' THEN '${LOCAL_CONSOLE_PROJECT_ID}' ELSE NULL END,
        source_type,
        source_owner,
        source_repo,
        source_issue_number,
        parent_session_id,
        title,
        status,
        created_at,
        updated_at
      FROM sessions_legacy_project_migration;
      DROP TABLE sessions_legacy_project_migration;
    `);
    markSchemaMigration(database, "t46-sessions-project-id");
    database
      .prepare("UPDATE projects SET updated_at = ? WHERE project_id = ?")
      .run(now, LOCAL_CONSOLE_PROJECT_ID);
    return null;
  });
}

function tableHasColumn(database: SqliteDatabase, tableName: string, columnName: string): boolean {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => isRecord(row) && row.name === columnName);
}

function defaultLocalProjectFolderPath(sqlitePath: string): string {
  const stateDir = path.dirname(sqlitePath);
  return path.basename(stateDir) === ".state" ? path.dirname(stateDir) : stateDir;
}

function ensureDefaultLocalProject(database: SqliteDatabase, folderPath: string, now: string): void {
  const normalizedFolderPath = path.resolve(folderPath);
  const title = projectTitleFromFolder(normalizedFolderPath);
  database
    .prepare(
      `INSERT OR IGNORE INTO projects
        (project_id, source_type, title, folder_path, worktree_mode, workspace_cwd, workspace_mode, worktree_path, worktree_unavailable_reason, workspace_updated_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, 'direct', NULL, NULL, ?, ?, ?)`,
    )
    .run(LOCAL_CONSOLE_PROJECT_ID, LOCAL_CONSOLE_PROJECT_SOURCE_TYPE, title, normalizedFolderPath, normalizedFolderPath, now, now, now);
}

function migrateLocalMessages(database: SqliteDatabase): void {
  const legacyTable = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'local_messages'")
    .get();
  if (legacyTable === undefined) {
    return;
  }
  transaction(database, () => {
    const now = new Date().toISOString();
    ensureSession(database, LOCAL_CONSOLE_DEFAULT_SESSION_ID, now, "默认会话", LOCAL_CONSOLE_PROJECT_ID);
    database.exec(`
      INSERT OR IGNORE INTO session_messages
        (id, session_id, speaker, role, body, status, run_id, run_dir, error, source_kind, source_id, created_at, updated_at)
      SELECT id, session_id, speaker, role, body, status, run_id, run_dir, error, 'local-message', CAST(id AS TEXT), created_at, updated_at
      FROM local_messages
    `);
    markMigrationImported(database, "local-messages", null);
  });
}

function getMigrationStatus(database: SqliteDatabase, source: SqliteStateSource): { status: string | null } {
  const row = database.prepare("SELECT status FROM legacy_migration_sources WHERE source = ?").get(source);
  if (!isRecord(row)) {
    return { status: null };
  }
  return { status: readString(row.status, "status") };
}

function importRoleThreads(database: SqliteDatabase, store: unknown, legacyDigest: string | null): null {
  return transaction(database, () => {
    assertTargetEmptyForImport(database, "role-threads", "SELECT COUNT(*) AS count FROM session_role_threads");
    replaceRoleThreadsRaw(database, store, false);
    markMigrationImported(database, "role-threads", legacyDigest);
    return null;
  });
}

function loadRoleThreads(database: SqliteDatabase): unknown {
  const rows = database.prepare("SELECT * FROM session_role_threads ORDER BY session_id ASC, role ASC").all();
  const store: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }
    const issueKey = sessionIdToIssueKey(readString(row.session_id, "session_id"));
    const role = readString(row.role, "role");
    store[issueKey] = {
      ...(store[issueKey] ?? {}),
      [role]: {
        threadId: readString(row.thread_id, "thread_id"),
        lastSeenIndex: readNumber(row.last_seen_index, "last_seen_index"),
      },
    };
  }
  return store;
}

function replaceRoleThreads(database: SqliteDatabase, store: unknown, markImported: boolean): null {
  return transaction(database, () => {
    replaceRoleThreadsRaw(database, store, markImported);
    return null;
  });
}

function replaceRoleThreadsRaw(database: SqliteDatabase, store: unknown, markImported: boolean): void {
  database.exec("DELETE FROM session_role_threads");
  const now = new Date().toISOString();
  for (const [issueKey, roles] of entriesObject(store)) {
    for (const [role, state] of entriesObject(roles)) {
      saveRoleThreadEntryRaw(database, issueKey, role, state, now);
    }
  }
  if (markImported) {
    markMigrationImported(database, "role-threads", null);
  }
}

function saveRoleThreadEntry(database: SqliteDatabase, issueKey: string, role: string, state: unknown): null {
  return transaction(database, () => {
    saveRoleThreadEntryRaw(database, issueKey, role, state, new Date().toISOString());
    markMigrationImported(database, "role-threads", null);
    return null;
  });
}

function saveRoleThreadEntryRaw(database: SqliteDatabase, issueKey: string, role: string, state: unknown, now: string): void {
  if (!isRecord(state)) {
    throw new Error("Invalid role thread state payload");
  }
  const sessionId = issueKeyToSessionId(issueKey);
  ensureSession(database, sessionId, now);
  database
    .prepare(
      `INSERT INTO session_role_threads (session_id, role, thread_id, last_seen_index, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id, role)
       DO UPDATE SET thread_id = excluded.thread_id, last_seen_index = excluded.last_seen_index, updated_at = excluded.updated_at`,
    )
    .run(sessionId, role, readString(state.threadId, "threadId"), readNumber(state.lastSeenIndex, "lastSeenIndex"), now);
}

function importAgentContexts(database: SqliteDatabase, store: unknown, legacyDigest: string | null): null {
  return transaction(database, () => {
    assertTargetEmptyForImport(database, "agent-contexts", "SELECT COUNT(*) AS count FROM session_agent_contexts");
    replaceAgentContextsRaw(database, store, false);
    markMigrationImported(database, "agent-contexts", legacyDigest);
    return null;
  });
}

function loadAgentContexts(database: SqliteDatabase): unknown {
  const rows = database.prepare("SELECT * FROM session_agent_contexts ORDER BY session_id ASC, context_key ASC").all();
  const store: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }
    const issueKey = sessionIdToIssueKey(readString(row.session_id, "session_id"));
    const key = readString(row.context_key, "context_key");
    store[issueKey] = {
      ...(store[issueKey] ?? {}),
      [key]: JSON.parse(readString(row.json, "json")),
    };
  }
  return store;
}

function replaceAgentContexts(database: SqliteDatabase, store: unknown, markImported: boolean): null {
  return transaction(database, () => {
    replaceAgentContextsRaw(database, store, markImported);
    return null;
  });
}

function replaceAgentContextsRaw(database: SqliteDatabase, store: unknown, markImported: boolean): void {
  database.exec("DELETE FROM session_agent_contexts");
  const now = new Date().toISOString();
  for (const [issueKey, contexts] of entriesObject(store)) {
    for (const [key, state] of entriesObject(contexts)) {
      saveAgentContextEntryRaw(database, issueKey, key, state, now);
    }
  }
  if (markImported) {
    markMigrationImported(database, "agent-contexts", null);
  }
}

function saveAgentContextEntry(database: SqliteDatabase, issueKey: string, role: string, state: unknown): null {
  return transaction(database, () => {
    saveAgentContextEntryRaw(database, issueKey, role, state, new Date().toISOString());
    markMigrationImported(database, "agent-contexts", null);
    return null;
  });
}

function saveAgentContextEntryRaw(database: SqliteDatabase, issueKey: string, key: string, state: unknown, now: string): void {
  const sessionId = issueKeyToSessionId(issueKey);
  ensureSession(database, sessionId, now);
  database
    .prepare(
      `INSERT INTO session_agent_contexts (session_id, context_key, json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id, context_key)
       DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
    )
    .run(sessionId, key, JSON.stringify(state), now);
}

function importGitHubIntake(database: SqliteDatabase, state: unknown, legacyDigest: string | null): null {
  return transaction(database, () => {
    assertTargetEmptyForImport(database, "github-intake", "SELECT COUNT(*) AS count FROM github_intake_repositories UNION ALL SELECT COUNT(*) AS count FROM github_intake_issues");
    replaceGitHubIntakeRaw(database, state, false);
    markMigrationImported(database, "github-intake", legacyDigest);
    return null;
  });
}

function loadGitHubIntake(database: SqliteDatabase): unknown {
  const repositories: Record<string, unknown> = {};
  for (const row of database.prepare("SELECT repo_key, json FROM github_intake_repositories ORDER BY repo_key ASC").all()) {
    if (isRecord(row)) {
      repositories[readString(row.repo_key, "repo_key")] = JSON.parse(readString(row.json, "json"));
    }
  }

  const issues: Record<string, unknown> = {};
  for (const row of database.prepare("SELECT issue_key, json FROM github_intake_issues ORDER BY issue_key ASC").all()) {
    if (isRecord(row)) {
      issues[readString(row.issue_key, "issue_key")] = JSON.parse(readString(row.json, "json"));
    }
  }

  return { repositories, issues };
}

function replaceGitHubIntake(database: SqliteDatabase, state: unknown, markImported: boolean): null {
  return transaction(database, () => {
    replaceGitHubIntakeRaw(database, state, markImported);
    return null;
  });
}

function replaceGitHubIntakeRaw(database: SqliteDatabase, state: unknown, markImported: boolean): void {
  if (!isRecord(state)) {
    throw new Error("Invalid GitHub intake payload");
  }
  database.exec("DELETE FROM github_intake_repositories");
  database.exec("DELETE FROM github_intake_issues");
  const now = new Date().toISOString();
  for (const [repoKey, repositoryState] of entriesObject(state.repositories)) {
    database
      .prepare(
        `INSERT INTO github_intake_repositories (repo_key, json, updated_at)
         VALUES (?, ?, ?)`,
      )
      .run(repoKey, JSON.stringify(repositoryState), now);
  }
  for (const [issueKey, issueState] of entriesObject(state.issues)) {
    const sessionId = issueKeyToSessionId(issueKey);
    ensureSession(database, sessionId, now);
    database
      .prepare(
        `INSERT INTO github_intake_issues (session_id, issue_key, json, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(sessionId, issueKey, JSON.stringify(issueState), now);
  }
  if (markImported) {
    markMigrationImported(database, "github-intake", null);
  }
}

function importGoalLedger(database: SqliteDatabase, state: unknown, legacyDigest: string | null): null {
  return transaction(database, () => {
    assertTargetEmptyForImport(database, "goal-ledger", "SELECT COUNT(*) AS count FROM goal_ledger_documents");
    saveGoalLedgerRaw(database, state, false);
    markMigrationImported(database, "goal-ledger", legacyDigest);
    return null;
  });
}

function loadGoalLedger(database: SqliteDatabase): unknown | null {
  const row = database.prepare("SELECT json FROM goal_ledger_documents WHERE document_key = 'default'").get();
  if (!isRecord(row)) {
    return null;
  }
  return JSON.parse(readString(row.json, "json"));
}

function saveGoalLedger(database: SqliteDatabase, state: unknown, markImported: boolean): null {
  return transaction(database, () => {
    saveGoalLedgerRaw(database, state, markImported);
    return null;
  });
}

function saveGoalLedgerRaw(database: SqliteDatabase, state: unknown, markImported: boolean): void {
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO goal_ledger_documents (document_key, json, updated_at)
       VALUES ('default', ?, ?)
       ON CONFLICT(document_key)
       DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
    )
    .run(JSON.stringify(state), now);
  if (markImported) {
    markMigrationImported(database, "goal-ledger", null);
  }
}

function initLocalConsole(database: SqliteDatabase): null {
  const now = new Date().toISOString();
  ensureSession(database, LOCAL_CONSOLE_DEFAULT_SESSION_ID, now, "默认会话", LOCAL_CONSOLE_PROJECT_ID);
  ensureLocalCursor(database, LOCAL_CONSOLE_DEFAULT_SESSION_ID, now);
  return null;
}

function createLocalProject(
  database: SqliteDatabase,
  input: Extract<SqliteStateCommand, { kind: "local-create-project" }>,
): unknown {
  return transaction(database, () => {
    const folderPath = path.resolve(input.folderPath);
    const projectId = projectIdForFolder(folderPath);
    database
      .prepare(
        `INSERT INTO projects
          (project_id, source_type, title, folder_path, worktree_mode, workspace_cwd, workspace_mode, worktree_path, worktree_unavailable_reason, workspace_updated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
         ON CONFLICT(folder_path)
         DO UPDATE SET
           title = excluded.title,
           worktree_mode = excluded.worktree_mode,
           updated_at = excluded.updated_at`,
      )
      .run(
        projectId,
        LOCAL_CONSOLE_PROJECT_SOURCE_TYPE,
        projectTitleFromFolder(folderPath),
        folderPath,
        input.worktreeMode ? 1 : 0,
        input.now,
        input.now,
      );
    return requireLocalProjectByFolderPath(database, folderPath);
  });
}

function updateLocalProject(
  database: SqliteDatabase,
  input: Extract<SqliteStateCommand, { kind: "local-update-project" }>,
): unknown {
  return transaction(database, () => {
    const result = database
      .prepare("UPDATE projects SET worktree_mode = ?, updated_at = ? WHERE project_id = ?")
      .run(input.worktreeMode ? 1 : 0, input.now, input.projectId);
    if (Number(result.changes ?? 0) !== 1) {
      throw new Error(`local console project not found: ${input.projectId}`);
    }
    return requireLocalProject(database, input.projectId);
  });
}

function listLocalProjects(database: SqliteDatabase): unknown[] {
  const rows = database.prepare("SELECT * FROM projects ORDER BY updated_at DESC, created_at DESC").all();
  if (rows.length === 0) {
    const now = new Date().toISOString();
    ensureDefaultLocalProject(database, process.cwd(), now);
    return [requireLocalProject(database, LOCAL_CONSOLE_PROJECT_ID)];
  }
  return rows.map((row) => readLocalProjectRow(database, row));
}

function getLocalSessionWorkspace(database: SqliteDatabase, sessionId: string): unknown {
  const row = database
    .prepare(
      `SELECT p.project_id, p.title, p.folder_path, p.worktree_mode
       FROM sessions s
       JOIN projects p ON p.project_id = s.project_id
       WHERE s.session_id = ? AND s.source_type = 'local'`,
    )
    .get(sessionId);
  if (!isRecord(row)) {
    throw new Error(`local console session workspace not found: ${sessionId}`);
  }
  return {
    projectId: readString(row.project_id, "project_id"),
    title: readString(row.title, "title"),
    folderPath: readString(row.folder_path, "folder_path"),
    worktreeMode: readBooleanNumber(row.worktree_mode, "worktree_mode"),
  };
}

function recordLocalProjectWorkspaceStatus(
  database: SqliteDatabase,
  input: Extract<SqliteStateCommand, { kind: "local-record-project-workspace-status" }>,
): null {
  const result = database
    .prepare(
      `UPDATE projects
       SET workspace_cwd = ?,
           workspace_mode = ?,
           worktree_path = ?,
           worktree_unavailable_reason = ?,
           workspace_updated_at = ?,
           updated_at = ?
       WHERE project_id = ?`,
    )
    .run(input.cwd, input.mode, input.worktreePath, input.worktreeUnavailableReason, input.now, input.now, input.projectId);
  if (Number(result.changes ?? 0) !== 1) {
    throw new Error(`local console project not found: ${input.projectId}`);
  }
  return null;
}

function createLocalSession(
  database: SqliteDatabase,
  input: Extract<SqliteStateCommand, { kind: "local-create-session" }>,
): unknown {
  return transaction(database, () => {
    ensureSession(database, input.sessionId, input.now, input.title, input.projectId);
    ensureLocalCursor(database, input.sessionId, input.now);
    return requireLocalSession(database, input.sessionId);
  });
}

function listLocalSessions(database: SqliteDatabase): unknown[] {
  const rows = database
    .prepare("SELECT * FROM sessions WHERE source_type = 'local' ORDER BY updated_at DESC, created_at DESC")
    .all();
  if (rows.length === 0) {
    ensureSession(database, LOCAL_CONSOLE_DEFAULT_SESSION_ID, new Date().toISOString(), "默认会话", LOCAL_CONSOLE_PROJECT_ID);
    return [requireLocalSession(database, LOCAL_CONSOLE_DEFAULT_SESSION_ID)];
  }
  return rows.map((row) => readLocalSessionRow(database, row));
}

function appendUserMessage(
  database: SqliteDatabase,
  input: Extract<SqliteStateCommand, { kind: "local-append-user" }>,
): unknown {
  return transaction(database, () => {
    ensureSession(database, input.sessionId, input.now, titleFromMessage(input.body), LOCAL_CONSOLE_PROJECT_ID);
    ensureLocalCursor(database, input.sessionId, input.now);
    const result = database
      .prepare(
        `INSERT INTO session_messages
          (session_id, speaker, role, body, status, run_id, run_dir, error, source_kind, source_id, created_at, updated_at)
        VALUES (?, 'user', NULL, ?, 'pending', NULL, NULL, NULL, 'local-message', NULL, ?, ?)`,
      )
      .run(input.sessionId, input.body, input.now, input.now);
    return requireLocalMessage(database, toNumberId(result.lastInsertRowid), input.sessionId);
  });
}

function listLocalMessages(database: SqliteDatabase, sessionId: string): unknown[] {
  return database
    .prepare("SELECT * FROM session_messages WHERE session_id = ? ORDER BY id ASC")
    .all(sessionId)
    .map(readLocalMessageRow);
}

function hasRunningMessage(database: SqliteDatabase, sessionId: string): boolean {
  return (
    database
      .prepare("SELECT id FROM session_messages WHERE session_id = ? AND status = 'running' ORDER BY id ASC LIMIT 1")
      .get(sessionId) !== undefined
  );
}

function claimNextPendingMessage(
  database: SqliteDatabase,
  input: Extract<SqliteStateCommand, { kind: "local-claim-next" }>,
): unknown | null {
  return transaction(database, () => {
    ensureLocalCursor(database, input.sessionId, input.now);
    const active = database
      .prepare("SELECT active_message_id FROM local_message_cursors WHERE session_id = ? AND active_message_id IS NOT NULL")
      .get(input.sessionId);
    if (active !== undefined) {
      return null;
    }
    skipUnprocessableLocalMessages(database, input.sessionId, input.now);
    const cursor = requireLocalCursor(database, input.sessionId);
    const row = database
      .prepare(
        `SELECT * FROM session_messages
         WHERE session_id = ?
           AND id > ?
           AND speaker IN ('user', 'agent')
         ORDER BY id ASC
         LIMIT 1`,
      )
      .get(input.sessionId, cursor.processedThroughMessageId);
    if (row === undefined) {
      return null;
    }
    const message = readLocalMessageRow(row);
    if (message.speaker === "user" && message.status === "running") {
      return null;
    }
    if (message.speaker === "user" && message.status !== "pending") {
      advanceLocalCursor(database, input.sessionId, message.id, input.now);
      return null;
    }
    if (message.speaker === "agent" && message.status !== "displayed") {
      advanceLocalCursor(database, input.sessionId, message.id, input.now);
      return null;
    }
    if (message.speaker === "user") {
      const result = database
        .prepare("UPDATE session_messages SET status = 'running', run_id = ?, error = NULL, updated_at = ? WHERE id = ? AND status = 'pending'")
        .run(input.runId, input.now, message.id);
      if (Number(result.changes ?? 0) !== 1) {
        return null;
      }
    }
    setLocalCursorActive(database, input.sessionId, message.id, input.runId, input.now);
    return requireLocalMessage(database, message.id, input.sessionId);
  });
}

function setRunDir(database: SqliteDatabase, input: Extract<SqliteStateCommand, { kind: "local-set-run-dir" }>): null {
  database
    .prepare("UPDATE session_messages SET run_dir = ?, updated_at = ? WHERE id = ?")
    .run(input.runDir, input.now, input.id);
  return null;
}

function recordAgentResponse(
  database: SqliteDatabase,
  input: Extract<SqliteStateCommand, { kind: "local-record-agent-response" }>,
): null {
  return transaction(database, () => {
    ensureSession(database, input.sessionId, input.now, undefined, LOCAL_CONSOLE_PROJECT_ID);
    ensureLocalCursor(database, input.sessionId, input.now);
    const source = requireLocalMessage(database, input.userMessageId, input.sessionId);
    database
      .prepare(
        `INSERT INTO session_messages
          (session_id, speaker, role, body, status, run_id, run_dir, error, source_kind, source_id, created_at, updated_at)
        VALUES (?, 'agent', ?, ?, 'displayed', ?, ?, NULL, 'local-message', NULL, ?, ?)`,
      )
      .run(input.sessionId, input.role, input.body, input.runId, input.runDir, input.now, input.now);
    completeSourceMessage(database, source, "completed", null, input.runId, input.runDir, input.now);
    return null;
  });
}

function recordMessageProcessed(
  database: SqliteDatabase,
  input: Extract<SqliteStateCommand, { kind: "local-record-message-processed" }>,
): null {
  return transaction(database, () => {
    ensureLocalCursor(database, input.sessionId, input.now);
    const source = requireLocalMessage(database, input.userMessageId, input.sessionId);
    completeSourceMessage(database, source, "completed", null, input.runId, input.runDir, input.now);
    return null;
  });
}

function releaseMessageForRetry(
  database: SqliteDatabase,
  input: Extract<SqliteStateCommand, { kind: "local-release-message-for-retry" }>,
): null {
  return transaction(database, () => {
    ensureLocalCursor(database, input.sessionId, input.now);
    const source = requireLocalMessage(database, input.userMessageId, input.sessionId);
    if (source.speaker === "user" && source.status === "running") {
      database
        .prepare("UPDATE session_messages SET status = 'pending', run_id = NULL, error = NULL, updated_at = ? WHERE id = ?")
        .run(input.now, source.id);
    }
    clearLocalCursorActive(database, input.sessionId, input.now);
    return null;
  });
}

function recordSystemAndComplete(
  database: SqliteDatabase,
  input: Extract<SqliteStateCommand, { kind: "local-record-system-and-complete" }>,
): null {
  return transaction(database, () => {
    ensureLocalCursor(database, input.sessionId, input.now);
    const source = requireLocalMessage(database, input.userMessageId, input.sessionId);
    insertSystemMessage(database, input.sessionId, input.body, input.runId, input.runDir, null, input.now);
    completeSourceMessage(database, source, "completed", null, input.runId, input.runDir, input.now);
    return null;
  });
}

function recordFailure(database: SqliteDatabase, input: Extract<SqliteStateCommand, { kind: "local-record-failure" }>): null {
  return transaction(database, () => {
    ensureLocalCursor(database, input.sessionId, input.now);
    const source = requireLocalMessage(database, input.userMessageId, input.sessionId);
    insertSystemMessage(
      database,
      input.sessionId,
      `Codex failed: ${input.error}`,
      input.runId,
      input.runDir,
      input.error,
      input.now,
      source.speaker === "agent" ? "failed" : "displayed",
    );
    completeSourceMessage(database, source, "failed", input.error, input.runId, input.runDir, input.now);
    return null;
  });
}

function recordInterrupted(database: SqliteDatabase, input: Extract<SqliteStateCommand, { kind: "local-record-interrupted" }>): null {
  return transaction(database, () => {
    ensureLocalCursor(database, input.sessionId, input.now);
    const source = requireLocalMessage(database, input.userMessageId, input.sessionId);
    insertSystemMessage(
      database,
      input.sessionId,
      `Codex interrupted: ${input.reason}`,
      input.runId,
      input.runDir,
      input.reason,
      input.now,
      source.speaker === "agent" ? "interrupted" : "displayed",
    );
    completeSourceMessage(database, source, "interrupted", input.reason, input.runId, input.runDir, input.now);
    return null;
  });
}

function recordStuck(database: SqliteDatabase, input: Extract<SqliteStateCommand, { kind: "local-record-stuck" }>): null {
  return transaction(database, () => {
    ensureLocalCursor(database, input.sessionId, input.now);
    const source = requireLocalMessage(database, input.userMessageId, input.sessionId);
    insertSystemMessage(
      database,
      input.sessionId,
      `Codex stuck: ${input.reason}`,
      input.runId,
      input.runDir,
      input.reason,
      input.now,
      source.speaker === "agent" ? "stuck" : "displayed",
    );
    completeSourceMessage(database, source, "stuck", input.reason, input.runId, input.runDir, input.now);
    return null;
  });
}

function markStaleRunning(
  database: SqliteDatabase,
  input: Extract<SqliteStateCommand, { kind: "local-mark-stale-running" }>,
): number {
  return transaction(database, () => {
    ensureLocalCursor(database, input.sessionId, input.now);
    let count = 0;
    const rows = database
      .prepare("SELECT * FROM session_messages WHERE session_id = ? AND status = 'running' AND updated_at < ? ORDER BY id ASC")
      .all(input.sessionId, input.cutoffIso)
      .map(readLocalMessageRow);

    for (const row of rows) {
      insertSystemMessage(database, input.sessionId, `Recovered stale local run as stuck: ${input.reason}`, row.runId, row.runDir, input.reason, input.now);
      completeSourceMessage(database, row, "stuck", input.reason, row.runId, row.runDir, input.now);
      count += 1;
    }

    const activeRows = database
      .prepare(
        `SELECT * FROM local_message_cursors
         WHERE session_id = ?
           AND active_message_id IS NOT NULL
           AND updated_at < ?`,
      )
      .all(input.sessionId, input.cutoffIso);
    for (const activeRow of activeRows) {
      if (!isRecord(activeRow)) {
        continue;
      }
      const activeMessageId = readNumber(activeRow.active_message_id, "active_message_id");
      const activeRunId = readNullableString(activeRow.active_run_id, "active_run_id");
      const sourceRow = database.prepare("SELECT * FROM session_messages WHERE id = ? AND session_id = ?").get(activeMessageId, input.sessionId);
      if (sourceRow === undefined) {
        clearLocalCursorActive(database, input.sessionId, input.now);
        count += 1;
        continue;
      }
      const source = readLocalMessageRow(sourceRow);
      if (source.status === "running") {
        continue;
      }
      insertSystemMessage(
        database,
        input.sessionId,
        `Recovered stale local handoff as stuck: ${input.reason}`,
        activeRunId,
        source.runDir,
        input.reason,
        input.now,
        "stuck",
      );
      completeSourceMessage(database, source, "stuck", input.reason, activeRunId, source.runDir, input.now);
      count += 1;
    }

    return count;
  });
}

function ensureLocalCursor(database: SqliteDatabase, sessionId: string, now: string): void {
  const existing = database.prepare("SELECT session_id FROM local_message_cursors WHERE session_id = ?").get(sessionId);
  if (existing !== undefined) {
    return;
  }
  const processedThrough = computeInitialProcessedThrough(database, sessionId);
  database
    .prepare(
      `INSERT INTO local_message_cursors
        (session_id, processed_through_message_id, active_message_id, active_run_id, updated_at)
       VALUES (?, ?, NULL, NULL, ?)`,
    )
    .run(sessionId, processedThrough, now);
}

function computeInitialProcessedThrough(database: SqliteDatabase, sessionId: string): number {
  const rows = database
    .prepare("SELECT * FROM session_messages WHERE session_id = ? ORDER BY id ASC")
    .all(sessionId)
    .map(readLocalMessageRow);
  let processedThrough = 0;
  for (const row of rows) {
    if (row.speaker === "user" && (row.status === "pending" || row.status === "running")) {
      break;
    }
    processedThrough = row.id;
  }
  return processedThrough;
}

function requireLocalCursor(database: SqliteDatabase, sessionId: string): { processedThroughMessageId: number } {
  const row = database.prepare("SELECT * FROM local_message_cursors WHERE session_id = ?").get(sessionId);
  if (!isRecord(row)) {
    throw new Error(`local console cursor not found: ${sessionId}`);
  }
  return {
    processedThroughMessageId: readNumber(row.processed_through_message_id, "processed_through_message_id"),
  };
}

function skipUnprocessableLocalMessages(database: SqliteDatabase, sessionId: string, now: string): void {
  while (true) {
    const cursor = requireLocalCursor(database, sessionId);
    const row = database
      .prepare(
        `SELECT * FROM session_messages
         WHERE session_id = ?
           AND id > ?
         ORDER BY id ASC
         LIMIT 1`,
      )
      .get(sessionId, cursor.processedThroughMessageId);
    if (row === undefined) {
      return;
    }
    const message = readLocalMessageRow(row);
    if (message.speaker === "user" && (message.status === "pending" || message.status === "running")) {
      return;
    }
    if (message.speaker === "agent" && message.status === "displayed") {
      return;
    }
    advanceLocalCursor(database, sessionId, message.id, now);
  }
}

function setLocalCursorActive(database: SqliteDatabase, sessionId: string, messageId: number, runId: string, now: string): void {
  database
    .prepare(
      `UPDATE local_message_cursors
       SET active_message_id = ?, active_run_id = ?, updated_at = ?
       WHERE session_id = ?`,
    )
    .run(messageId, runId, now, sessionId);
}

function advanceLocalCursor(database: SqliteDatabase, sessionId: string, messageId: number, now: string): void {
  database
    .prepare(
      `UPDATE local_message_cursors
       SET processed_through_message_id =
             CASE
               WHEN processed_through_message_id > ? THEN processed_through_message_id
               ELSE ?
             END,
           active_message_id = NULL,
           active_run_id = NULL,
           updated_at = ?
       WHERE session_id = ?`,
    )
    .run(messageId, messageId, now, sessionId);
}

function clearLocalCursorActive(database: SqliteDatabase, sessionId: string, now: string): void {
  database
    .prepare(
      `UPDATE local_message_cursors
       SET active_message_id = NULL, active_run_id = NULL, updated_at = ?
       WHERE session_id = ?`,
    )
    .run(now, sessionId);
}

function completeSourceMessage(
  database: SqliteDatabase,
  source: WorkerLocalMessage,
  status: "completed" | "failed" | "interrupted" | "stuck",
  error: string | null,
  runId: string | null,
  runDir: string | null,
  now: string,
): void {
  if (source.speaker === "user") {
    database
      .prepare("UPDATE session_messages SET status = ?, run_id = ?, run_dir = ?, error = ?, updated_at = ? WHERE id = ?")
      .run(status, runId, runDir, error, now, source.id);
  }
  advanceLocalCursor(database, source.sessionId, source.id, now);
}

function insertSystemMessage(
  database: SqliteDatabase,
  sessionId: string,
  body: string,
  runId: string | null,
  runDir: string | null,
  error: string | null,
  now: string,
  status = "displayed",
): void {
  ensureSession(database, sessionId, now, undefined, LOCAL_CONSOLE_PROJECT_ID);
  database
    .prepare(
      `INSERT INTO session_messages
        (session_id, speaker, role, body, status, run_id, run_dir, error, source_kind, source_id, created_at, updated_at)
      VALUES (?, 'system', NULL, ?, ?, ?, ?, ?, 'local-message', NULL, ?, ?)`,
    )
    .run(sessionId, body, status, runId, runDir, error, now, now);
}

function requireLocalMessage(database: SqliteDatabase, id: number, sessionId: string): WorkerLocalMessage {
  const row = database.prepare("SELECT * FROM session_messages WHERE id = ? AND session_id = ?").get(id, sessionId);
  if (row === undefined) {
    throw new Error(`local console message not found: ${String(id)}`);
  }
  return readLocalMessageRow(row);
}

function requireLocalSession(database: SqliteDatabase, sessionId: string): unknown {
  const row = database.prepare("SELECT * FROM sessions WHERE session_id = ?").get(sessionId);
  if (row === undefined) {
    throw new Error(`local console session not found: ${sessionId}`);
  }
  return readLocalSessionRow(database, row);
}

function requireLocalProject(database: SqliteDatabase, projectId: string): unknown {
  const row = database.prepare("SELECT * FROM projects WHERE project_id = ?").get(projectId);
  if (row === undefined) {
    throw new Error(`local console project not found: ${projectId}`);
  }
  return readLocalProjectRow(database, row);
}

function requireLocalProjectByFolderPath(database: SqliteDatabase, folderPath: string): unknown {
  const row = database.prepare("SELECT * FROM projects WHERE folder_path = ?").get(folderPath);
  if (row === undefined) {
    throw new Error(`local console project not found for folder: ${folderPath}`);
  }
  return readLocalProjectRow(database, row);
}

function readLocalProjectRow(database: SqliteDatabase, row: unknown): unknown {
  if (!isRecord(row)) {
    throw new Error("Invalid local console project row");
  }
  const projectId = readString(row.project_id, "project_id");
  const sessions = database
    .prepare("SELECT * FROM sessions WHERE source_type = 'local' AND project_id = ? ORDER BY updated_at DESC, created_at DESC")
    .all(projectId)
    .map((sessionRow) => readLocalSessionRow(database, sessionRow));
  const counts = { running: 0, waiting: 0, stuck: 0, failed: 0 };
  for (const session of sessions) {
    if (!isRecord(session)) {
      continue;
    }
    counts.running += readNumber(session.runningCount, "runningCount");
    counts.waiting += readNumber(session.waitingCount, "waitingCount");
    counts.stuck += readNumber(session.stuckCount, "stuckCount");
    counts.failed += readNumber(session.errorCount, "errorCount");
  }
  return {
    projectId,
    sourceType: readString(row.source_type, "source_type"),
    title: readString(row.title, "title"),
    folderPath: readString(row.folder_path, "folder_path"),
    worktreeMode: readBooleanNumber(row.worktree_mode, "worktree_mode"),
    workspaceCwd: readNullableString(row.workspace_cwd, "workspace_cwd"),
    workspaceMode: readNullableString(row.workspace_mode, "workspace_mode"),
    worktreePath: readNullableString(row.worktree_path, "worktree_path"),
    worktreeUnavailableReason: readNullableString(row.worktree_unavailable_reason, "worktree_unavailable_reason"),
    workspaceUpdatedAt: readNullableString(row.workspace_updated_at, "workspace_updated_at"),
    sessions,
    runningCount: counts.running,
    waitingCount: counts.waiting,
    stuckCount: counts.stuck,
    errorCount: counts.failed,
  };
}

function readLocalSessionRow(database: SqliteDatabase, row: unknown): unknown {
  if (!isRecord(row)) {
    throw new Error("Invalid local console session row");
  }
  const sessionId = readString(row.session_id, "session_id");
  const counts = readSessionCounts(database, sessionId);
  return {
    sessionId,
    projectId: readString(row.project_id, "project_id"),
    title: readNullableString(row.title, "title") ?? fallbackSessionTitle(sessionId),
    status: sessionStatusFromCounts(counts),
    runningCount: counts.running,
    waitingCount: counts.waiting,
    stuckCount: counts.stuck,
    errorCount: counts.failed,
    interruptedCount: counts.interrupted,
    createdAt: readString(row.created_at, "created_at"),
    updatedAt: readString(row.updated_at, "updated_at"),
  };
}

function readSessionCounts(database: SqliteDatabase, sessionId: string): {
  running: number;
  waiting: number;
  stuck: number;
  failed: number;
  interrupted: number;
} {
  const rows = database
    .prepare("SELECT status, COUNT(*) AS count FROM session_messages WHERE session_id = ? GROUP BY status")
    .all(sessionId);
  const counts = { running: 0, waiting: 0, stuck: 0, failed: 0, interrupted: 0 };
  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }
    const status = readString(row.status, "status");
    const count = readNumber(row.count, "count");
    if (status === "running") {
      counts.running += count;
    } else if (status === "stuck") {
      counts.stuck += count;
    } else if (status === "failed") {
      counts.failed += count;
    } else if (status === "interrupted") {
      counts.interrupted += count;
    }
  }
  const latestDisplayed = database
    .prepare(
      `SELECT body FROM session_messages
       WHERE session_id = ? AND speaker IN ('agent', 'system')
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(sessionId);
  if (isRecord(latestDisplayed) && readString(latestDisplayed.body, "body").includes("等待真人：")) {
    counts.waiting = 1;
  }
  return counts;
}

function sessionStatusFromCounts(counts: {
  running: number;
  waiting: number;
  stuck: number;
  failed: number;
  interrupted: number;
}): string {
  if (counts.running > 0) {
    return "running";
  }
  if (counts.stuck > 0) {
    return "stuck";
  }
  if (counts.failed > 0) {
    return "failed";
  }
  if (counts.interrupted > 0) {
    return "interrupted";
  }
  if (counts.waiting > 0) {
    return "waiting";
  }
  return "idle";
}

function readLocalMessageRow(row: unknown): WorkerLocalMessage {
  if (!isRecord(row)) {
    throw new Error("Invalid local console message row");
  }
  return {
    id: readNumber(row.id, "id"),
    sessionId: readString(row.session_id, "session_id"),
    speaker: readString(row.speaker, "speaker"),
    role: readNullableString(row.role, "role"),
    body: readString(row.body, "body"),
    status: readString(row.status, "status"),
    runId: readNullableString(row.run_id, "run_id"),
    runDir: readNullableString(row.run_dir, "run_dir"),
    error: readNullableString(row.error, "error"),
    createdAt: readString(row.created_at, "created_at"),
    updatedAt: readString(row.updated_at, "updated_at"),
  };
}

function ensureSession(database: SqliteDatabase, sessionId: string, now: string, title?: string, projectId?: string): void {
  const parsed = sessionId.startsWith("github:") ? parseIssueKey(sessionId.slice("github:".length)) : null;
  const sourceType = parsed === null ? "local" : "github";
  const resolvedProjectId = sourceType === "local" ? (projectId ?? LOCAL_CONSOLE_PROJECT_ID) : null;
  database
    .prepare(
      `INSERT INTO sessions
        (session_id, project_id, source_type, source_owner, source_repo, source_issue_number, parent_session_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'active', ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        title = COALESCE(sessions.title, excluded.title),
        project_id = CASE
          WHEN sessions.source_type = 'local' THEN COALESCE(sessions.project_id, excluded.project_id)
          ELSE sessions.project_id
        END,
        updated_at = excluded.updated_at`,
    )
    .run(
      sessionId,
      resolvedProjectId,
      sourceType,
      parsed?.owner ?? null,
      parsed?.repo ?? null,
      parsed?.issueNumber ?? null,
      title ?? null,
      now,
      now,
    );
}

function titleFromMessage(body: string): string {
  const collapsed = body.trim().replace(/\s+/gu, " ");
  if (collapsed.length === 0) {
    return "新会话";
  }
  return collapsed.length > 32 ? `${collapsed.slice(0, 32)}...` : collapsed;
}

function projectIdForFolder(folderPath: string): string {
  return `local-project:${createHash("sha1").update(path.resolve(folderPath)).digest("hex").slice(0, 16)}`;
}

function projectTitleFromFolder(folderPath: string): string {
  return path.basename(path.resolve(folderPath)) || path.resolve(folderPath);
}

function fallbackSessionTitle(sessionId: string): string {
  return sessionId === LOCAL_CONSOLE_DEFAULT_SESSION_ID ? "默认会话" : sessionId.replace(/^local:/u, "会话 ");
}

function markSchemaMigration(database: SqliteDatabase, version: string): void {
  database
    .prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)")
    .run(version, new Date().toISOString());
}

function markMigrationImported(database: SqliteDatabase, source: SqliteStateSource | "local-messages", legacyDigest: string | null): void {
  database
    .prepare(
      `INSERT INTO legacy_migration_sources (source, legacy_digest, status, imported_at, error)
       VALUES (?, ?, 'imported', ?, NULL)
       ON CONFLICT(source)
       DO UPDATE SET legacy_digest = excluded.legacy_digest, status = 'imported', imported_at = excluded.imported_at, error = NULL`,
    )
    .run(source, legacyDigest, new Date().toISOString());
}

function assertTargetEmptyForImport(database: SqliteDatabase, source: SqliteStateSource, sql: string): void {
  const rows = database.prepare(sql).all();
  const count = rows.reduce<number>((sum, row) => {
    if (!isRecord(row)) {
      return sum;
    }
    return sum + readNumber(row.count, "count");
  }, 0);
  if (count > 0) {
    throw new Error(`Cannot import legacy ${source}: SQLite target already has unmarked state`);
  }
}

function transaction<T>(database: SqliteDatabase, body: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = body();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Keep the original error.
    }
    throw error;
  }
}

function entriesObject(value: unknown): Array<[string, unknown]> {
  if (!isRecord(value) || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid SQLite row ${field}`);
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
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid SQLite row ${field}`);
  }
  return value;
}

function readBooleanNumber(value: unknown, field: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const numberValue = readNumber(value, field);
  if (numberValue === 0) {
    return false;
  }
  if (numberValue === 1) {
    return true;
  }
  throw new Error(`Invalid SQLite boolean ${field}`);
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

function assertNever(value: never): never {
  throw new Error(`Unhandled SQLite command: ${JSON.stringify(value)}`);
}
