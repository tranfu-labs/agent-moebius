import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { WORKTREE_GIT_TIMEOUT_MS } from "../config.js";
import type { LocalConsoleWorkspaceMode } from "./types.js";

export interface LocalWorkspaceSourceInput {
  projectId: string;
  sessionId: string;
  folderPath: string;
  worktreeMode: boolean;
  workdirRoot: string;
  gitTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface ResolvedLocalWorkspace {
  cwd: string;
  mode: LocalConsoleWorkspaceMode;
  worktreePath: string | null;
  worktreeUnavailableReason: string | null;
}

interface GitRunOptions {
  label: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

interface WorkspaceResolverDependencies {
  access(targetPath: string): Promise<void>;
  mkdir(targetPath: string, options: { recursive: true }): Promise<void>;
  pathExists(targetPath: string): Promise<boolean>;
  runGit(args: string[], options: GitRunOptions, acceptedExitCodes: number[]): Promise<GitProcessResult>;
  gitTimeoutMs: number;
}

interface GitProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

const defaultDependencies: WorkspaceResolverDependencies = {
  access: (targetPath) => fs.access(targetPath),
  mkdir: async (targetPath, options) => {
    await fs.mkdir(targetPath, options);
  },
  pathExists,
  runGit: runGitProcess,
  gitTimeoutMs: WORKTREE_GIT_TIMEOUT_MS,
};

export async function resolveLocalWorkspaceSource(
  input: LocalWorkspaceSourceInput,
  dependencies: WorkspaceResolverDependencies = defaultDependencies,
): Promise<ResolvedLocalWorkspace> {
  const effectiveDependencies = {
    ...dependencies,
    gitTimeoutMs: input.gitTimeoutMs ?? dependencies.gitTimeoutMs,
  };
  const folderPath = path.resolve(input.folderPath);
  await effectiveDependencies.access(folderPath);

  if (!input.worktreeMode) {
    return {
      cwd: folderPath,
      mode: "direct",
      worktreePath: null,
      worktreeUnavailableReason: null,
    };
  }

  const repoRoot = await detectGitRepositoryRoot(folderPath, input.signal, effectiveDependencies);
  if (repoRoot === null) {
    return {
      cwd: folderPath,
      mode: "direct",
      worktreePath: null,
      worktreeUnavailableReason: "not-git-repository",
    };
  }

  const worktreePath = localWorktreePath(input.workdirRoot, input.projectId, input.sessionId);
  await effectiveDependencies.mkdir(path.dirname(worktreePath), { recursive: true });
  if (await effectiveDependencies.pathExists(worktreePath)) {
    await assertUsableGitWorktree(worktreePath, input.signal, effectiveDependencies);
    return {
      cwd: worktreePath,
      mode: "worktree",
      worktreePath,
      worktreeUnavailableReason: null,
    };
  }

  await runBoundedGit(
    ["-C", repoRoot, "worktree", "add", "-B", localWorktreeBranch(input.projectId, input.sessionId), worktreePath, "HEAD"],
    "worktree-add",
    input.signal,
    effectiveDependencies,
  );

  return {
    cwd: worktreePath,
    mode: "worktree",
    worktreePath,
    worktreeUnavailableReason: null,
  };
}

async function detectGitRepositoryRoot(
  folderPath: string,
  signal: AbortSignal | undefined,
  dependencies: WorkspaceResolverDependencies,
): Promise<string | null> {
  const result = await runBoundedGit(["-C", folderPath, "rev-parse", "--show-toplevel"], "rev-parse", signal, dependencies, [0, 128]);
  if (result.code !== 0) {
    return null;
  }
  const root = result.stdout.trim();
  return root === "" ? null : path.resolve(root);
}

async function assertUsableGitWorktree(
  worktreePath: string,
  signal: AbortSignal | undefined,
  dependencies: WorkspaceResolverDependencies,
): Promise<void> {
  const result = await runBoundedGit(["-C", worktreePath, "rev-parse", "--show-toplevel"], "worktree-reuse", signal, dependencies, [0]);
  if (result.code !== 0) {
    throw new Error(formatGitFailure("git", result, "worktree-reuse"));
  }
}

async function runBoundedGit(
  args: string[],
  label: string,
  signal: AbortSignal | undefined,
  dependencies: WorkspaceResolverDependencies,
  acceptedExitCodes = [0],
): Promise<GitProcessResult> {
  return await dependencies.runGit(args, { label, timeoutMs: dependencies.gitTimeoutMs, signal }, acceptedExitCodes);
}

function localWorktreePath(workdirRoot: string, projectId: string, sessionId: string): string {
  return path.join(workdirRoot, "local-worktrees", safePathSegment(projectId), safePathSegment(sessionId));
}

function localWorktreeBranch(projectId: string, sessionId: string): string {
  return `agent/local-${safePathSegment(projectId)}-${safePathSegment(sessionId)}`.slice(0, 240);
}

function safePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/gu, "_");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runGitProcess(
  args: string[],
  options: GitRunOptions,
  acceptedExitCodes: number[],
): Promise<GitProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeoutTimer: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const settleReject = (error: Error) => {
      if (settled) {
        return;
      }
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
    const onAbort = () => {
      terminate();
      settleReject(new Error(`workspace-git-aborted:${options.label}`));
    };

    timeoutTimer = setTimeout(() => {
      terminate();
      settleReject(new Error(`workspace-git-timeout:${options.label}:${String(options.timeoutMs)}ms`));
    }, options.timeoutMs);
    timeoutTimer.unref?.();

    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });

    if (child.stdout === null || child.stderr === null) {
      settleReject(new Error("git did not expose stdout/stderr pipes"));
      return;
    }
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
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
      const result = { code, signal, stdout, stderr };
      if (code !== null && acceptedExitCodes.includes(code)) {
        resolve(result);
        return;
      }
      reject(new Error(formatGitFailure("git", result, options.label)));
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
