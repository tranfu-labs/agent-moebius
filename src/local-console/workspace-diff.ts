import { spawn } from "node:child_process";

import { WORKTREE_GIT_TIMEOUT_MS } from "../config.js";
import {
  LOCAL_CONSOLE_FILE_CONTENT_MAX_BYTES,
  normalizeLocalWorkspaceFilePath,
  readLocalWorkspaceTextFile,
  splitTextLines,
} from "./file-read.js";
import type {
  LocalConsoleFileContent,
  LocalConsoleFileLine,
  LocalConsoleWorkspaceDiffFile,
} from "./types.js";

export type LocalConversationWorkspaceDiff =
  | { available: true; fileCount: number; files: LocalConsoleWorkspaceDiffFile[]; reason: null }
  | {
      available: false;
      fileCount: null;
      files: [];
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
      ["-C", input.workspacePath, "diff", "--numstat", "--no-renames", "-z", input.baselineCommit, "--", "."],
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

  const files = new Map(parseNumstat(tracked.stdout).map((entry) => [entry.path, entry]));
  await Promise.all(splitNul(untracked.stdout).map(async (filePath) => {
    const content = await readLocalWorkspaceTextFile({
      workspacePath: input.workspacePath,
      filePath,
    });
    files.set(filePath, {
      path: filePath,
      additions: content.available ? splitTextLines(content.text ?? "").length : null,
      deletions: content.available ? 0 : null,
    });
  }));
  const sortedFiles = [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
  return { available: true, fileCount: sortedFiles.length, files: sortedFiles, reason: null };
}

export async function readLocalConversationDiffFile(input: {
  workspacePath: string;
  baselineCommit: string | null;
  filePath: string;
  gitTimeoutMs?: number;
  signal?: AbortSignal;
}): Promise<LocalConsoleFileContent> {
  const normalizedPath = normalizeLocalWorkspaceFilePath(input.filePath);
  if (normalizedPath === null) {
    return unavailableFile(input.filePath, "outside-workspace");
  }
  if (input.baselineCommit === null) {
    return readLocalWorkspaceTextFile({
      workspacePath: input.workspacePath,
      filePath: normalizedPath,
    });
  }

  const timeoutMs = input.gitTimeoutMs ?? WORKTREE_GIT_TIMEOUT_MS;
  const untracked = await runGit(
    ["-C", input.workspacePath, "ls-files", "--others", "--exclude-standard", "-z", "--", normalizedPath],
    timeoutMs,
    input.signal,
  );
  if (untracked.code !== 0) {
    return unavailableFile(normalizedPath, "workspace-unavailable");
  }
  if (splitNul(untracked.stdout).includes(normalizedPath)) {
    const content = await readLocalWorkspaceTextFile({
      workspacePath: input.workspacePath,
      filePath: normalizedPath,
    });
    return content.available
      ? {
          available: true,
          path: normalizedPath,
          lines: splitTextLines(content.text ?? "").map((text, index) => ({
            kind: "addition",
            oldLineNumber: null,
            newLineNumber: index + 1,
            text,
          })),
          reason: null,
        }
      : content;
  }

  const patch = await runGit(
    [
      "-C",
      input.workspacePath,
      "diff",
      "--no-ext-diff",
      "--no-renames",
      "--unified=1000000",
      input.baselineCommit,
      "--",
      normalizedPath,
    ],
    timeoutMs,
    input.signal,
    LOCAL_CONSOLE_FILE_CONTENT_MAX_BYTES * 4,
  ).catch((error: unknown) => {
    if (error instanceof GitOutputLimitError) {
      return null;
    }
    throw error;
  });
  if (patch === null) {
    return unavailableFile(normalizedPath, "file-too-large");
  }
  if (patch.code !== 0) {
    return unavailableFile(normalizedPath, "workspace-unavailable");
  }
  const patchText = patch.stdout.toString("utf8");
  if (/^Binary files .+ differ$/mu.test(patchText) || /^GIT binary patch$/mu.test(patchText)) {
    return unavailableFile(normalizedPath, "binary-file");
  }
  if (patchText === "") {
    return readLocalWorkspaceTextFile({
      workspacePath: input.workspacePath,
      filePath: normalizedPath,
    });
  }
  const lines = parseUnifiedDiff(patchText);
  return lines.length === 0
    ? unavailableFile(normalizedPath, "binary-file")
    : { available: true, path: normalizedPath, lines, reason: null };
}

function unavailable(reason: Exclude<LocalConversationWorkspaceDiff, { available: true }>["reason"]): LocalConversationWorkspaceDiff {
  return { available: false, fileCount: null, files: [], reason };
}

function splitNul(value: Buffer): string[] {
  return value.toString("utf8").split("\0").filter(Boolean);
}

function parseNumstat(value: Buffer): LocalConsoleWorkspaceDiffFile[] {
  return splitNul(value).flatMap((record) => {
    const [rawAdditions, rawDeletions, ...pathParts] = record.split("\t");
    const filePath = pathParts.join("\t");
    if (rawAdditions === undefined || rawDeletions === undefined || filePath === "") {
      return [];
    }
    return [{
      path: filePath,
      additions: parseNumstatCount(rawAdditions),
      deletions: parseNumstatCount(rawDeletions),
    }];
  });
}

function parseNumstatCount(value: string): number | null {
  if (value === "-") {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseUnifiedDiff(patch: string): LocalConsoleFileLine[] {
  const output: LocalConsoleFileLine[] = [];
  let oldLineNumber = 0;
  let newLineNumber = 0;
  let insideHunk = false;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
    if (hunk !== null) {
      oldLineNumber = Number(hunk[1]);
      newLineNumber = Number(hunk[2]);
      insideHunk = true;
      continue;
    }
    if (!insideHunk || line === "\\ No newline at end of file") {
      continue;
    }
    if (line.startsWith("+")) {
      output.push({
        kind: "addition",
        oldLineNumber: null,
        newLineNumber,
        text: line.slice(1),
      });
      newLineNumber += 1;
      continue;
    }
    if (line.startsWith("-")) {
      output.push({
        kind: "deletion",
        oldLineNumber,
        newLineNumber: null,
        text: line.slice(1),
      });
      oldLineNumber += 1;
      continue;
    }
    if (line.startsWith(" ")) {
      output.push({
        kind: "unchanged",
        oldLineNumber,
        newLineNumber,
        text: line.slice(1),
      });
      oldLineNumber += 1;
      newLineNumber += 1;
    }
  }
  return output;
}

function unavailableFile(
  filePath: string,
  reason: Extract<LocalConsoleFileContent, { available: false }>["reason"],
): Extract<LocalConsoleFileContent, { available: false }> {
  return { available: false, path: filePath, lines: [], reason };
}

class GitOutputLimitError extends Error {}

async function runGit(
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal,
  maxOutputBytes?: number,
): Promise<GitResult> {
  return await new Promise<GitResult>((resolve, reject) => {
    const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
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
    const collect = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (maxOutputBytes !== undefined && outputBytes > maxOutputBytes) {
        child.kill("SIGKILL");
        finish(new GitOutputLimitError("git-output-limit"));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
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
