import { spawn } from "node:child_process";
import { CEO_ORCHESTRATION_ACTION_TIMEOUT_MS, OUTPUT_ARTIFACT_RELEASE_TAG } from "./config.js";
import type { IssueSource, RepositoryRef } from "./issue-source.js";
import type { PreparedOutputArtifact, PublishedArtifact } from "./media-assets.js";
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

export interface CreatedIssue {
  number: number;
  url: string;
}

export type IssueLookupByOrchestrationKeyResult =
  | { kind: "none" }
  | { kind: "one"; issue: CreatedIssue }
  | { kind: "multiple"; issues: CreatedIssue[] };

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

export async function createIssue(
  source: IssueSource,
  input: { title: string; body: string },
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<CreatedIssue> {
  const result = await runCommand("gh", buildCreateIssueArgs(source, input.title), {
    stdin: input.body,
    retry: false,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
  });
  return parseCreatedIssueUrl(result.stdout, source);
}

export async function findIssueByOrchestrationKey(
  source: IssueSource,
  key: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<IssueLookupByOrchestrationKeyResult> {
  const result = await runCommand("gh", buildFindIssueByOrchestrationKeyArgs(source, key), {
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
  });
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isIssueSearchResultList(parsed)) {
    throw new Error("gh issue list returned an unexpected issue search shape");
  }

  const issues = parsed.map((issue) => ({ number: issue.number, url: issue.url }));
  if (issues.length === 0) {
    return { kind: "none" };
  }
  if (issues.length === 1) {
    return { kind: "one", issue: issues[0]! };
  }
  return { kind: "multiple", issues };
}

export async function addReaction(target: ReactionTarget, content: IssueReactionContent): Promise<void> {
  await runCommand("gh", buildAddReactionArgs(target, content));
}

export async function addIssueReaction(source: IssueSource, content: IssueReactionContent): Promise<void> {
  await addReaction({ kind: "issue", source }, content);
}

export async function publishReleaseArtifacts(
  source: IssueSource,
  files: PreparedOutputArtifact[],
): Promise<PublishedArtifact[]> {
  if (files.length === 0) {
    return [];
  }

  await ensureArtifactRelease(source);
  for (const file of files) {
    await runCommand("gh", buildReleaseUploadArgs(source, file), { retry: false });
  }

  const assets = await listArtifactReleaseAssets(source);
  return files.map((file) => ({
    displayName: file.displayName,
    kind: file.kind,
    url: assets.get(file.assetName) ?? buildReleaseAssetUrl(source, file.assetName),
  }));
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

export function buildCreateIssueArgs(source: IssueSource, title: string): string[] {
  return ["issue", "create", "--repo", `${source.owner}/${source.repo}`, "--title", title, "--body-file", "-"];
}

export function buildFindIssueByOrchestrationKeyArgs(source: IssueSource, key: string): string[] {
  return [
    "issue",
    "list",
    "--repo",
    `${source.owner}/${source.repo}`,
    "--state",
    "all",
    "--search",
    key,
    "--json",
    "number,url",
  ];
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

export function buildReleaseViewArgs(source: IssueSource): string[] {
  return [
    "release",
    "view",
    OUTPUT_ARTIFACT_RELEASE_TAG,
    "--repo",
    `${source.owner}/${source.repo}`,
    "--json",
    "assets",
  ];
}

export function buildReleaseCreateArgs(source: IssueSource): string[] {
  return [
    "release",
    "create",
    OUTPUT_ARTIFACT_RELEASE_TAG,
    "--repo",
    `${source.owner}/${source.repo}`,
    "--title",
    "Agent Moebius artifacts",
    "--notes",
    "Generated media artifacts for Agent Moebius issue comments.",
    "--latest=false",
  ];
}

export function buildReleaseUploadArgs(source: IssueSource, file: PreparedOutputArtifact): string[] {
  return [
    "release",
    "upload",
    OUTPUT_ARTIFACT_RELEASE_TAG,
    `${file.filePath}#${file.displayName}`,
    "--repo",
    `${source.owner}/${source.repo}`,
    "--clobber",
  ];
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

const DEFAULT_GH_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_GH_COMMAND_TERMINATION_GRACE_MS = 5_000;

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
    const suffix = signal ? `signal ${signal}` : exitCode === null ? "unknown exit" : `exit code ${exitCode}`;
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
  timeoutMs?: number;
  terminationGraceMs?: number;
}

export async function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  const attempt = () =>
    spawnCommand(command, args, {
      stdin: options.stdin,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      terminationGraceMs: options.terminationGraceMs,
    });
  if (options.retry === false) {
    return attempt();
  }

  return withRetry(attempt, {
    label: `${command}:${args[0] ?? ""}`,
    signal: options.signal,
    shouldRetry: (error) => classifyGhError(error) === "transient",
  });
}

interface SpawnCommandOptions {
  stdin?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  terminationGraceMs?: number;
}

function spawnCommand(command: string, args: string[], options: SpawnCommandOptions): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    if (isSignalAborted(options.signal)) {
      reject(commandTerminatedError(command, null, abortDetail(options.signal?.reason)));
      return;
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_GH_COMMAND_TIMEOUT_MS;
    const terminationGraceMs = options.terminationGraceMs ?? DEFAULT_GH_COMMAND_TERMINATION_GRACE_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      reject(new Error(`Invalid gh command timeout: ${String(timeoutMs)}`));
      return;
    }
    if (!Number.isFinite(terminationGraceMs) || terminationGraceMs < 0) {
      reject(new Error(`Invalid gh command termination grace: ${String(terminationGraceMs)}`));
      return;
    }

    const child = spawn(command, args, {
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let terminationDetail: string | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let killTimer: NodeJS.Timeout | null = null;
    let settled = false;

    const cleanup = () => {
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
      }
      if (killTimer !== null) {
        clearTimeout(killTimer);
      }
      options.signal?.removeEventListener("abort", onAbort);
    };

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      fn();
    };

    const requestTermination = (detail: string) => {
      if (terminationDetail !== null || settled) {
        return;
      }

      terminationDetail = detail;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, terminationGraceMs);
      killTimer.unref();
    };

    const onAbort = () => {
      requestTermination(abortDetail(options.signal?.reason));
    };

    if (child.stdout === null || child.stderr === null) {
      requestTermination("missing stdout/stderr pipe");
      finish(() => reject(new Error(`${command} did not expose stdout/stderr pipes`)));
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

    child.once("error", (error) => {
      finish(() => reject(error));
    });
    child.once("close", (code, signal) => {
      if (terminationDetail === null && code === 0) {
        finish(() => resolve({ stdout, stderr }));
        return;
      }

      finish(() => reject(commandTerminatedError(command, code, terminationDetail ?? stderr, signal)));
    });

    timeoutTimer = setTimeout(() => {
      requestTermination(`timed out after ${timeoutMs}ms`);
    }, timeoutMs);
    timeoutTimer.unref();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (isSignalAborted(options.signal)) {
      requestTermination(abortDetail(options.signal?.reason));
    }

    if (options.stdin !== undefined) {
      if (child.stdin === null) {
        requestTermination("missing stdin pipe");
        finish(() => reject(new Error(`${command} did not expose stdin pipe`)));
        return;
      }

      child.stdin.end(options.stdin);
    }
  });
}

