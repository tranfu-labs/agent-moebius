import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getAgentContextState,
  loadAgentContextStateStore,
  saveAgentContextStateStore,
  withAgentContextState,
  type AgentContextState,
} from "../agent-context-state.js";
import type { AgentPreScriptInput, AgentPreScriptResult } from "./types.js";

export const DEV_WORKSPACE_PRE_SCRIPT_PATH = "src/agent-prescripts/dev-workspace.ts";

export interface DevWorkspacePaths {
  repoCachePath: string;
  worktreePath: string;
}

interface DevWorkspaceDependencies {
  access(path: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<void>;
  pathExists(path: string): Promise<boolean>;
  removeWorktree(input: { repoCachePath: string; worktreePath: string }): Promise<void>;
  runGit(args: string[]): Promise<void>;
  isGitAncestor(input: { cwd: string; ancestor: string; descendant: string }): Promise<boolean>;
  loadState(filePath: string): Promise<Record<string, Record<string, AgentContextState>>>;
  saveState(store: Record<string, Record<string, AgentContextState>>, filePath: string): Promise<void>;
}

const REMOTE_MAIN_REF = "refs/remotes/origin/main";
const FETCH_REMOTE_MAIN_REFSPEC = `+refs/heads/main:${REMOTE_MAIN_REF}`;

const defaultDependencies: DevWorkspaceDependencies = {
  access: (targetPath) => fs.access(targetPath),
  mkdir: async (targetPath, options) => {
    await fs.mkdir(targetPath, options);
  },
  pathExists,
  removeWorktree: removeWorktreeWithFallback,
  runGit,
  isGitAncestor,
  loadState: loadAgentContextStateStore,
  saveState: saveAgentContextStateStore,
};

export async function runDevWorkspacePreScript(
  input: AgentPreScriptInput,
  dependencies: DevWorkspaceDependencies = defaultDependencies,
): Promise<AgentPreScriptResult> {
  try {
    return await runDevWorkspacePreScriptUnsafe(input, dependencies);
  } catch (error) {
    return {
      ok: false,
      reason: `dev-workspace-error:${formatError(error)}`,
    };
  }
}

function buildDevWorkspacePaths(input: AgentPreScriptInput): DevWorkspacePaths {
  const repoKey = `${safePathSegment(input.issueSource.owner)}__${safePathSegment(input.issueSource.repo)}`;
  const worktreeKey = `${repoKey}__${input.issueSource.issueNumber}__${safePathSegment(input.role)}`;

  return {
    repoCachePath: path.join(input.workdirRoot, "repos", `${repoKey}.git`),
    worktreePath: path.join(input.workdirRoot, "worktrees", worktreeKey),
  };
}

async function runDevWorkspacePreScriptUnsafe(
  input: AgentPreScriptInput,
  dependencies: DevWorkspaceDependencies,
): Promise<AgentPreScriptResult> {
  const stateStore = await dependencies.loadState(input.contextStatePath);
  const existingState = getAgentContextState(stateStore, input.issueSource.issueKey, input.role);
  const paths = buildDevWorkspacePaths(input);

  if (existingState !== null) {
    const validationError = validateExistingContext(existingState, input);
    if (validationError !== null) {
      return { ok: false, reason: validationError };
    }

    try {
      await dependencies.access(existingState.worktreePath);
    } catch {
      return { ok: false, reason: `missing-worktree:${existingState.worktreePath}` };
    }

    if (!(await dependencies.pathExists(paths.repoCachePath))) {
      return { ok: false, reason: `missing-repo-cache:${paths.repoCachePath}` };
    }

    await refreshRemoteMain(paths.repoCachePath, dependencies);
    const containsLatestMain = await dependencies.isGitAncestor({
      cwd: existingState.worktreePath,
      ancestor: REMOTE_MAIN_REF,
      descendant: "HEAD",
    });
    if (!containsLatestMain) {
      try {
        await dependencies.removeWorktree({
          repoCachePath: paths.repoCachePath,
          worktreePath: existingState.worktreePath,
        });
        await dependencies.runGit([
          "--git-dir",
          paths.repoCachePath,
          "worktree",
          "add",
          existingState.worktreePath,
          REMOTE_MAIN_REF,
        ]);
        await dependencies.access(existingState.worktreePath);
      } catch (error) {
        return { ok: false, reason: `stale-worktree-rebuild-failed:${formatError(error)}` };
      }

      return { ok: true, codexCwd: existingState.worktreePath };
    }

    return { ok: true, codexCwd: existingState.worktreePath };
  }

  if (await dependencies.pathExists(paths.worktreePath)) {
    return { ok: false, reason: `worktree-exists-without-context:${paths.worktreePath}` };
  }

  await dependencies.mkdir(path.dirname(paths.repoCachePath), { recursive: true });
  await dependencies.mkdir(path.dirname(paths.worktreePath), { recursive: true });

  if (!(await dependencies.pathExists(paths.repoCachePath))) {
    await dependencies.runGit(["clone", "--bare", input.issueSource.cloneUrl, paths.repoCachePath]);
  }

  await refreshRemoteMain(paths.repoCachePath, dependencies);
  await dependencies.runGit(["--git-dir", paths.repoCachePath, "worktree", "add", paths.worktreePath, REMOTE_MAIN_REF]);
  await dependencies.access(paths.worktreePath);

  const nextState = withAgentContextState(stateStore, input.issueSource.issueKey, input.role, {
    preScript: input.preScript,
    owner: input.issueSource.owner,
    repo: input.issueSource.repo,
    issueNumber: input.issueSource.issueNumber,
    worktreePath: paths.worktreePath,
    preparedFromMessageIndex: input.latestIndex,
  });
  await dependencies.saveState(nextState, input.contextStatePath);

  return { ok: true, codexCwd: paths.worktreePath };
}

async function refreshRemoteMain(repoCachePath: string, dependencies: DevWorkspaceDependencies): Promise<void> {
  await dependencies.runGit([
    "--git-dir",
    repoCachePath,
    "fetch",
    "--prune",
    "origin",
    FETCH_REMOTE_MAIN_REFSPEC,
  ]);
}

export async function removeWorktreeWithFallback(
  input: { repoCachePath: string; worktreePath: string },
  dependencies: {
    runGit(args: string[]): Promise<void>;
    rm(path: string, options: { recursive: true; force: true }): Promise<void>;
  } = {
    runGit,
    rm: async (targetPath, options) => {
      await fs.rm(targetPath, options);
    },
  },
): Promise<void> {
  try {
    await dependencies.runGit(["--git-dir", input.repoCachePath, "worktree", "remove", "--force", input.worktreePath]);
    return;
  } catch (primaryError) {
    try {
      await dependencies.rm(input.worktreePath, { recursive: true, force: true });
      await dependencies.runGit(["--git-dir", input.repoCachePath, "worktree", "prune"]);
    } catch (fallbackError) {
      throw new Error(
        `remove-worktree-failed:${formatError(primaryError)}; fallback-failed:${formatError(fallbackError)}`,
      );
    }
  }
}

function validateExistingContext(state: AgentContextState, input: AgentPreScriptInput): string | null {
  if (state.preScript !== input.preScript) {
    return `context-prescript-mismatch:${state.preScript}`;
  }

  if (
    state.owner !== input.issueSource.owner ||
    state.repo !== input.issueSource.repo ||
    state.issueNumber !== input.issueSource.issueNumber
  ) {
    return `context-issue-mismatch:${state.owner}/${state.repo}#${state.issueNumber}`;
  }

  return null;
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

async function runGit(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", args, {
      stdio: ["ignore", "ignore", "ignore"],
    });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const suffix = signal ? `signal-${signal}` : `exit-code-${code}`;
      reject(new Error(`git failed with ${suffix}`));
    });
  });
}

async function isGitAncestor(input: { cwd: string; ancestor: string; descendant: string }): Promise<boolean> {
  return await new Promise<boolean>((resolve, reject) => {
    const child = spawn("git", ["-C", input.cwd, "merge-base", "--is-ancestor", input.ancestor, input.descendant], {
      stdio: ["ignore", "ignore", "ignore"],
    });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve(true);
        return;
      }

      if (code === 1) {
        resolve(false);
        return;
      }

      const suffix = signal ? `signal-${signal}` : `exit-code-${code}`;
      reject(new Error(`git merge-base failed with ${suffix}`));
    });
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
