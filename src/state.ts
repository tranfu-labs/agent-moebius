import fs from "node:fs/promises";
import path from "node:path";
import { ROLE_THREADS_STATE_PATH } from "./config.js";
import type { RoleThreadState } from "./conversation.js";

export type RoleThreadStateStore = Record<string, Record<string, RoleThreadState>>;

export async function loadRoleThreadStateStore(filePath = ROLE_THREADS_STATE_PATH): Promise<RoleThreadStateStore> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }

  const parsed: unknown = JSON.parse(raw);
  if (!isRoleThreadStateStore(parsed)) {
    throw new Error(`Invalid role thread state file: ${filePath}`);
  }

  return parsed;
}

export async function saveRoleThreadStateStore(
  store: RoleThreadStateStore,
  filePath = ROLE_THREADS_STATE_PATH,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function saveRoleThreadStateEntry(
  issueKey: string,
  role: string,
  state: RoleThreadState,
  filePath = ROLE_THREADS_STATE_PATH,
): Promise<void> {
  await withStateFileLock(filePath, async () => {
    const store = await loadRoleThreadStateStore(filePath);
    await saveRoleThreadStateStore(withRoleThreadState(store, issueKey, role, state), filePath);
  });
}

export function getRoleThreadState(
  store: RoleThreadStateStore,
  issueKey: string,
  role: string,
): RoleThreadState | null {
  return store[issueKey]?.[role] ?? null;
}

export function withRoleThreadState(
  store: RoleThreadStateStore,
  issueKey: string,
  role: string,
  state: RoleThreadState,
): RoleThreadStateStore {
  return {
    ...store,
    [issueKey]: {
      ...(store[issueKey] ?? {}),
      [role]: state,
    },
  };
}

function isRoleThreadStateStore(value: unknown): value is RoleThreadStateStore {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((issueState) => {
    if (typeof issueState !== "object" || issueState === null || Array.isArray(issueState)) {
      return false;
    }

    return Object.values(issueState).every(isRoleThreadState);
  });
}

function isRoleThreadState(value: unknown): value is RoleThreadState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const state = value as Partial<RoleThreadState>;
  const lastSeenIndex = state.lastSeenIndex;
  return (
    typeof state.threadId === "string" &&
    state.threadId.length > 0 &&
    Number.isInteger(lastSeenIndex) &&
    lastSeenIndex !== undefined &&
    lastSeenIndex >= 0
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
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
