import { spawn } from "node:child_process";
import { ISSUE_NUMBER, OWNER, REPO } from "./config.js";

export interface GitHubComment {
  body: string;
}

export interface GitHubIssue {
  body: string;
  comments: GitHubComment[];
}

export async function fetchIssueWithComments(): Promise<GitHubIssue> {
  let result: CommandResult;
  try {
    result = await runCommand("gh", [
      "issue",
      "view",
      String(ISSUE_NUMBER),
      "--repo",
      `${OWNER}/${REPO}`,
      "--json",
      "body,comments",
    ]);
  } catch (error) {
    if (isCommandFailedError(error) && isIssueNotFoundMessage(error.stderr)) {
      throw new GitHubIssueNotFoundError(`${OWNER}/${REPO}#${ISSUE_NUMBER}`, error.stderr);
    }

    throw error;
  }

  const parsed: unknown = JSON.parse(result.stdout);
  if (!isGitHubIssue(parsed)) {
    throw new Error("gh issue view returned an unexpected issue shape");
  }

  return parsed;
}

export async function postComment(body: string): Promise<void> {
  await runCommand(
    "gh",
    ["issue", "comment", String(ISSUE_NUMBER), "--repo", `${OWNER}/${REPO}`, "--body-file", "-"],
    body,
  );
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

export class GitHubIssueNotFoundError extends Error {
  constructor(
    readonly issueKey: string,
    readonly detail: string,
  ) {
    super(`GitHub issue not found: ${issueKey}`);
    this.name = "GitHubIssueNotFoundError";
  }
}

class CommandFailedError extends Error {
  constructor(
    readonly command: string,
    readonly exitCode: number | null,
    readonly signal: NodeJS.Signals | null,
    readonly stderr: string,
  ) {
    const suffix = signal ? `signal ${signal}` : `exit code ${exitCode}`;
    super(`${command} failed with ${suffix}: ${stderr.trim()}`);
    this.name = "CommandFailedError";
  }
}

export function isGitHubIssueNotFoundError(error: unknown): error is GitHubIssueNotFoundError {
  return error instanceof GitHubIssueNotFoundError;
}

export function isIssueNotFoundMessage(stderr: string): boolean {
  return /Could not resolve to an issue or pull request with the number/i.test(stderr);
}

async function runCommand(command: string, args: string[], stdin?: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout === null || child.stderr === null) {
      reject(new Error(`${command} did not expose stdout/stderr pipes`));
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

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new CommandFailedError(command, code, signal, stderr));
    });

    if (stdin !== undefined) {
      if (child.stdin === null) {
        reject(new Error(`${command} did not expose stdin pipe`));
        return;
      }

      child.stdin.end(stdin);
    }
  });
}

function isCommandFailedError(error: unknown): error is CommandFailedError {
  return error instanceof CommandFailedError;
}

function isGitHubIssue(value: unknown): value is GitHubIssue {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const issue = value as Partial<GitHubIssue>;
  return (
    typeof issue.body === "string" &&
    Array.isArray(issue.comments) &&
    issue.comments.every((comment) => typeof comment === "object" && comment !== null && typeof comment.body === "string")
  );
}
