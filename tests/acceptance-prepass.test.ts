import { describe, expect, it, vi } from "vitest";
import { buildTimeline } from "../src/conversation.js";
import { CEO_ORCHESTRATION_ACTION_TIMEOUT_MS } from "../src/config.js";
import type { GitHubIssue } from "../src/github.js";
import type { GoalLedgerEntry, GoalLedgerState, TaskRecord } from "../src/goal-ledger.js";
import { makeIssueSource } from "../src/issue-source.js";
import {
  maybeProcessIntegrationAcceptancePrePass,
  type AcceptancePrePassDependencies,
} from "../src/runner/acceptance-prepass.js";

const parentSource = makeIssueSource({ owner: "tranfu-labs", repo: "agent-moebius", issueNumber: 4 });
const childSource = makeIssueSource({ owner: "tranfu-labs", repo: "agent-moebius", issueNumber: 101 });

describe("acceptance pre-pass runner module", () => {
  it("records a child acceptance fact and requests parent integration acceptance only when join is ready", async () => {
    const ledger = makeIntegrationLedgerState({ task2Passed: true });
    const issue = makeIssue("child", [
      { id: "comment-child-pass", body: pmEnvelope("验收结论：通过\n1. 通过：跑 child 1") },
    ]);
    const posted: Array<{ issueNumber: number; body: string }> = [];

    const outcome = await maybeProcessIntegrationAcceptancePrePass({
      source: childSource,
      issue,
      timeline: buildTimeline(issue.body, issue.comments, ["dev", "product-manager"]),
      agentNames: ["dev", "product-manager"],
      count: 2,
      postVisibleComment: async () => {},
      dependencies: makeDependencies(ledger, {
        saveGoalLedgerEntry: ledgerSaveMutator(ledger),
        fetchIssueWithComments: async () => makeIssue("parent"),
        postComment: async (target, body) => {
          posted.push({ issueNumber: target.issueNumber, body });
        },
      }),
    });

    expect(outcome).toBe("triggered-success");
    expect(ledger.tasks["task-1"]?.acceptanceFacts?.[0]).toMatchObject({
      status: "passed",
      commentId: "comment-child-pass",
    });
    expect(ledger.phases["phase-1"]?.integrationAcceptance?.[0]).toMatchObject({ status: "requested" });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ issueNumber: parentSource.issueNumber });
    expect(posted[0]?.body).toContain("agent-moebius-integration-acceptance-key:");
  });

  it("bounds a never-resolving child fact ledger write", async () => {
    vi.useFakeTimers();
    try {
      const ledger = makeIntegrationLedgerState();
      const issue = makeIssue("child", [
        { id: "comment-child-pass", body: pmEnvelope("验收结论：通过\n1. 通过：跑 child 1") },
      ]);
      const saveStarted = deferred<void>();

      const outcomePromise = maybeProcessIntegrationAcceptancePrePass({
        source: childSource,
        issue,
        timeline: buildTimeline(issue.body, issue.comments, ["product-manager"]),
        agentNames: ["product-manager"],
        count: 2,
        postVisibleComment: async () => {},
        dependencies: makeDependencies(ledger, {
          saveGoalLedgerEntry: async () =>
            new Promise<void>(() => {
              saveStarted.resolve();
            }),
        }),
      });

      const rejection = expect(outcomePromise).rejects.toThrow(/saveGoalLedgerEntry-timeout/);
      await saveStarted.promise;
      await vi.advanceTimersByTimeAsync(CEO_ORCHESTRATION_ACTION_TIMEOUT_MS);
      await rejection;
      expect(ledger.tasks["task-1"]?.acceptanceFacts).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps repair child references empty when repair lookup fails and posts a fail-closed trace", async () => {
    const ledger = makeIntegrationLedgerState({ requested: true });
    const issue = makeIssue("parent", [
      {
        id: "comment-parent-fail",
        body: pmEnvelope("集成验收结论：不通过\n1. 不通过：目标级验收 1\n2. 通过：目标级验收 2"),
      },
    ]);
    const createIssue = vi.fn<AcceptancePrePassDependencies["createIssue"]>(async () => ({
      number: 201,
      url: "https://github.com/tranfu-labs/agent-moebius/issues/201",
    }));
    const visibleComments: string[] = [];

    const outcome = await maybeProcessIntegrationAcceptancePrePass({
      source: parentSource,
      issue,
      timeline: buildTimeline(issue.body, issue.comments, ["dev", "product-manager"]),
      agentNames: ["dev", "product-manager"],
      count: 2,
      postVisibleComment: async (body) => {
        visibleComments.push(body);
      },
      dependencies: makeDependencies(ledger, {
        saveGoalLedgerEntry: ledgerSaveMutator(ledger),
        findIssueByOrchestrationKey: async () => {
          throw new Error("lookup failed");
        },
        createIssue,
      }),
    });

    const repairTask = Object.values(ledger.tasks).find((task) => task.id.startsWith("integration-repair-"));
    expect(outcome).toBe("triggered-success");
    expect(createIssue).not.toHaveBeenCalled();
    expect(repairTask?.childIssueRefs).toEqual([]);
    expect(visibleComments[0]).toContain("lookup failed");
    expect(visibleComments[0]).toContain("integration-repair-failed");
  });
});

