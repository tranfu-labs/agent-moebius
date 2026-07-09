import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { GOAL_LEDGER_STATE_PATH } from "./config.js";
import {
  assertGoalLedgerState,
  createEmptyGoalLedgerState,
  parseGoalLedgerState,
  withGoalLedgerEntry,
  type GoalLedgerEntry,
  type GoalLedgerEntryKind,
  type GoalLedgerState,
} from "./goal-ledger.js";
import { runSqliteStateCommand, sqlitePathForLegacyStateFile } from "./sqlite-state.js";

export interface GoalLedgerStateIo {
  mkdir(path: string, options?: { signal?: AbortSignal }): Promise<void>;
  readFile(path: string, options?: { signal?: AbortSignal }): Promise<string>;
  writeFile(path: string, data: string, options?: { signal?: AbortSignal }): Promise<void>;
  rename(from: string, to: string, options?: { signal?: AbortSignal }): Promise<void>;
}

export interface GoalLedgerStateIoOptions {
  io?: GoalLedgerStateIo;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class GoalLedgerStateIoError extends Error {
  constructor(
    public readonly code: "timeout" | "aborted",
    label: string,
  ) {
    super(`goal-ledger-io-${code}:${label}`);
    this.name = "GoalLedgerStateIoError";
  }
}

const DEFAULT_IO: GoalLedgerStateIo = {
  async mkdir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
  },
  async readFile(filePath) {
    return fs.readFile(filePath, "utf8");
  },
  async writeFile(filePath, data) {
    await fs.writeFile(filePath, data, "utf8");
  },
  async rename(from, to) {
    await fs.rename(from, to);
  },
};

export async function loadGoalLedgerState(
  filePath = GOAL_LEDGER_STATE_PATH,
  options: GoalLedgerStateIoOptions = {},
): Promise<GoalLedgerState> {
  if (options.io !== undefined) {
    return loadGoalLedgerStateFromJson(filePath, options);
  }

  await migrateLegacyGoalLedgerState(filePath);
  const state = await runSqliteStateCommand<unknown | null>({
    sqlitePath: sqlitePathForLegacyStateFile(filePath),
    command: { kind: "load-goal-ledger" },
    timeoutMs: options.timeoutMs,
  });
  if (state === null) {
    return createEmptyGoalLedgerState();
  }
  return parseGoalLedgerState(state);
}

async function loadGoalLedgerStateFromJson(
  filePath: string,
  options: GoalLedgerStateIoOptions = {},
): Promise<GoalLedgerState> {
  const io = options.io ?? DEFAULT_IO;
  let raw: string;
  try {
    raw = await runGoalLedgerIoOperation("readFile", () => io.readFile(filePath, { signal: options.signal }), options);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return createEmptyGoalLedgerState();
    }
    throw error;
  }

  return parseGoalLedgerState(JSON.parse(raw));
}

export async function saveGoalLedgerState(
  state: GoalLedgerState,
  filePath = GOAL_LEDGER_STATE_PATH,
  options: GoalLedgerStateIoOptions = {},
): Promise<void> {
  assertGoalLedgerState(state);
  if (options.io === undefined) {
    await migrateLegacyGoalLedgerState(filePath);
    await runSqliteStateCommand({
      sqlitePath: sqlitePathForLegacyStateFile(filePath),
      command: { kind: "save-goal-ledger", state },
      timeoutMs: options.timeoutMs,
    });
    return;
  }

  await saveGoalLedgerStateToJson(state, filePath, options);
}

async function saveGoalLedgerStateToJson(
  state: GoalLedgerState,
  filePath: string,
  options: GoalLedgerStateIoOptions = {},
): Promise<void> {
  assertGoalLedgerState(state);
  const io = options.io ?? DEFAULT_IO;
  const tempPath = `${filePath}.tmp`;
  await runGoalLedgerIoOperation("mkdir", () => io.mkdir(path.dirname(filePath), { signal: options.signal }), options);
  await runGoalLedgerIoOperation(
    "writeFile",
    () => io.writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, { signal: options.signal }),
    options,
  );
  await runGoalLedgerIoOperation("rename", () => io.rename(tempPath, filePath, { signal: options.signal }), options);
}

export async function saveGoalLedgerEntry(
  kind: GoalLedgerEntryKind,
  id: string,
  mutate: (entry: GoalLedgerEntry | null, state: GoalLedgerState) => GoalLedgerEntry | null,
  filePath = GOAL_LEDGER_STATE_PATH,
  options: GoalLedgerStateIoOptions = {},
): Promise<void> {
  await withStateFileLock(filePath, async () => {
    const state = await loadGoalLedgerState(filePath, options);
    const entry = state[kind][id] ?? null;
    const nextEntry = mutate(entry, state);
    const nextState = withGoalLedgerEntry(state, kind, id, nextEntry);
    assertGoalLedgerState(nextState);
    await saveGoalLedgerState(nextState, filePath, options);
  });
}

export async function runGoalLedgerIoOperation<T>(
  label: string,
  operation: () => Promise<T>,
  options: Pick<GoalLedgerStateIoOptions, "timeoutMs" | "signal"> = {},
): Promise<T> {
  if (options.signal?.aborted) {
    throw new GoalLedgerStateIoError("aborted", label);
  }

  let timeout: NodeJS.Timeout | undefined;
  let removeAbortListener: (() => void) | undefined;
  const racers: Array<Promise<T>> = [];

  if (options.timeoutMs !== undefined) {
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
      throw new Error(`Invalid goal ledger IO timeout: ${String(options.timeoutMs)}`);
    }
    racers.push(
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new GoalLedgerStateIoError("timeout", label)), options.timeoutMs);
      }),
    );
  }

  if (options.signal !== undefined) {
    racers.push(
      new Promise<T>((_, reject) => {
        const onAbort = (): void => reject(new GoalLedgerStateIoError("aborted", label));
        options.signal?.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => options.signal?.removeEventListener("abort", onAbort);
      }),
    );
  }
  racers.push(operation());

  try {
    return await Promise.race(racers);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    removeAbortListener?.();
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function migrateLegacyGoalLedgerState(filePath: string): Promise<void> {
  const sqlitePath = sqlitePathForLegacyStateFile(filePath);
  const status = await runSqliteStateCommand<{ status: string | null }>({
    sqlitePath,
    command: { kind: "get-migration-status", source: "goal-ledger" },
  });
  if (status.status === "imported") {
    return;
  }

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  const state = await loadGoalLedgerStateFromJson(filePath);
  await runSqliteStateCommand({
    sqlitePath,
    command: { kind: "import-goal-ledger", state, legacyDigest: digest(raw) },
  });
}

function digest(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

const stateFileLocks = new Map<string, Promise<void>>();

async function withStateFileLock(filePath: string, operation: () => Promise<void>): Promise<void> {
  const previous = stateFileLocks.get(filePath) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => {}).then(() => current);
  stateFileLocks.set(filePath, next);
  await previous.catch(() => {});

  try {
    await operation();
  } finally {
    release();
    if (stateFileLocks.get(filePath) === next) {
      stateFileLocks.delete(filePath);
    }
  }
}
