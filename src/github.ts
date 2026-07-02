import { spawn } from "node:child_process";
import type { IssueSource, RepositoryRef } from "./issue-source.js";
import { classifyGhError, withRetry } from "./retry.js";

export interface GitHubComment {
  id: string;
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

export type ReactionTarget =
  | {
      kind: "issue";
      source: IssueSource;
    }
  | {
      kind: "issue-comment";
      source: IssueSource;
      commentId: string;
    };

const ADD_REACTION_MUTATION =
  "mutation($subjectId: ID!, $content: ReactionContent!) { addReaction(input: {subjectId: $subjectId, content: $content}) { reaction { content } } }";

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

export async function fetchIssueWithComments(
  source: IssueSource,
  options: { signal?: AbortSignal } = {},
): Promise<GitHubIssue> {
  let result: CommandResult;
  try {
    result = await runCommand("gh", buildFetchIssueWithCommentsArgs(source), { signal: options.signal });
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
  // 写操作默认不自动重试：无幂等去重标记前，重发可能造成重复评论。
  await runCommand("gh", buildPostCommentArgs(source), { stdin: body, retry: false });
}

export async function addReaction(target: ReactionTarget, content: IssueReactionContent): Promise<void> {
  await runCommand("gh", buildAddReactionArgs(target, content));
}

export async function addIssueReaction(source: IssueSource, content: IssueReactionContent): Promise<void> {
  await addReaction({ kind: "issue", source }, content);
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
  return buildAddReactionArgs({ kind: "issue", source }, content);
}

export function buildAddReactionArgs(target: ReactionTarget, content: IssueReactionContent): string[] {
  if (target.kind === "issue-comment") {
    return [
      "api",
      "graphql",
      "-f",
      `query=${ADD_REACTION_MUTATION}`,
      "-f",
      `subjectId=${target.commentId}`,
      "-f",
      `content=${toGraphqlReactionContent(content)}`,
    ];
  }

  return [
    "api",
    "--method",
    "POST",
    `repos/${target.source.owner}/${target.source.repo}/issues/${target.source.issueNumber}/reactions`,
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

export class CommandFailedError extends Error {
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

interface RunCommandOptions {
  stdin?: string;
  signal?: AbortSignal;
  retry?: boolean;
}

async function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  const attempt = () => spawnCommand(command, args, options.stdin);
  if (options.retry === false) {
    return attempt();
  }

  return withRetry(attempt, {
    label: `${command}:${args[0] ?? ""}`,
    signal: options.signal,
    shouldRetry: (error) => classifyGhError(error) === "transient",
  });
}

function spawnCommand(command: string, args: string[], stdin?: string): Promise<CommandResult> {
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

export function isTransientGitHubCliError(error: unknown): boolean {
  return isCommandFailedError(error) && classifyGhError(error) === "transient";
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
    issue.comments.every(
      (comment) =>
        typeof comment === "object" &&
        comment !== null &&
        typeof comment.id === "string" &&
        typeof comment.body === "string",
    )
  );
}

function toGraphqlReactionContent(content: IssueReactionContent): string {
  if (content === "eyes") {
    return "EYES";
  }

  const exhaustive: never = content;
  return exhaustive;
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
