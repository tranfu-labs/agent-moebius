import { CEO_ORCHESTRATION_ACTION_TIMEOUT_MS } from "../config.js";
import {
  extractCeoOrchestrationKeyFromNote,
  extractCeoRoundtableKey,
  type CeoChildIssueDescriptor,
} from "../ceo-orchestration.js";
import { appendCeoReviewedMetadata, CEO_CORRECTED_METADATA, type FormatCeoResult } from "../format-ceo.js";
import { buildTimeline, formatAgentComment } from "../conversation.js";
import type { CreatedIssue, GitHubIssue } from "../github.js";
import type { saveGoalLedgerEntry } from "../goal-ledger-state.js";
import type { GoalLedgerEntry, IssueReference, TaskRecord } from "../goal-ledger.js";
import type { IssueSource } from "../issue-source.js";
import { makeIssueSource } from "../issue-source.js";

export type PostVisibleComment = (body: string) => Promise<void>;

export interface GoalLedgerEntrySaveDependencies {
  saveGoalLedgerEntry: typeof saveGoalLedgerEntry;
}

export interface CeoSpawnCompletedItem {
  kind: "created" | "already-created" | "recovered-existing";
  descriptor: CeoChildIssueDescriptor;
  issue: CreatedIssue;
  orchestrationKey: string;
}

export interface RoundtableIssueContext {
  parentSource: IssueSource;
  roundtableKey: string;
  workflowId: string;
  ledgerTaskId: string;
  topic: string;
  participants: string[];
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label}-timeout:${String(timeoutMs)}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

export function issueContainsHiddenKey(issue: GitHubIssue, key: string): boolean {
  return issue.body.includes(key) || issue.comments.some((comment) => comment.body.includes(key));
}

export function issueReferenceMatchesSource(reference: IssueReference, source: IssueSource): boolean {
  return reference.owner === source.owner && reference.repo === source.repo && reference.number === source.issueNumber;
}

export function issueLikeFromReference(reference: IssueReference): { owner: string; repo: string; number: number } {
  return {
    owner: reference.owner,
    repo: reference.repo,
    number: reference.number,
  };
}

export function issueFromReference(reference: IssueReference): CreatedIssue {
  return {
    number: reference.number,
    url: `https://github.com/${reference.owner}/${reference.repo}/issues/${String(reference.number)}`,
  };
}

export function parseIssueUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/\d+$/u);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`invalid-created-issue-url:${url}`);
  }
  return { owner: match[1], repo: match[2] };
}

export function issueUrl(source: IssueSource): string {
  return `https://github.com/${source.owner}/${source.repo}/issues/${String(source.issueNumber)}`;
}

export function buildCeoIssueContext(source: IssueSource, issue: GitHubIssue): {
  issueUrl: string;
  issueBody: string;
  comments: Array<{ body: string }>;
} {
  return {
    issueUrl: issueUrl(source),
    issueBody: issue.body,
    comments: issue.comments.map((comment) => ({ body: comment.body })),
  };
}

export function isTaskRecord(entry: GoalLedgerEntry): entry is TaskRecord {
  return "childIssueRefs" in entry && "runManifestRefs" in entry;
}

export function findTaskByChildIssue(ledger: { tasks: Record<string, TaskRecord> }, source: IssueSource): TaskRecord | null {
  const matches = Object.values(ledger.tasks).filter((task) =>
    task.childIssueRefs.some((reference) => reference.relation === "child" && issueReferenceMatchesSource(reference, source)),
  );
  return matches.length === 1 ? matches[0]! : null;
}

export function findTaskChildIssueRefByOrchestrationKey(
  ledger: { tasks: Record<string, TaskRecord> },
  ledgerTaskId: string,
  orchestrationKey: string,
): IssueReference | null {
  const task = ledger.tasks[ledgerTaskId];
  if (task === undefined) {
    return null;
  }

  return task.childIssueRefs.find((reference) => extractCeoOrchestrationKeyFromNote(reference.note) === orchestrationKey) ?? null;
}

