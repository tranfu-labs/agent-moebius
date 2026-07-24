import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildTimeline, parseAgentMentions } from "../src/conversation.js";
import type { GitHubIssue } from "../src/github.js";
import type { GoalLedgerState } from "../src/goal-ledger.js";
import type { IntakeIssueState } from "../src/github-response-intake.js";
import { makeIssueSource } from "../src/issue-source.js";
import {
  maybeRecoverRoundtableNoHandoff,
  maybeRouteExternalNoMentionComment,
  type ExternalRouteDependencies,
} from "../src/runner/external-route.js";

const parentSource = makeIssueSource({ owner: "tranfu-labs", repo: "moebius", issueNumber: 4 });
const childSource = makeIssueSource({ owner: "tranfu-labs", repo: "moebius", issueNumber: 101 });

describe("external route runner module", () => {
  it("rejects an append route when publishing the visible handoff fails", async () => {
    const issue = makeIssue("initial", [{ id: "comment-node-1", body: "验收通过，请继续实现。" }]);
    const formatExternalCommentRoute = vi.fn<ExternalRouteDependencies["formatExternalCommentRoute"]>(async () => ({
      action: "APPEND",
      body: "@dev 请继续实现。",
      targetRole: "dev",
      reason: "appended",
    }));

    await expect(
      maybeRouteExternalNoMentionComment({
        source: parentSource,
        issue,
        timeline: buildTimeline(issue.body, issue.comments, ["dev"]),
        agentNames: ["dev"],
        intakeIssueState: activeIntakeIssueState(parentSource),
        count: 2,
        makeRunDir: () => "/tmp/moebius-route-test",
        postVisibleComment: async () => {
          throw new Error("comment timeout");
        },
        dependencies: makeDependencies({ formatExternalCommentRoute }),
      }),
    ).rejects.toThrow(/comment timeout/);

    expect(formatExternalCommentRoute).toHaveBeenCalledTimes(1);
  });

  it("records deterministic no_action for an agent-authored comment on an already passed ledger child", async () => {
    const issue = makeIssue("child", [{ id: "dev-comment", body: agentEnvelope("dev", "实现说明已补齐。") }]);
    const formatExternalCommentRoute = vi.fn<ExternalRouteDependencies["formatExternalCommentRoute"]>(async () => ({
      action: "APPEND",
      body: "@product-manager 请验收。",
      targetRole: "product-manager",
      reason: "appended",
    }));
    const postVisibleComment = vi.fn<(body: string) => Promise<void>>(async () => {});

    const outcome = await maybeRouteExternalNoMentionComment({
      source: childSource,
      issue,
      timeline: buildTimeline(issue.body, issue.comments, ["dev", "product-manager"]),
      agentNames: ["dev", "product-manager"],
      intakeIssueState: activeIntakeIssueState(childSource),
      count: 2,
      makeRunDir: () => "/tmp/moebius-route-test",
      postVisibleComment,
      dependencies: makeDependencies({
        loadGoalLedgerState: async () => ledgerWithPassedChild(),
        formatExternalCommentRoute,
      }),
    });

    expect(outcome).toMatchObject({
      kind: "external-comment-fallback-route",
      result: "no-trigger",
      route: { commentId: "dev-comment", outcome: "no_action", reason: "ledger-task-closed" },
    });
    expect(formatExternalCommentRoute).not.toHaveBeenCalled();
    expect(postVisibleComment).not.toHaveBeenCalled();
  });

  it("recovers a roundtable participant comment that does not hand control back to CEO", async () => {
    const issue = makeIssue(roundtableChildBody(), [
      { id: "qa-comment", body: agentEnvelope("qa", "QA contribution without handoff.") },
    ]);
    const postVisibleComment = vi.fn<(body: string) => Promise<void>>(async () => {});

    const outcome = await maybeRecoverRoundtableNoHandoff({
      source: childSource,
      issue,
      timeline: buildTimeline(issue.body, issue.comments, ["ceo", "qa", "dev-manager"]),
      intakeIssueState: activeIntakeIssueState(childSource),
      postVisibleComment,
    });

    expect(outcome).toMatchObject({
      kind: "external-comment-fallback-route",
      result: "triggered-success",
      route: { commentId: "qa-comment", outcome: "append", targetRole: "ceo" },
    });
    expect(parseAgentMentions(postVisibleComment.mock.calls[0]?.[0] ?? "").map((mention) => mention.name)).toEqual([
      "ceo",
    ]);
  });
});

function makeDependencies(overrides: Partial<ExternalRouteDependencies> = {}): ExternalRouteDependencies {
  return {
    runCodex: async (options) => ({
      ok: true,
      finalText: "",
      threadId: "thread-1",
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }),
    loadGoalLedgerState: async () => ({ schemaVersion: 1, goals: {}, milestones: {}, tasks: {}, phases: {} }),
    formatExternalCommentRoute: async () => ({ action: "NO_ACTION", reason: "ceo-no-action" }),
    ...overrides,
  };
}

function makeIssue(body: string, comments: Array<{ id: string; body: string }> = []): GitHubIssue {
  return {
    body,
    comments,
    updatedAt: "2026-07-01T00:00:00Z",
    state: "OPEN",
  };
}

function activeIntakeIssueState(source: typeof parentSource): IntakeIssueState {
  return {
    owner: source.owner,
    repo: source.repo,
    issueNumber: source.issueNumber,
    updatedAt: "2026-07-01T00:00:00Z",
    mode: "active",
    activeNoChangeCount: 0,
    nextPollAt: "2026-07-01T00:01:00Z",
  };
}

function ledgerWithPassedChild(): GoalLedgerState {
  return {
    schemaVersion: 1,
    goals: {},
    milestones: {},
    tasks: {
      "task-1": {
        id: "task-1",
        goalId: "goal-1",
        title: "child task",
        status: "ready",
        scope: "child task",
        acceptanceStatements: ["跑 pnpm test → 应退出码 0"],
        dependencies: [],
        qualityBaseline: "production",
        phaseIds: [],
        childIssueRefs: [{ owner: childSource.owner, repo: childSource.repo, number: childSource.issueNumber, relation: "child", status: "open" }],
        acceptanceFacts: [
          {
            factKey: `task-acceptance:${"a".repeat(64)}`,
            issue: { owner: childSource.owner, repo: childSource.repo, number: childSource.issueNumber },
            role: "product-manager",
            status: "passed",
            statementResults: [{ id: "1", status: "passed", statement: "跑 pnpm test → 应退出码 0" }],
            messageIndex: 2,
            capturedAt: "2026-07-01T00:02:00Z",
          },
        ],
        runManifestRefs: [],
        provenance: [
          {
            issue: { owner: parentSource.owner, repo: parentSource.repo, number: parentSource.issueNumber },
            messageIndex: 0,
            capturedAt: "2026-07-01T00:00:00Z",
          },
        ],
        createdAt: "2026-07-01T00:00:00Z",
        updatedAt: "2026-07-01T00:00:00Z",
      },
    },
    phases: {},
  };
}

function roundtableChildBody(): string {
  return `Parent issue: https://github.com/${parentSource.owner}/${parentSource.repo}/issues/${parentSource.issueNumber}
Workflow id: roundtable-plan-review
Ledger task id: task-1
Topic:
Review the plan.

Participants in order:
1. qa
2. dev-manager

<!-- moebius-roundtable-key:${"b".repeat(32)} -->`;
}

function agentEnvelope(role: string, body: string): string {
  return `&lt;${role}&gt;:\n${body}\n\n<!-- moebius:role=${role} -->`;
}
