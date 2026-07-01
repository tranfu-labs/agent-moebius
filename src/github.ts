import { spawn } from "node:child_process";
import type { IssueSource, RepositoryRef } from "./issue-source.js";

export interface GitHubComment {
  body: string;
}

export interface GitHubIssue {
  body: string;
  updatedAt: string;
  state: "OPEN" | "CLOSED";
  comments: GitHubComment[];
}

export interface GitHubIssueSummary {
  issueNumber: number;
  updatedAt: string;
}

export type IssueReactionContent = "eyes";

export async function listOpenIssueSummaries(
  repository: RepositoryRef,
  limit: number,
): Promise<GitHubIssueSummary[]> {
  const result = await runCommand("gh", buildListOpenIssueSummariesArgs(repository, limit));
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isGitHubIssueSummaryList(parsed)) {
    throw new Error("gh issue list returned an unexpected issue summary shape");
  }

  return parsed.map((issue) => ({
    issueNumber: issue.number,
    updatedAt: issue.updatedAt,
  }));
}

export async function fetchIssueWithComments(source: IssueSource): Promise<GitHubIssue> {
  let result: CommandResult;
  try {
    result = await runCommand("gh", buildFetchIssueWithCommentsArgs(source));
  } catch (error) {
    if (isCommandFailedError(error) && isIssueNotFoundMessage(error.stderr)) {
      throw new GitHubIssueNotFoundError(source.issueKey, error.stderr);
    }

    throw error;
  }

  const parsed: unknown = JSON.parse(result.stdout);
  if (!isGitHubIssue(parsed)) {
    throw new Error("gh issue view returned an unexpected issue shape");
  }

  return parsed;
}

export async function postComment(source: IssueSource, body: string): Promise<void> {
  await runCommand("gh", buildPostCommentArgs(source), body);
}

export async function addIssueReaction(source: IssueSource, content: IssueReactionContent): Promise<void> {
  await runCommand("gh", buildAddIssueReactionArgs(source, content));
}

export function buildListOpenIssueSummariesArgs(repository: RepositoryRef, limit: number): string[] {
  return [
    "issue",
    "list",
    "--repo",
    `${repository.owner}/${repository.repo}`,
    "--state",
    "open",
    "--limit",
    String(limit),
    "--json",
    "number,updatedAt",
  ];
}

export function buildFetchIssueWithCommentsArgs(source: IssueSource): string[] {
  return [
    "issue",
    "view",
    String(source.issueNumber),
    "--repo",
    `${source.owner}/${source.repo}`,
    "--json",
    "body,comments,updatedAt,state",
  ];
}

export function buildPostCommentArgs(source: IssueSource): string[] {
  return ["issue", "comment", String(source.issueNumber), "--repo", `${source.owner}/${source.repo}`, "--body-file", "-"];
}

export function buildAddIssueReactionArgs(source: IssueSource, content: IssueReactionContent): string[] {
  return [
    "api",
    "--method",
    "POST",
    `repos/${source.owner}/${source.repo}/issues/${source.issueNumber}/reactions`,
    "-f",
    `content=${content}`,
  ];
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

export function isGitHubIssue(value: unknown): value is GitHubIssue {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const issue = value as Partial<GitHubIssue>;
  return (
    typeof issue.body === "string" &&
    typeof issue.updatedAt === "string" &&
    (issue.state === "OPEN" || issue.state === "CLOSED") &&
    Array.isArray(issue.comments) &&
    issue.comments.every((comment) => typeof comment === "object" && comment !== null && typeof comment.body === "string")
  );
}

function isGitHubIssueSummaryList(value: unknown): value is Array<{ number: number; updatedAt: string }> {
  return (
    Array.isArray(value) &&
    value.every((issue) => {
      if (typeof issue !== "object" || issue === null || Array.isArray(issue)) {
        return false;
      }

      const summary = issue as Partial<{ number: number; updatedAt: string }>;
      return Number.isInteger(summary.number) && summary.number !== undefined && summary.number > 0 && typeof summary.updatedAt === "string";
    })
  );
}
