import { spawn } from "node:child_process";

import { WORKTREE_GIT_TIMEOUT_MS } from "../config.js";

export type LocalConversationWorkspaceDiff =
  | { available: true; fileCount: number; reason: null }
  | {
      available: false;
      fileCount: null;
      reason: "missing-baseline" | "not-git-repository" | "workspace-unavailable" | "baseline-unavailable";
    };

interface GitResult {
  code: number | null;
  stdout: Buffer;
  stderr: Buffer;
}

export async function readLocalConversationBaselineCommit(input: {
  folderPath: string;
  gitTimeoutMs?: number;
  signal?: AbortSignal;
}): Promise<string | null> {
  const result = await runGit(
    ["-C", input.folderPath, "rev-parse", "--verify", "HEAD^{commit}"],
    input.gitTimeoutMs ?? WORKTREE_GIT_TIMEOUT_MS,
    input.signal,
  );
  if (result.code !== 0) {
    return null;
  }
  const commit = result.stdout.toString("utf8").trim();
  return commit === "" ? null : commit;
}

export async function readLocalConversationWorkspaceDiff(input: {
  workspacePath: string;
  baselineCommit: string | null;
  gitTimeoutMs?: number;
  signal?: AbortSignal;
}): Promise<LocalConversationWorkspaceDiff> {
  if (input.baselineCommit === null) {
    return unavailable("missing-baseline");
  }
  const timeoutMs = input.gitTimeoutMs ?? WORKTREE_GIT_TIMEOUT_MS;
  const repository = await runGit(
    ["-C", input.workspacePath, "rev-parse", "--is-inside-work-tree"],
    timeoutMs,
    input.signal,
  );
  if (repository.code !== 0) {
    return unavailable(repository.stderr.toString("utf8").includes("not a git repository")
      ? "not-git-repository"
      : "workspace-unavailable");
  }

  const baseline = await runGit(
    ["-C", input.workspacePath, "cat-file", "-e", `${input.baselineCommit}^{commit}`],
    timeoutMs,
    input.signal,
  );
  if (baseline.code !== 0) {
    return unavailable("baseline-unavailable");
  }

  const [tracked, untracked] = await Promise.all([
    runGit(
      ["-C", input.workspacePath, "diff", "--name-only", "-z", input.baselineCommit, "--", "."],
      timeoutMs,
      input.signal,
    ),
    runGit(
      ["-C", input.workspacePath, "ls-files", "--others", "--exclude-standard", "-z", "--", "."],
      timeoutMs,
      input.signal,
    ),
  ]);
  if (tracked.code !== 0 || untracked.code !== 0) {
    return unavailable("workspace-unavailable");
  }

  const files = new Set([...splitNul(tracked.stdout), ...splitNul(untracked.stdout)]);
  return { available: true, fileCount: files.size, reason: null };
}

function unavailable(reason: Exclude<LocalConversationWorkspaceDiff, { available: true }>["reason"]): LocalConversationWorkspaceDiff {
  return { available: false, fileCount: null, reason };
}

function splitNul(value: Buffer): string[] {
  return value.toString("utf8").split("\0").filter(Boolean);
}

async function runGit(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<GitResult> {
  return await new Promise<GitResult>((resolve, reject) => {
    const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`git-timeout:${String(timeoutMs)}ms`));
    }, timeoutMs);
    timer.unref();

    const handleAbort = () => {
      child.kill("SIGKILL");
      finish(new Error(`git-aborted:${String(signal?.reason ?? "aborted")}`));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", (error) => finish(error));
    child.once("close", (code) => finish(null, code));

    function finish(error: Error | null, code: number | null = null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
      if (error !== null) {
        reject(error);
        return;
      }
      resolve({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    }
  });
}
