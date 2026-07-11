import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  runSqliteStateCommand,
  type SqliteStateCommand,
  type SqliteStateSource,
} from "./sqlite-state.js";

export const GITHUB_RUNNER_SQLITE_FILENAME = "github-runner.sqlite";
export const LEGACY_SHARED_SQLITE_FILENAME = "local-console.sqlite";

export function githubRunnerSqlitePathForStateFile(filePath: string): string {
  return path.join(path.dirname(filePath), GITHUB_RUNNER_SQLITE_FILENAME);
}

export function legacySharedSqlitePathForStateFile(filePath: string): string {
  return path.join(path.dirname(filePath), LEGACY_SHARED_SQLITE_FILENAME);
}

export async function migrateLegacySharedGitHubState(input: {
  filePath: string;
  source: SqliteStateSource;
  timeoutMs?: number;
}): Promise<void> {
  const targetPath = githubRunnerSqlitePathForStateFile(input.filePath);
  await withMigrationLock(targetPath, async () => {
    const targetStatus = await migrationStatus(targetPath, input.source, input.timeoutMs);
    if (targetStatus === "imported") {
      return;
    }

    const legacyPath = legacySharedSqlitePathForStateFile(input.filePath);
    const legacyStat = await statIfExists(legacyPath);
    if (legacyStat === null) {
      return;
    }

    const legacyStatus = await migrationStatus(legacyPath, input.source, input.timeoutMs, true);
    const state = await loadSourceState(legacyPath, input.source, input.timeoutMs, true);
    if (legacyStatus !== "imported" && !hasSourceState(input.source, state)) {
      return;
    }

    const legacyDigest = createHash("sha256")
      .update(`${path.resolve(legacyPath)}:${String(legacyStat.size)}:${String(legacyStat.mtimeMs)}`)
      .digest("hex");
    await runSqliteStateCommand({
      sqlitePath: targetPath,
      command: importCommand(input.source, state, legacyDigest),
      timeoutMs: input.timeoutMs,
    });
  });
}

async function migrationStatus(
  sqlitePath: string,
  source: SqliteStateSource,
  timeoutMs?: number,
  readOnly = false,
): Promise<string | null> {
  const result = await runSqliteStateCommand<{ status: string | null }>({
    sqlitePath,
    command: { kind: "get-migration-status", source },
    timeoutMs,
    readOnly,
  });
  return result.status;
}

async function loadSourceState(
  sqlitePath: string,
  source: SqliteStateSource,
  timeoutMs?: number,
  readOnly = false,
): Promise<unknown> {
  return runSqliteStateCommand({
    sqlitePath,
    command: loadCommand(source),
    timeoutMs,
    readOnly,
  });
}

function loadCommand(source: SqliteStateSource): SqliteStateCommand {
  switch (source) {
    case "role-threads":
      return { kind: "load-role-threads" };
    case "agent-contexts":
      return { kind: "load-agent-contexts" };
    case "github-intake":
      return { kind: "load-github-intake" };
    case "goal-ledger":
      return { kind: "load-goal-ledger" };
  }
}

function importCommand(source: SqliteStateSource, state: unknown, legacyDigest: string): SqliteStateCommand {
  switch (source) {
    case "role-threads":
      return { kind: "import-role-threads", store: state, legacyDigest };
    case "agent-contexts":
      return { kind: "import-agent-contexts", store: state, legacyDigest };
    case "github-intake":
      return { kind: "import-github-intake", state, legacyDigest };
    case "goal-ledger":
      return { kind: "import-goal-ledger", state, legacyDigest };
  }
}

function hasSourceState(source: SqliteStateSource, state: unknown): boolean {
  if (source === "goal-ledger") {
    return state !== null;
  }
  if (!isRecord(state)) {
    return false;
  }
  if (source === "github-intake") {
    return objectHasEntries(state.repositories) || objectHasEntries(state.issues);
  }
  return Object.keys(state).length > 0;
}

function objectHasEntries(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function statIfExists(filePath: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const stat = await fs.stat(filePath);
    return { size: stat.size, mtimeMs: stat.mtimeMs };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

const migrationLocks = new Map<string, Promise<void>>();

async function withMigrationLock(targetPath: string, operation: () => Promise<void>): Promise<void> {
  const previous = migrationLocks.get(targetPath) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => {}).then(() => current);
  migrationLocks.set(targetPath, next);
  await previous.catch(() => {});

  try {
    await operation();
  } finally {
    release();
    if (migrationLocks.get(targetPath) === next) {
      migrationLocks.delete(targetPath);
    }
  }
}
