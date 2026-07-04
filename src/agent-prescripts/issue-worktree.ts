import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { WorkspaceAccess } from "../agent-manifest.js";
import {
  getAgentContextState,
  loadAgentContextStateStore,
  saveAgentContextStateEntry,
  type AgentContextState,
} from "../agent-context-state.js";
import { WORKTREE_GIT_TIMEOUT_MS } from "../config.js";
import type { IssueSource } from "../issue-source.js";
import type { AgentPreScriptResult } from "./types.js";

export const ISSUE_WORKTREE_CONTEXT_ROLE = "__issue-worktree";
export const ISSUE_WORKTREE_CONTEXT_PRE_SCRIPT = "workspaceAccess:issue-worktree";

export interface IssueWorktreeCapabilityInput {
  role: string;
  workspaceAccess: WorkspaceAccess;
  latestIndex: number;
  issueSource: IssueSource;
  workdirRoot: string;
  contextStatePath: string;
}

export interface IssueWorktreePaths {
  repoCachePath: string;
  worktreePath: string;
}

interface GitRunOptions {
  label: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

interface IssueWorktreeDependencies {
  access(path: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<void>;
  pathExists(path: string): Promise<boolean>;
  runGit(args: string[], options: GitRunOptions): Promise<void>;
  isGitAncestor(input: { cwd: string; ancestor: string; descendant: string }, options: GitRunOptions): Promise<boolean>;
  loadState(filePath: string): Promise<Record<string, Record<string, AgentContextState>>>;
  saveStateEntry(issueKey: string, role: string, state: AgentContextState, filePath: string): Promise<void>;
  now(): Date;
  gitTimeoutMs: number;
}

const REMOTE_MAIN_REF = "refs/remotes/origin/main";
const FETCH_REMOTE_MAIN_REFSPEC = `+refs/heads/main:${REMOTE_MAIN_REF}`;
const LEGACY_DEV_WORKSPACE_PRE_SCRIPT_PATH = "src/agent-prescripts/dev-workspace.ts";

const repoLocks = new Map<string, Promise<unknown>>();

async function withRepoLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = repoLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  repoLocks.set(key, next.catch(() => {}));
  return await next;
}

const defaultDependencies: IssueWorktreeDependencies = {
  access: (targetPath) => fs.access(targetPath),
  mkdir: async (targetPath, options) => {
    await fs.mkdir(targetPath, options);
  },
  pathExists,
  runGit,
  isGitAncestor,
  loadState: loadAgentContextStateStore,
  saveStateEntry: saveAgentContextStateEntry,
  now: () => new Date(),
  gitTimeoutMs: WORKTREE_GIT_TIMEOUT_MS,
};

export async function runIssueWorktreeCapability(
  input: IssueWorktreeCapabilityInput,
  dependencies: IssueWorktreeDependencies = defaultDependencies,
): Promise<AgentPreScriptResult> {
  try {
    return await runIssueWorktreeCapabilityUnsafe(input, dependencies);
  } catch (error) {
    return {
      ok: false,
      reason: `issue-worktree-error:${formatError(error)}`,
    };
  }
}

function buildIssueWorktreePaths(input: IssueWorktreeCapabilityInput): IssueWorktreePaths {
  const repoKey = `${safePathSegment(input.issueSource.owner)}__${safePathSegment(input.issueSource.repo)}`;

  return {
    repoCachePath: path.join(input.workdirRoot, "repos", `${repoKey}.git`),
    worktreePath: path.join(input.workdirRoot, "worktrees", `${repoKey}__${input.issueSource.issueNumber}`),
  };
}

export function buildIssueLocalBranchName(input: IssueWorktreeCapabilityInput): string {
  const owner = safePathSegment(input.issueSource.owner);
  const repo = safePathSegment(input.issueSource.repo);
  return `agent/${owner}__${repo}__${input.issueSource.issueNumber}`;
}

export function buildLegacyRoleWorktreePath(input: IssueWorktreeCapabilityInput, role: string): string {
  const repoKey = `${safePathSegment(input.issueSource.owner)}__${safePathSegment(input.issueSource.repo)}`;
  return path.join(input.workdirRoot, "worktrees", `${repoKey}__${input.issueSource.issueNumber}__${safePathSegment(role)}`);
}

async function runIssueWorktreeCapabilityUnsafe(
  input: IssueWorktreeCapabilityInput,
  dependencies: IssueWorktreeDependencies,
): Promise<AgentPreScriptResult> {
  const stateStore = await dependencies.loadState(input.contextStatePath);
  const existingIssueState = getAgentContextState(stateStore, input.issueSource.issueKey, ISSUE_WORKTREE_CONTEXT_ROLE);
  const paths = buildIssueWorktreePaths(input);

  if (existingIssueState !== null) {
    return await reuseExistingIssueWorkspace(input, existingIssueState, paths, dependencies);
  }

  const legacyDevState = getAgentContextState(stateStore, input.issueSource.issueKey, "dev");
  if (legacyDevState !== null) {
    return await migrateLegacyDevWorkspace(input, legacyDevState, paths, dependencies);
  }

  return await createIssueWorkspace(input, paths, dependencies);
}

async function reuseExistingIssueWorkspace(
  input: IssueWorktreeCapabilityInput,
  state: AgentContextState,
  paths: IssueWorktreePaths,
  dependencies: IssueWorktreeDependencies,
): Promise<AgentPreScriptResult> {
  const validationError = validateIssueWorkspaceContext(state, input, paths.worktreePath);
  if (validationError !== null) {
    return { ok: false, reason: validationError };
  }

  await assertExistingWorkspaceResources(state.worktreePath, paths.repoCachePath, dependencies);
  const mainStatus = await refreshAndCheckMainStatus(state.worktreePath, paths.repoCachePath, dependencies);
  const nextState = buildIssueWorkspaceState(input, state.worktreePath, mainStatus, dependencies, state.migratedFromRole);
  await dependencies.saveStateEntry(input.issueSource.issueKey, ISSUE_WORKTREE_CONTEXT_ROLE, nextState, input.contextStatePath);

  return {
    ok: true,
    codexCwd: state.worktreePath,
    promptContext: formatIssueWorkspacePromptContext({
      worktreePath: state.worktreePath,
      access: input.workspaceAccess,
      mainStatus,
      migratedFromRole: state.migratedFromRole,
    }),
  };
}

async function migrateLegacyDevWorkspace(
  input: IssueWorktreeCapabilityInput,
  legacyState: AgentContextState,
  paths: IssueWorktreePaths,
  dependencies: IssueWorktreeDependencies,
): Promise<AgentPreScriptResult> {
  const validationError = validateLegacyDevContext(legacyState, input);
  if (validationError !== null) {
    return { ok: false, reason: validationError };
  }

  await assertExistingWorkspaceResources(legacyState.worktreePath, paths.repoCachePath, dependencies);
  const mainStatus = await refreshAndCheckMainStatus(legacyState.worktreePath, paths.repoCachePath, dependencies);
  const nextState = buildIssueWorkspaceState(input, legacyState.worktreePath, mainStatus, dependencies, "dev");
  await dependencies.saveStateEntry(input.issueSource.issueKey, ISSUE_WORKTREE_CONTEXT_ROLE, nextState, input.contextStatePath);

  return {
    ok: true,
    codexCwd: legacyState.worktreePath,
    promptContext: formatIssueWorkspacePromptContext({
      worktreePath: legacyState.worktreePath,
      access: input.workspaceAccess,
      mainStatus,
      migratedFromRole: "dev",
    }),
  };
}

async function createIssueWorkspace(
  input: IssueWorktreeCapabilityInput,
  paths: IssueWorktreePaths,
  dependencies: IssueWorktreeDependencies,
): Promise<AgentPreScriptResult> {
  if (await dependencies.pathExists(paths.worktreePath)) {
    return { ok: false, reason: `worktree-exists-without-context:${paths.worktreePath}` };
  }

  await dependencies.mkdir(path.dirname(paths.repoCachePath), { recursive: true });
  await dependencies.mkdir(path.dirname(paths.worktreePath), { recursive: true });

  await withRepoLock(paths.repoCachePath, async () => {
    if (!(await dependencies.pathExists(paths.repoCachePath))) {
      await runBoundedGit(dependencies, ["clone", "--bare", input.issueSource.cloneUrl, paths.repoCachePath], "clone");
    }

    await refreshRemoteMain(paths.repoCachePath, dependencies);
    await runBoundedGit(
      dependencies,
      [
        "--git-dir",
        paths.repoCachePath,
        "worktree",
        "add",
        "-B",
        buildIssueLocalBranchName(input),
        paths.worktreePath,
        REMOTE_MAIN_REF,
      ],
      "worktree-add",
    );
  });

  await dependencies.access(paths.worktreePath);
  const nextState = buildIssueWorkspaceState(input, paths.worktreePath, "fresh", dependencies);
  await dependencies.saveStateEntry(input.issueSource.issueKey, ISSUE_WORKTREE_CONTEXT_ROLE, nextState, input.contextStatePath);

  return {
    ok: true,
    codexCwd: paths.worktreePath,
    promptContext: formatIssueWorkspacePromptContext({
      worktreePath: paths.worktreePath,
      access: input.workspaceAccess,
      mainStatus: "fresh",
    }),
  };
}

async function assertExistingWorkspaceResources(
  worktreePath: string,
  repoCachePath: string,
  dependencies: IssueWorktreeDependencies,
): Promise<void> {
  try {
    await dependencies.access(worktreePath);
  } catch {
    throw new Error(`missing-worktree:${worktreePath}`);
  }

  if (!(await dependencies.pathExists(repoCachePath))) {
    throw new Error(`missing-repo-cache:${repoCachePath}`);
  }
}

async function refreshAndCheckMainStatus(
  worktreePath: string,
  repoCachePath: string,
  dependencies: IssueWorktreeDependencies,
): Promise<"fresh" | "behind-main"> {
  await withRepoLock(repoCachePath, () => refreshRemoteMain(repoCachePath, dependencies));
  const containsLatestMain = await runBoundedAncestorCheck(
    dependencies,
    { cwd: worktreePath, ancestor: REMOTE_MAIN_REF, descendant: "HEAD" },
    "merge-base",
  );
  return containsLatestMain ? "fresh" : "behind-main";
}

async function refreshRemoteMain(repoCachePath: string, dependencies: IssueWorktreeDependencies): Promise<void> {
  await runBoundedGit(
    dependencies,
    ["--git-dir", repoCachePath, "fetch", "--prune", "origin", FETCH_REMOTE_MAIN_REFSPEC],
    "fetch",
  );
}

function buildIssueWorkspaceState(
  input: IssueWorktreeCapabilityInput,
  worktreePath: string,
  mainStatus: "fresh" | "behind-main" | "unknown",
  dependencies: IssueWorktreeDependencies,
  migratedFromRole?: string,
): AgentContextState {
  return {
    preScript: ISSUE_WORKTREE_CONTEXT_PRE_SCRIPT,
    owner: input.issueSource.owner,
    repo: input.issueSource.repo,
    issueNumber: input.issueSource.issueNumber,
    worktreePath,
    preparedFromMessageIndex: input.latestIndex,
    workspaceAccess: input.workspaceAccess,
    migratedFromRole,
    mainStatus,
    lastCheckedAt: dependencies.now().toISOString(),
  };
}

function validateIssueWorkspaceContext(
  state: AgentContextState,
  input: IssueWorktreeCapabilityInput,
  expectedWorktreePath: string,
): string | null {
  if (state.preScript !== ISSUE_WORKTREE_CONTEXT_PRE_SCRIPT) {
    return `context-prescript-mismatch:${state.preScript}`;
  }

  const issueMismatch = validateIssueFields(state, input);
  if (issueMismatch !== null) {
    return issueMismatch;
  }

  const allowedPath =
    state.migratedFromRole === "dev" ? buildLegacyRoleWorktreePath(input, "dev") : expectedWorktreePath;
  if (state.worktreePath !== allowedPath) {
    return `context-worktree-mismatch:${state.worktreePath}`;
  }

  return null;
}

function validateLegacyDevContext(state: AgentContextState, input: IssueWorktreeCapabilityInput): string | null {
  if (state.preScript !== LEGACY_DEV_WORKSPACE_PRE_SCRIPT_PATH) {
    return `legacy-context-prescript-mismatch:${state.preScript}`;
  }

  const issueMismatch = validateIssueFields(state, input);
  if (issueMismatch !== null) {
    return `legacy-${issueMismatch}`;
  }

  const expectedLegacyPath = buildLegacyRoleWorktreePath(input, "dev");
  if (state.worktreePath !== expectedLegacyPath) {
    return `legacy-context-worktree-mismatch:${state.worktreePath}`;
  }

  return null;
}

function validateIssueFields(state: AgentContextState, input: IssueWorktreeCapabilityInput): string | null {
  if (
    state.owner !== input.issueSource.owner ||
    state.repo !== input.issueSource.repo ||
    state.issueNumber !== input.issueSource.issueNumber
  ) {
    return `context-issue-mismatch:${state.owner}/${state.repo}#${state.issueNumber}`;
  }

  return null;
}

function formatIssueWorkspacePromptContext(input: {
  worktreePath: string;
  access: WorkspaceAccess;
  mainStatus: "fresh" | "behind-main" | "unknown";
  migratedFromRole?: string;
}): string {
  const accessPolicy =
    input.access === "write"
      ? "write: this role may intentionally edit source files within the issue worktree according to its persona and task."
      : "read-run: this role must not intentionally edit source files, commit, or push; it may run tests, start services, and create build caches, test output, or acceptance screenshots.";
  const migrated = input.migratedFromRole === undefined ? "no" : `yes, from role ${input.migratedFromRole}`;

  return `Issue workspace capability context:
- worktreePath: ${input.worktreePath}
- workspaceAccess: ${input.access}
- accessPolicy: ${accessPolicy}
- mainStatus: ${input.mainStatus}
- legacyMigration: ${migrated}`;
}

async function runBoundedGit(
  dependencies: IssueWorktreeDependencies,
  args: string[],
  label: string,
): Promise<void> {
  return await withTimeout(
    dependencies.runGit(args, { label, timeoutMs: dependencies.gitTimeoutMs }),
    dependencies.gitTimeoutMs,
    label,
  );
}

async function runBoundedAncestorCheck(
  dependencies: IssueWorktreeDependencies,
  input: { cwd: string; ancestor: string; descendant: string },
  label: string,
): Promise<boolean> {
  return await withTimeout(
    dependencies.isGitAncestor(input, { label, timeoutMs: dependencies.gitTimeoutMs }),
    dependencies.gitTimeoutMs,
    label,
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`workspace-git-timeout:${label}:${String(timeoutMs)}ms`));
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function safePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function runGit(args: string[], options: GitRunOptions): Promise<void> {
  const result = await runGitProcess(args, options, [0]);
  if (result.code !== 0) {
    throw new Error(formatGitFailure("git", result, options.label));
  }
}

async function isGitAncestor(
  input: { cwd: string; ancestor: string; descendant: string },
  options: GitRunOptions,
): Promise<boolean> {
  const result = await runGitProcess(
    ["-C", input.cwd, "merge-base", "--is-ancestor", input.ancestor, input.descendant],
    options,
    [0, 1],
  );
  if (result.code === 0) {
    return true;
  }
  if (result.code === 1) {
    return false;
  }
  throw new Error(formatGitFailure("git merge-base", result, options.label));
}

async function runGitProcess(
  args: string[],
  options: GitRunOptions,
  acceptedExitCodes: number[],
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let timeoutTimer: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const terminate = () => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 1_000).unref?.();
    };
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminate();
      settleReject(new Error(`workspace-git-timeout:${options.label}:${String(options.timeoutMs)}ms`));
    }, options.timeoutMs);
    timeoutTimer.unref?.();
    const onAbort = () => {
      aborted = true;
      terminate();
      settleReject(new Error(`workspace-git-aborted:${options.label}`));
    };

    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });

    if (child.stderr === null) {
      settleReject(new Error("git did not expose stderr pipe"));
      return;
    }
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.once("error", settleReject);
    child.once("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (timedOut) {
        reject(new Error(`workspace-git-timeout:${options.label}:${String(options.timeoutMs)}ms`));
        return;
      }
      if (aborted) {
        reject(new Error(`workspace-git-aborted:${options.label}`));
        return;
      }
      if (code !== null && acceptedExitCodes.includes(code)) {
        resolve({ code, signal, stderr });
        return;
      }
      resolve({ code, signal, stderr });
    });
  });
}

function formatGitFailure(
  command: string,
  result: { code: number | null; signal: NodeJS.Signals | null; stderr: string },
  label: string,
): string {
  const suffix = result.signal === null ? `exit-code-${String(result.code)}` : `signal-${result.signal}`;
  const detail = result.stderr.trim();
  return detail === "" ? `${command} ${label} failed with ${suffix}` : `${command} ${label} failed with ${suffix}: ${detail}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