export function findTaskChildIssueRefByRoundtableKey(
  ledger: { tasks: Record<string, TaskRecord> },
  ledgerTaskId: string,
  roundtableKey: string,
): IssueReference | null {
  const task = ledger.tasks[ledgerTaskId];
  if (task === undefined) {
    return null;
  }

  return task.childIssueRefs.find((reference) => extractCeoRoundtableKey(reference.note) === roundtableKey) ?? null;
}

export function parseRoundtableIssueContext(body: string): RoundtableIssueContext | null {
  const roundtableKey = extractCeoRoundtableKey(body);
  if (roundtableKey === null) {
    return null;
  }
  const parentUrl = matchField(body, "Parent issue");
  const workflowId = matchField(body, "Workflow id");
  const ledgerTaskId = matchField(body, "Ledger task id");
  if (parentUrl === null || workflowId === null || ledgerTaskId === null) {
    return null;
  }
  const parentSource = parseIssueSourceUrl(parentUrl);
  if (parentSource === null) {
    return null;
  }
  const participants = parseRoundtableParticipants(body);
  if (participants.length === 0) {
    return null;
  }
  return {
    parentSource,
    roundtableKey,
    workflowId,
    ledgerTaskId,
    topic: matchMultilineSection(body, "Topic") ?? "",
    participants,
  };
}

export function requireRoundtableIssueContext(body: string): RoundtableIssueContext {
  const context = parseRoundtableIssueContext(body);
  if (context === null) {
    throw new Error("roundtable-context-missing");
  }
  return context;
}

export function roundtableParticipantMessageIndexes(issue: GitHubIssue, participants: readonly string[]): Record<string, number> {
  const timeline = buildTimeline(issue.body, issue.comments, [...participants, "ceo"]);
  const result: Record<string, number> = {};
  for (const message of timeline) {
    if (message.source === "comment" && participants.includes(message.speaker)) {
      result[message.speaker] = message.index;
    }
  }
  return result;
}

export function nextRoundtableParticipant(issue: GitHubIssue, participants: readonly string[]): string | null {
  const indexes = roundtableParticipantMessageIndexes(issue, participants);
  return participants.find((participant) => indexes[participant] === undefined) ?? null;
}

function parseIssueSourceUrl(url: string): IssueSource | null {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/u);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  return makeIssueSource({ owner: match[1], repo: match[2], issueNumber: Number.parseInt(match[3], 10) });
}

function parseRoundtableParticipants(body: string): string[] {
  const match = body.match(/Participants in order:\s*\n([\s\S]*?)(?:\n\n|$)/u);
  if (match?.[1] === undefined) {
    return [];
  }
  return match[1]
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/u, "").trim())
    .filter((line) => line !== "");
}

function matchField(body: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = body.match(new RegExp(`^${escaped}:\\s*(.+)$`, "mu"));
  return match?.[1]?.trim() ?? null;
}

function matchMultilineSection(body: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = body.match(new RegExp(`^${escaped}:\\s*\\n([\\s\\S]*?)(?:\\n\\n|$)`, "mu"));
  return match?.[1]?.trim() ?? null;
}

export async function saveTaskChildIssueRef(input: {
  dependencies: GoalLedgerEntrySaveDependencies;
  ledgerTaskId: string;
  issue: CreatedIssue;
  orchestrationKey: string;
  provenance: string;
}): Promise<void> {
  await withTimeout(
    input.dependencies.saveGoalLedgerEntry(
      "tasks",
      input.ledgerTaskId,
      (entry) => {
        if (entry === null || !isTaskRecord(entry)) {
          throw new Error(`missing-ledger-task:${input.ledgerTaskId}`);
        }
        if (entry.childIssueRefs.some((reference) => extractCeoOrchestrationKeyFromNote(reference.note) === input.orchestrationKey)) {
          return entry;
        }

        const note = truncateForComment(
          `${input.orchestrationKey}; provenance=${input.provenance.replace(/\s+/g, " ").trim()}`,
          500,
        );
        const repo = parseIssueUrl(input.issue.url);
        return {
          ...entry,
          childIssueRefs: [
            ...entry.childIssueRefs,
            {
              owner: repo.owner,
              repo: repo.repo,
              number: input.issue.number,
              relation: "child",
              status: "open",
              note,
            },
          ],
          updatedAt: new Date().toISOString(),
        };
      },
      undefined,
      { timeoutMs: CEO_ORCHESTRATION_ACTION_TIMEOUT_MS },
    ),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "saveGoalLedgerEntry",
  );
}