function commandTerminatedError(
  command: string,
  exitCode: number | null,
  detail: string,
  signal: NodeJS.Signals | null = null,
): CommandFailedError {
  return new CommandFailedError(command, exitCode, signal, detail);
}

function abortDetail(reason: unknown): string {
  if (typeof reason === "string" && reason.length > 0) {
    return `aborted: ${reason}`;
  }

  if (reason instanceof Error) {
    return `aborted: ${reason.message}`;
  }

  return "aborted";
}

function isSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
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

function isIssueSearchResultList(value: unknown): value is Array<{ number: number; url: string }> {
  return (
    Array.isArray(value) &&
    value.every((issue) => {
      if (typeof issue !== "object" || issue === null || Array.isArray(issue)) {
        return false;
      }

      const summary = issue as Partial<{ number: number; url: string }>;
      return Number.isInteger(summary.number) && summary.number !== undefined && summary.number > 0 && typeof summary.url === "string";
    })
  );
}

function parseCreatedIssueUrl(stdout: string, source: IssueSource): CreatedIssue {
  const trimmed = stdout.trim();
  const escapedOwner = escapeRegex(source.owner);
  const escapedRepo = escapeRegex(source.repo);
  const match = trimmed.match(new RegExp(`https://github\\.com/${escapedOwner}/${escapedRepo}/issues/(\\d+)`, "u"));
  const numberText = match?.[1];
  if (numberText === undefined) {
    throw new Error("gh issue create did not return a parseable GitHub issue URL");
  }

  const number = Number(numberText);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("gh issue create returned an invalid issue number");
  }

  return { number, url: `https://github.com/${source.owner}/${source.repo}/issues/${String(number)}` };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function ensureArtifactRelease(source: IssueSource): Promise<void> {
  try {
    await runCommand("gh", buildReleaseViewArgs(source));
  } catch {
    await runCommand("gh", buildReleaseCreateArgs(source), { retry: false });
  }
}

async function listArtifactReleaseAssets(source: IssueSource): Promise<Map<string, string>> {
  const result = await runCommand("gh", buildReleaseViewArgs(source));
  const parsed: unknown = JSON.parse(result.stdout);
  const assets = new Map<string, string>();
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { assets?: unknown }).assets)) {
    return assets;
  }

  for (const asset of (parsed as { assets: unknown[] }).assets) {
    if (typeof asset !== "object" || asset === null) {
      continue;
    }

    const record = asset as Partial<{ name: unknown; url: unknown }>;
    if (typeof record.name === "string" && typeof record.url === "string") {
      assets.set(record.name, record.url);
    }
  }

  return assets;
}

function buildReleaseAssetUrl(source: IssueSource, assetName: string): string {
  return `https://github.com/${source.owner}/${source.repo}/releases/download/${encodeURIComponent(
    OUTPUT_ARTIFACT_RELEASE_TAG,
  )}/${encodeURIComponent(assetName)}`;
}
