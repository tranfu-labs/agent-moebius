import { describe, expect, it } from "vitest";
import {
  enforceActiveIssueLimit,
  getDueActiveIssueSources,
  getDueRepositories,
  recordActiveIssueUnchanged,
  recordIssueProcessingOutcome,
  resolveRepositoryScan,
  type GitHubResponseIntakeState,
  type IssueSummary,
} from "../src/github-response-intake.js";
import { makeIssueSource } from "../src/issue-source.js";

const repo = { owner: "tranfu-labs", repo: "agent-moebius" };
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
            "tranfu-labs/agent-moebius": {
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
    expect(result.state.issues["tranfu-labs/agent-moebius#4"]).toMatchObject({
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
    expect(result.state.issues["tranfu-labs/agent-moebius#4"]?.updatedAt).toBe(previous.updatedAt);
  });

  it("records no-trigger as idle and triggered-success as active", () => {
    const summary = makeSummary(4, "2026-06-28T00:02:00.000Z");
    const idle = recordIssueProcessingOutcome({
      state: { repositories: {}, issues: {} },
      summary,
      outcome: "no-trigger",
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
    });

    expect(idle.issues["tranfu-labs/agent-moebius#4"]).toMatchObject({
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
    });

    expect(active.issues["tranfu-labs/agent-moebius#4"]).toMatchObject({
      mode: "active",
      activeNoChangeCount: 0,
      nextPollAt: "2026-06-28T00:01:00.000Z",
    });
  });

  it("does not advance timestamps after failed processing", () => {
    const state = stateWithActiveIssue({
      updatedAt: "2026-06-28T00:00:00.000Z",
      activeNoChangeCount: 0,
      nextPollAt: "2026-06-28T00:01:00.000Z",
    });
    const result = recordIssueProcessingOutcome({
      state,
      summary: makeSummary(4, "2026-06-28T00:03:00.000Z"),
      outcome: "failed",
      processedAt: now,
      activeIssuePollIntervalMs: oneMinuteMs,
    });

    expect(result).toBe(state);
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
    });

    expect(result.issues["tranfu-labs/agent-moebius#4"]).toMatchObject({
      mode: "active",
      updatedAt: "2026-06-28T00:03:00.000Z",
      activeNoChangeCount: 0,
      nextPollAt: "2026-06-28T00:01:00.000Z",
    });
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
        "tranfu-labs/agent-moebius#1": activeIssue(1, "2026-06-28T00:01:00.000Z"),
        "tranfu-labs/agent-moebius#2": activeIssue(2, "2026-06-28T00:02:00.000Z"),
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
      "tranfu-labs/agent-moebius#1",
      "tranfu-labs/agent-moebius#2",
    ]);

    expect(getDueActiveIssueSources({ repositories: [], state, now })).toEqual([]);

    const limited = enforceActiveIssueLimit({ repositories: [repo], state, maxActiveIssues: 1 });

    expect(limited.demotedIssueKeys).toEqual(["tranfu-labs/agent-moebius#1"]);
    expect(limited.state.issues["tranfu-labs/agent-moebius#1"]?.mode).toBe("idle");
    expect(limited.state.issues["tranfu-labs/agent-moebius#2"]?.mode).toBe("active");
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
}): GitHubResponseIntakeState {
  return {
    repositories: {},
    issues: {
      "tranfu-labs/agent-moebius#4": {
        ...repo,
        issueNumber: 4,
        mode: "active",
        updatedAt: input.updatedAt,
        activeNoChangeCount: input.activeNoChangeCount,
        nextPollAt: input.nextPollAt,
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