export async function saveTaskRoundtableChildIssueRef(input: {
  dependencies: GoalLedgerEntrySaveDependencies;
  ledgerTaskId: string;
  issue: CreatedIssue;
  roundtableKey: string;
  provenance: string;
}): Promise<void> {
  await withTimeout(
    input.dependencies.saveGoalLedgerEntry(
      "tasks",
      input.ledgerTaskId,
      (entry) => {
        if (entry === null || !isTaskRecord(entry)) {
          throw new Error(`missing-ledger-task:${input.ledgerTaskId}`);
        }
        if (entry.childIssueRefs.some((reference) => extractCeoRoundtableKey(reference.note) === input.roundtableKey)) {
          return entry;
        }

        const note = truncateForComment(
          `${input.roundtableKey}; provenance=${input.provenance.replace(/\s+/g, " ").trim()}`,
          500,
        );
        const repo = parseIssueUrl(input.issue.url);
        return {
          ...entry,
          childIssueRefs: [
            ...entry.childIssueRefs,
            {
              owner: repo.owner,
              repo: repo.repo,
              number: input.issue.number,
              relation: "child",
              status: "open",
              note,
            },
          ],
          updatedAt: new Date().toISOString(),
        };
      },
      undefined,
      { timeoutMs: CEO_ORCHESTRATION_ACTION_TIMEOUT_MS },
    ),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "saveGoalLedgerEntry",
  );
}

export function formatCeoOrchestrationFailureBody(input: {
  reason: string;
  completed: CeoSpawnCompletedItem[];
  pending: CeoChildIssueDescriptor[];
}): string {
  const completed =
    input.completed.length === 0
      ? "- none"
      : input.completed
          .map((item) => `- ${item.kind}: ${item.descriptor.ledgerTaskId} -> ${item.issue.url}`)
          .join("\n");
  const pending =
    input.pending.length === 0
      ? "- none"
      : input.pending.map((descriptor) => `- ${descriptor.ledgerTaskId}: ${descriptor.title}`).join("\n");

  return `CEO 编排路径 fail-closed：${input.reason}

已创建或已找回：
${completed}

未创建：
${pending}

本轮不会继续创建后续 issue，也不会更新 ceo role thread。下一轮会先按稳定 orchestration key 查 ledger 和 GitHub，避免重复创建。

<!-- agent-moebius:stage=in-progress -->`;
}

export function formatBypassedAgentComment(role: string, finalText: string, reason: string): string {
  return appendCeoReviewedMetadata(formatAgentComment(role, finalText), {
    action: "bypass",
    reason,
  });
}

export function formatGuardedAgentComment(role: string, finalText: string, result: FormatCeoResult): string {
  const review =
    result.action === "REPLACE"
      ? { action: "replace" }
      : result.action === "NO_CHANGE"
        ? { action: "no_change" }
        : { action: "fail_open", reason: result.reason };

  if (!finalText.includes(CEO_CORRECTED_METADATA)) {
    return appendCeoReviewedMetadata(formatAgentComment(role, finalText), review);
  }

  const withoutCeoMetadata = finalText.replaceAll(CEO_CORRECTED_METADATA, "").trimEnd();
  return `${appendCeoReviewedMetadata(formatAgentComment(role, withoutCeoMetadata), review)}\n\n${CEO_CORRECTED_METADATA}`;
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

export function formatFailureReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function truncateForComment(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
