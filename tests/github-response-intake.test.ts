import { describe, expect, it } from "vitest";
import {
  enforceActiveIssueLimit,
  externalCommentFallbackRouteProcessingOutcome,
  failedIssueProcessingOutcome,
  getDueActiveIssueSources,
  getDueRepositories,
  recordActiveIssueUnchanged,
  recordIssueProcessingOutcome,
  resolveRepositoryScan,
  type GitHubResponseIntakeState,
  type IssueSummary,
} from "../src/github-response-intake.js";
import { makeIssueSource } from "../src/issue-source.js";

const repo = { owner: "tranfu-labs", repo: "moebius" };
const now = new Date("2026-06-28T00:00:00.000Z");
const oneMinuteMs = 60 * 1000;
const fiveMinutesMs = 5 * oneMinuteMs;

describe("github response intake", () => {
  it("selects repositories due for idle scans", () => {
    expect(
      getDueRepositories({
        repositories: [repo],
        state: { repositories: {}, issues: {} },
        now,
        idleRepositoryScanIntervalMs: fiveMinutesMs,
      }),
    ).toEqual([repo]);

    expect(
      getDueRepositories({
        repositories: [repo],
        state: {
          repositories: {
            "tranfu-labs/moebius": {
              lastIdleScanAt: new Date(now.getTime() - fiveMinutesMs + 1).toISOString(),
            },
          },
          issues: {},
        },
        now,
        idleRepositoryScanIntervalMs: fiveMinutesMs,
      }),
    ).toEqual([]);
  });

  it("baselines the first repository scan without processing historical issues", () => {
    const summary = makeSummary(4, "2026-06-28T00:00:00.000Z");
    const result = resolveRepositoryScan({
      state: { repositories: {}, issues: {} },
      repository: repo,
      summaries: [summary],
      scannedAt: now,
    });

    expect(result.changedIssues).toEqual([]);
    expect(result.baselineIssueCount).toBe(1);
    expect(result.state.issues["tranfu-labs/moebius#4"]).toMatchObject({
      updatedAt: summary.updatedAt,
      mode: "idle",
    });
  });

  it("returns changed issues on later repository scans without advancing processed timestamps", () => {
    const previous = makeSummary(4, "2026-06-28T00:00:00.000Z");
    const next = makeSummary(4, "2026-06-28T00:02:00.000Z");
    const initial = resolveRepositoryScan({
      state: { repositories: {}, issues: {} },
      repository: repo,
      summaries: [previous],
      scannedAt: now,
    }).state;

    const result = resolveRepositoryScan({
      state: initial,
      repository: repo,
      summaries: [next],
      scannedAt: new Date("2026-06-28T00:05:00.000Z"),
    });

    expect(result.changedIssues).toEqual([next]);
    expect(result.state.issues["tranfu-labs/moebius#4"]?.updatedAt).toBe(previous.updatedAt);
  });

  it("records no-trigger as idle and triggered-success as active", () => {
    const summary = makeSummary(4, "2026-06-28T00:02:00.000Z");
    const idle = recordIssueProcessingOutcome({
      state: { repositories: {}, issues: {} },
      summary,
      outcome: "no-trigger",
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(idle.issues["tranfu-labs/moebius#4"]).toMatchObject({
      mode: "idle",
      updatedAt: summary.updatedAt,
      nextPollAt: null,
    });

    const active = recordIssueProcessingOutcome({
      state: idle,
      summary,
      outcome: "triggered-success",
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(active.issues["tranfu-labs/moebius#4"]).toMatchObject({
      mode: "active",
      activeNoChangeCount: 0,
      nextPollAt: "2026-06-28T00:01:00.000Z",
    });
  });

  it("records failed processing without advancing updatedAt or burning the no-change budget", () => {
    const state = stateWithActiveIssue({
      updatedAt: "2026-06-28T00:00:00.000Z",
      activeNoChangeCount: 3,
      nextPollAt: "2026-06-28T00:01:00.000Z",
    });
    const result = recordIssueProcessingOutcome({
      state,
      summary: makeSummary(4, "2026-06-28T00:03:00.000Z"),
      outcome: failedIssueProcessingOutcome({ reason: "git failed with exit-code-128", agent: "dev" }),
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(result.issues["tranfu-labs/moebius#4"]).toMatchObject({
      mode: "active",
      updatedAt: "2026-06-28T00:00:00.000Z",
      activeNoChangeCount: 3,
      nextPollAt: "2026-06-28T00:01:00.000Z",
      failureCount: 1,
      lastFailureReason: "git failed with exit-code-128",
    });
  });

  it("increments existing failure count without demoting at the no-change limit", () => {
    const state = stateWithActiveIssue({
      updatedAt: "2026-06-28T00:00:00.000Z",
      activeNoChangeCount: 4,
      nextPollAt: "2026-06-28T00:01:00.000Z",
      failureCount: 2,
    });
    const result = recordIssueProcessingOutcome({
      state,
      summary: makeSummary(4, "2026-06-28T00:03:00.000Z"),
      outcome: failedIssueProcessingOutcome({ reason: "still failing" }),
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(result.issues["tranfu-labs/moebius#4"]).toMatchObject({
      mode: "active",
      updatedAt: "2026-06-28T00:00:00.000Z",
      activeNoChangeCount: 4,
      failureCount: 3,
      nextPollAt: "2026-06-28T00:01:00.000Z",
    });
  });

  it("starts failed retry accounting from one when a previously idle issue changes again", () => {
    const state: GitHubResponseIntakeState = {
      repositories: {},
      issues: {
        "tranfu-labs/moebius#4": {
          ...repo,
          issueNumber: 4,
          mode: "idle",
          updatedAt: "2026-06-28T00:00:00.000Z",
          activeNoChangeCount: 5,
          nextPollAt: null,
        },
      },
    };

    const result = recordIssueProcessingOutcome({
      state,
      summary: makeSummary(4, "2026-06-28T00:03:00.000Z"),
      outcome: failedIssueProcessingOutcome({ reason: "pre script failed" }),
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(result.issues["tranfu-labs/moebius#4"]).toMatchObject({
      mode: "active",
      updatedAt: "2026-06-28T00:00:00.000Z",
      activeNoChangeCount: 0,
      nextPollAt: "2026-06-28T00:01:00.000Z",
      failureCount: 1,
      lastFailureReason: "pre script failed",
    });
  });

  it("uses an epoch cursor for failed processing when the issue was not previously tracked", () => {
    const result = recordIssueProcessingOutcome({
      state: { repositories: {}, issues: {} },
      summary: makeSummary(4, "2026-06-28T00:03:00.000Z"),
      outcome: failedIssueProcessingOutcome({ reason: "fetch failed" }),
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(result.issues["tranfu-labs/moebius#4"]).toMatchObject({
      mode: "active",
      updatedAt: "1970-01-01T00:00:00.000Z",
      activeNoChangeCount: 0,
      failureCount: 1,
      nextPollAt: "2026-06-28T00:01:00.000Z",
    });
  });

  it("records dead-lettered processing as visible ack and clears failure accounting", () => {
    const result = recordIssueProcessingOutcome({
      state: stateWithActiveIssue({
        updatedAt: "2026-06-28T00:00:00.000Z",
        activeNoChangeCount: 4,
        nextPollAt: "2026-06-28T00:01:00.000Z",
        failureCount: 5,
        lastFailureReason: "still failing",
      }),
      summary: makeSummary(4, "2026-06-28T00:03:00.000Z"),
      outcome: "dead-lettered",
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(result.issues["tranfu-labs/moebius#4"]).toMatchObject({
      mode: "idle",
      updatedAt: "2026-06-28T00:03:00.000Z",
      activeNoChangeCount: 0,
      nextPollAt: null,
      failureCount: 0,
    });
    expect(result.issues["tranfu-labs/moebius#4"]).not.toHaveProperty("lastFailureReason");
  });

  it("removes issue state after issue-closed outcomes", () => {
    const state = stateWithActiveIssue({
      updatedAt: "2026-06-28T00:00:00.000Z",
      activeNoChangeCount: 0,
      nextPollAt: "2026-06-28T00:01:00.000Z",
    });
    const result = recordIssueProcessingOutcome({
      state,
      summary: makeSummary(4, "2026-06-28T00:03:00.000Z"),
      outcome: "issue-closed",
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(result.issues).not.toHaveProperty("tranfu-labs/moebius#4");
  });

  it("keeps interrupted issues active without advancing past the interrupted baseline", () => {
    const state = stateWithActiveIssue({
      updatedAt: "2026-06-28T00:00:00.000Z",
      activeNoChangeCount: 3,
      nextPollAt: "2026-06-28T00:01:00.000Z",
    });

    const result = recordIssueProcessingOutcome({
      state,
      summary: makeSummary(4, "2026-06-28T00:02:00.000Z"),
      outcome: "interrupted",
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(result.issues["tranfu-labs/moebius#4"]).toMatchObject({
      mode: "active",
      updatedAt: "2026-06-28T00:02:00.000Z",
      activeNoChangeCount: 0,
      nextPollAt: "2026-06-28T00:00:00.000Z",
    });
  });

  it("keeps already active issues active after no-trigger changes", () => {
    const state = stateWithActiveIssue({
      updatedAt: "2026-06-28T00:00:00.000Z",
      activeNoChangeCount: 3,
      nextPollAt: "2026-06-28T00:01:00.000Z",
    });

    const result = recordIssueProcessingOutcome({
      state,
      summary: makeSummary(4, "2026-06-28T00:03:00.000Z"),
      outcome: "no-trigger",
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(result.issues["tranfu-labs/moebius#4"]).toMatchObject({
      mode: "active",
      updatedAt: "2026-06-28T00:03:00.000Z",
      activeNoChangeCount: 0,
      nextPollAt: "2026-06-28T00:01:00.000Z",
      failureCount: 0,
    });
    expect(result.issues["tranfu-labs/moebius#4"]).not.toHaveProperty("lastFailureReason");
  });

  it("records external comment fallback route outcomes by comment id across no_action, append, and fail_open", () => {
    const summary = makeSummary(4, "2026-06-28T00:03:00.000Z");
    let state = stateWithActiveIssue({
      updatedAt: "2026-06-28T00:00:00.000Z",
      activeNoChangeCount: 0,
      nextPollAt: "2026-06-28T00:00:00.000Z",
    });

    state = recordIssueProcessingOutcome({
      state,
      summary,
      outcome: externalCommentFallbackRouteProcessingOutcome({
        result: "no-trigger",
        route: {
          commentId: "comment-node-1",
          outcome: "no_action",
          decidedAt: "2026-06-28T00:00:01.000Z",
          reason: "ceo-no-action",
        },
      }),
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    state = recordIssueProcessingOutcome({
      state,
      summary: makeSummary(4, "2026-06-28T00:04:00.000Z"),
      outcome: externalCommentFallbackRouteProcessingOutcome({
        result: "triggered-success",
        route: {
          commentId: "comment-node-2",
          outcome: "append",
          decidedAt: "2026-06-28T00:00:02.000Z",
          targetRole: "dev",
        },
      }),
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    state = recordIssueProcessingOutcome({
      state,
      summary: makeSummary(4, "2026-06-28T00:05:00.000Z"),
      outcome: externalCommentFallbackRouteProcessingOutcome({
        result: "no-trigger",
        route: {
          commentId: "comment-node-3",
          outcome: "fail_open",
          decidedAt: "2026-06-28T00:00:03.000Z",
          reason: "codex-timeout",
        },
      }),
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(state.issues["tranfu-labs/moebius#4"]).toMatchObject({
      mode: "active",
      updatedAt: "2026-06-28T00:05:00.000Z",
      externalCommentFallbackRoutes: {
        "comment-node-1": {
          commentId: "comment-node-1",
          outcome: "no_action",
          reason: "ceo-no-action",
        },
        "comment-node-2": {
          commentId: "comment-node-2",
          outcome: "append",
          targetRole: "dev",
        },
        "comment-node-3": {
          commentId: "comment-node-3",
          outcome: "fail_open",
          reason: "codex-timeout",
        },
      },
    });
  });

  it("keeps loading and folding legacy issue state without fallback route fields", () => {
    const legacyState = stateWithActiveIssue({
      updatedAt: "2026-06-28T00:00:00.000Z",
      activeNoChangeCount: 0,
      nextPollAt: "2026-06-28T00:00:00.000Z",
    });

    const result = recordIssueProcessingOutcome({
      state: legacyState,
      summary: makeSummary(4, "2026-06-28T00:03:00.000Z"),
      outcome: "no-trigger",
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(result.issues["tranfu-labs/moebius#4"]).toMatchObject({
      mode: "active",
      updatedAt: "2026-06-28T00:03:00.000Z",
    });
    expect(result.issues["tranfu-labs/moebius#4"]).not.toHaveProperty("externalCommentFallbackRoutes");
  });

  it("demotes active issues after five unchanged active polls", () => {
    const source = makeIssueSource({ ...repo, issueNumber: 4 });
    const state = stateWithActiveIssue({
      updatedAt: "2026-06-28T00:00:00.000Z",
      activeNoChangeCount: 4,
      nextPollAt: "2026-06-28T00:00:00.000Z",
    });

    const result = recordActiveIssueUnchanged({
      state,
      source,
      checkedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
      activeIssueNoChangeLimit: 5,
    });

    expect(result.issues[source.issueKey]).toMatchObject({
      mode: "idle",
      activeNoChangeCount: 5,
      nextPollAt: null,
    });
  });

  it("returns due active issue sources only for watched repositories and enforces their active issue limit", () => {
    const state: GitHubResponseIntakeState = {
      repositories: {},
      issues: {
        "tranfu-labs/moebius#1": activeIssue(1, "2026-06-28T00:01:00.000Z"),
        "tranfu-labs/moebius#2": activeIssue(2, "2026-06-28T00:02:00.000Z"),
        "tranfu-labs/other-repo#3": {
          owner: "tranfu-labs",
          repo: "other-repo",
          issueNumber: 3,
          mode: "active",
          updatedAt: "2026-06-28T00:03:00.000Z",
          activeNoChangeCount: 0,
          nextPollAt: "2026-06-28T00:00:00.000Z",
        },
      },
    };

    expect(getDueActiveIssueSources({ repositories: [repo], state, now }).map((source) => source.issueKey)).toEqual([
      "tranfu-labs/moebius#1",
      "tranfu-labs/moebius#2",
    ]);

    expect(getDueActiveIssueSources({ repositories: [], state, now })).toEqual([]);

    const limited = enforceActiveIssueLimit({ repositories: [repo], state, maxActiveIssues: 1 });

    expect(limited.demotedIssueKeys).toEqual(["tranfu-labs/moebius#1"]);
    expect(limited.state.issues["tranfu-labs/moebius#1"]?.mode).toBe("idle");
    expect(limited.state.issues["tranfu-labs/moebius#2"]?.mode).toBe("active");
    expect(limited.state.issues["tranfu-labs/other-repo#3"]?.mode).toBe("active");
  });
});

function makeSummary(issueNumber: number, updatedAt: string): IssueSummary {
  return {
    ...repo,
    issueNumber,
    updatedAt,
  };
}

function stateWithActiveIssue(input: {
  updatedAt: string;
  activeNoChangeCount: number;
  nextPollAt: string;
  failureCount?: number;
  lastFailureReason?: string;
}): GitHubResponseIntakeState {
  return {
    repositories: {},
    issues: {
      "tranfu-labs/moebius#4": {
        ...repo,
        issueNumber: 4,
        mode: "active",
        updatedAt: input.updatedAt,
        activeNoChangeCount: input.activeNoChangeCount,
        nextPollAt: input.nextPollAt,
        failureCount: input.failureCount,
        lastFailureReason: input.lastFailureReason,
      },
    },
  };
}

function activeIssue(issueNumber: number, updatedAt: string) {
  return {
    ...repo,
    issueNumber,
    mode: "active" as const,
    updatedAt,
    activeNoChangeCount: 0,
    nextPollAt: "2026-06-28T00:00:00.000Z",
  };
}
