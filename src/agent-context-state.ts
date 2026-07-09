import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { AGENT_CONTEXTS_STATE_PATH } from "./config.js";
import { runSqliteStateCommand, sqlitePathForLegacyStateFile } from "./sqlite-state.js";

export interface AgentContextState {
  preScript: string;
  owner: string;
  repo: string;
  issueNumber: number;
  worktreePath: string;
  preparedFromMessageIndex: number;
  workspaceAccess?: "write" | "read-run";
  migratedFromRole?: string;
  mainStatus?: "fresh" | "behind-main" | "unknown";
  lastCheckedAt?: string;
}

export type AgentContextStateStore = Record<string, Record<string, AgentContextState>>;

export async function loadAgentContextStateStore(
  filePath = AGENT_CONTEXTS_STATE_PATH,
): Promise<AgentContextStateStore> {
  await migrateLegacyAgentContextState(filePath);
  const store = await runSqliteStateCommand<unknown>({
    sqlitePath: sqlitePathForLegacyStateFile(filePath),
    command: { kind: "load-agent-contexts" },
  });
  if (!isAgentContextStateStore(store)) {
    throw new Error(`Invalid agent context state file: ${filePath}`);
  }
  return store;
}

async function loadLegacyAgentContextStateStore(filePath: string): Promise<AgentContextStateStore> {
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
  if (!isAgentContextStateStore(parsed)) {
    throw new Error(`Invalid agent context state file: ${filePath}`);
  }

  return parsed;
}

export async function saveAgentContextStateStore(
  store: AgentContextStateStore,
  filePath = AGENT_CONTEXTS_STATE_PATH,
): Promise<void> {
  if (!isAgentContextStateStore(store)) {
    throw new Error(`Invalid agent context state file: ${filePath}`);
  }
  await migrateLegacyAgentContextState(filePath);
  await runSqliteStateCommand({
    sqlitePath: sqlitePathForLegacyStateFile(filePath),
    command: { kind: "save-agent-contexts", store },
  });
}

export async function saveAgentContextStateEntry(
  issueKey: string,
  role: string,
  state: AgentContextState,
  filePath = AGENT_CONTEXTS_STATE_PATH,
): Promise<void> {
  await withStateFileLock(filePath, async () => {
    await migrateLegacyAgentContextState(filePath);
    await runSqliteStateCommand({
      sqlitePath: sqlitePathForLegacyStateFile(filePath),
      command: { kind: "save-agent-context-entry", issueKey, role, state },
    });
  });
}

export function getAgentContextState(
  store: AgentContextStateStore,
  issueKey: string,
  role: string,
): AgentContextState | null {
  return store[issueKey]?.[role] ?? null;
}

export function withAgentContextState(
  store: AgentContextStateStore,
  issueKey: string,
  role: string,
  state: AgentContextState,
): AgentContextStateStore {
  return {
    ...store,
    [issueKey]: {
      ...(store[issueKey] ?? {}),
      [role]: state,
    },
  };
}

function isAgentContextStateStore(value: unknown): value is AgentContextStateStore {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((issueState) => {
    if (typeof issueState !== "object" || issueState === null || Array.isArray(issueState)) {
      return false;
    }

    return Object.values(issueState).every(isAgentContextState);
  });
}

function isAgentContextState(value: unknown): value is AgentContextState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const state = value as Partial<AgentContextState>;
  return (
    typeof state.preScript === "string" &&
    state.preScript.length > 0 &&
    typeof state.owner === "string" &&
    state.owner.length > 0 &&
    typeof state.repo === "string" &&
    state.repo.length > 0 &&
    Number.isInteger(state.issueNumber) &&
    state.issueNumber !== undefined &&
    state.issueNumber > 0 &&
    typeof state.worktreePath === "string" &&
    state.worktreePath.length > 0 &&
    Number.isInteger(state.preparedFromMessageIndex) &&
    state.preparedFromMessageIndex !== undefined &&
    state.preparedFromMessageIndex >= 0 &&
    isOptionalWorkspaceAccess(state.workspaceAccess) &&
    isOptionalString(state.migratedFromRole) &&
    isOptionalMainStatus(state.mainStatus) &&
    isOptionalString(state.lastCheckedAt)
  );
}

function isOptionalWorkspaceAccess(value: unknown): boolean {
  return value === undefined || value === "write" || value === "read-run";
}

function isOptionalMainStatus(value: unknown): boolean {
  return value === undefined || value === "fresh" || value === "behind-main" || value === "unknown";
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function migrateLegacyAgentContextState(filePath: string): Promise<void> {
  const sqlitePath = sqlitePathForLegacyStateFile(filePath);
  const status = await runSqliteStateCommand<{ status: string | null }>({
    sqlitePath,
    command: { kind: "get-migration-status", source: "agent-contexts" },
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

  const store = await loadLegacyAgentContextStateStore(filePath);
  await runSqliteStateCommand({
    sqlitePath,
    command: { kind: "import-agent-contexts", store, legacyDigest: digest(raw) },
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