function makeDependencies(
  ledger: GoalLedgerState,
  overrides: Partial<AcceptancePrePassDependencies> = {},
): AcceptancePrePassDependencies {
  return {
    loadGoalLedgerState: async () => ledger,
    saveGoalLedgerEntry: ledgerSaveMutator(ledger),
    fetchIssueState: async () => "OPEN",
    fetchIssueWithComments: async () => makeIssue("parent"),
    postComment: async () => {},
    findIssueByOrchestrationKey: async () => ({ kind: "none" }),
    createIssue: async () => ({ number: 201, url: "https://github.com/tranfu-labs/agent-moebius/issues/201" }),
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

function makeIntegrationLedgerState(input: { task2Passed?: boolean; requested?: boolean } = {}): GoalLedgerState {
  const now = "2026-07-04T00:00:00.000Z";
  const parentIssueRef = {
    owner: parentSource.owner,
    repo: parentSource.repo,
    number: parentSource.issueNumber,
    relation: "parent" as const,
    status: "open" as const,
  };
  const requested = {
    joinKey: `agent-moebius-integration-acceptance-key:${"a".repeat(64)}`,
    phaseId: "phase-1",
    parentIssue: { owner: parentSource.owner, repo: parentSource.repo, number: parentSource.issueNumber },
    reviewerRole: "product-manager",
    status: "requested" as const,
    childPassDigest: "b".repeat(64),
    targetAcceptanceDigest: "c".repeat(64),
    capturedAt: "2026-07-04T00:05:00.000Z",
  };
  return {
    schemaVersion: 1,
    goals: {
      "goal-1": {
        id: "goal-1",
        title: "Integration acceptance",
        status: "ready",
        scope: "join",
        acceptanceStatements: ["目标级验收 1", "目标级验收 2"],
        dependencies: [],
        qualityBaseline: "data-correct",
        issueRefs: [
          {
            owner: parentSource.owner,
            repo: parentSource.repo,
            number: parentSource.issueNumber,
            relation: "source",
            status: "open",
          },
        ],
        milestoneIds: [],
        provenance: [{ issue: { owner: parentSource.owner, repo: parentSource.repo, number: parentSource.issueNumber }, messageIndex: 0, capturedAt: now }],
        missingFields: [],
        nextQuestions: [],
        createdAt: now,
        updatedAt: now,
      },
    },
    milestones: {},
    tasks: {
      "task-1": makeTask({
        id: "task-1",
        title: "child 1",
        acceptanceStatements: ["跑 child 1"],
        childNumber: childSource.issueNumber,
        parentIssueRef,
        now,
      }),
      "task-2": {
        ...makeTask({
          id: "task-2",
          title: "child 2",
          acceptanceStatements: ["跑 child 2"],
          childNumber: 102,
          parentIssueRef,
          now,
        }),
        acceptanceFacts: input.task2Passed
          ? [
              {
                factKey: `task-acceptance:${"d".repeat(64)}`,
                issue: { owner: parentSource.owner, repo: parentSource.repo, number: 102 },
                role: "product-manager",
                status: "passed" as const,
                statementResults: [{ id: "1", status: "passed" as const, statement: "跑 child 2" }],
                messageIndex: 1,
                commentId: "comment-102-pass",
                capturedAt: "2026-07-04T00:01:00.000Z",
              },
            ]
          : undefined,
      },
    },
    phases: {
      "phase-1": {
        id: "phase-1",
        owner: { kind: "goal", id: "goal-1" },
        name: "integration",
        status: "active",
        qualityBaseline: "data-correct",
        objective: "集成验收 join",
        acceptanceStatements: ["目标级验收 1", "目标级验收 2"],
        dependencies: [],
        ...(input.requested ? { integrationAcceptance: [requested] } : {}),
        provenance: [{ issue: { owner: parentSource.owner, repo: parentSource.repo, number: parentSource.issueNumber }, messageIndex: 0, capturedAt: now }],
      },
    },
  };
}

function makeTask(input: {
  id: string;
  title: string;
  acceptanceStatements: string[];
  childNumber: number;
  parentIssueRef: TaskRecord["parentIssueRef"];
  now: string;
}): TaskRecord {
  return {
    id: input.id,
    goalId: "goal-1",
    title: input.title,
    status: "ready",
    scope: input.title,
    acceptanceStatements: input.acceptanceStatements,
    dependencies: [],
    qualityBaseline: "data-correct",
    phaseIds: [],
    parentIssueRef: input.parentIssueRef,
    childIssueRefs: [
      {
        owner: parentSource.owner,
        repo: parentSource.repo,
        number: input.childNumber,
        relation: "child",
        status: "open",
      },
    ],
    runManifestRefs: [],
    provenance: [{ issue: { owner: parentSource.owner, repo: parentSource.repo, number: parentSource.issueNumber }, messageIndex: 0, capturedAt: input.now }],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function ledgerSaveMutator(ledger: GoalLedgerState): AcceptancePrePassDependencies["saveGoalLedgerEntry"] {
  return async (kind, id, mutate) => {
    const entry = ledger[kind][id] ?? null;
    const next = mutate(entry as GoalLedgerEntry | null, ledger);
    const collection = ledger[kind] as Record<string, GoalLedgerEntry>;
    if (next === null) {
      delete collection[id];
    } else {
      collection[id] = next;
    }
  };
}

function pmEnvelope(body: string): string {
  return `&lt;product-manager&gt;:\n${body}\n\n<!-- agent-moebius:role=product-manager -->`;
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}
