import { describe, expect, it, vi } from "vitest";
import { createDriverPool } from "../src/driver-pool.js";
import { failedIssueProcessingOutcome, type GitHubResponseIntakeState, type IssueSummary } from "../src/github-response-intake.js";
import {
  createIssueDispatcher,
  issueKeyForJob,
  type IssueProcessingJob,
  type IssueProcessingJobResult,
} from "../src/issue-dispatcher.js";
import { makeIssueSource } from "../src/issue-source.js";
import { createStatePersister } from "../src/state-persister.js";

const TIMING = { activeIssuePollIntervalMs: 60_000, activeIssueNoChangeLimit: 5 };
const REPO = { owner: "tranfu-labs", repo: "tranfu-agents-app" };

function summary(issueNumber: number, updatedAt = "2026-07-02T03:00:00.000Z"): IssueSummary {
  return { ...REPO, issueNumber, updatedAt };
}

function changedJob(issueNumber: number): IssueProcessingJob {
  return { kind: "changed", summary: summary(issueNumber) };
}

function processedResult(issueNumber: number): IssueProcessingJobResult {
  return { kind: "processed", summary: summary(issueNumber), outcome: "triggered-success" };
}

function makePersister(initialState: GitHubResponseIntakeState = { repositories: {}, issues: {} }) {
  return createStatePersister({ initialState, save: async () => {} });
}

function makeDispatcher(input: {
  runJob: (job: IssueProcessingJob) => Promise<IssueProcessingJobResult>;
  persister?: ReturnType<typeof makePersister>;
  maxActiveIssues?: number;
}) {
  const persister = input.persister ?? makePersister();
  const dispatcher = createIssueDispatcher({
    driverPool: createDriverPool(),
    persister,
    runJob: input.runJob,
    timing: TIMING,
    policy: { repositories: [REPO], maxActiveIssues: input.maxActiveIssues ?? 3 },
  });
  return { dispatcher, persister };
}

describe("issue dispatcher", () => {
  it("skips dispatching an issue that is already in flight", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let release = (): void => {};
    const runJob = vi.fn(async (job: IssueProcessingJob) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return processedResult(job.kind === "changed" ? job.summary.issueNumber : 0);
    });
    const { dispatcher } = makeDispatcher({ runJob });

    expect(dispatcher.dispatch(changedJob(67))).toBe(true);
    expect(dispatcher.dispatch(changedJob(67))).toBe(false);
    expect(runJob).toHaveBeenCalledTimes(1);
    expect(
      logSpy.mock.calls.some(([line]) => typeof line === "string" && line.includes('"event":"skip-inflight"')),
    ).toBe(true);

    release();
    await dispatcher.idle();
    logSpy.mockRestore();
  });

  it("folds each job result as soon as it completes without waiting for slower jobs", async () => {
    let releaseSlow = (): void => {};
    const runJob = vi.fn(async (job: IssueProcessingJob) => {
      const issueNumber = job.kind === "changed" ? job.summary.issueNumber : 0;
      if (issueNumber === 67) {
        await new Promise<void>((resolve) => {
          releaseSlow = resolve;
        });
      }
      return processedResult(issueNumber);
    });
    const { dispatcher, persister } = makeDispatcher({ runJob });

    dispatcher.dispatch(changedJob(67));
    dispatcher.dispatch(changedJob(68));
    await vi.waitFor(() => {
      expect(persister.state().issues["tranfu-labs/tranfu-agents-app#68"]).toBeDefined();
    });
    expect(persister.state().issues["tranfu-labs/tranfu-agents-app#67"]).toBeUndefined();

    releaseSlow();
    await dispatcher.idle();

    expect(persister.state().issues["tranfu-labs/tranfu-agents-app#67"]).toBeDefined();
    expect(persister.state().issues["tranfu-labs/tranfu-agents-app#68"]).toBeDefined();
  });

  it("removes a crashed job from the in-flight set so the issue can be dispatched again", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const runJob = vi
      .fn<(job: IssueProcessingJob) => Promise<IssueProcessingJobResult>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(processedResult(67));
    const { dispatcher, persister } = makeDispatcher({ runJob });

    dispatcher.dispatch(changedJob(67));
    await dispatcher.idle();

    expect(dispatcher.busyIssueKeys().size).toBe(0);
    expect(
      logSpy.mock.calls.some(([line]) => typeof line === "string" && line.includes('"event":"issue-job-error"')),
    ).toBe(true);

    expect(dispatcher.dispatch(changedJob(67))).toBe(true);
    await dispatcher.idle();
    expect(persister.state().issues["tranfu-labs/tranfu-agents-app#67"]).toBeDefined();
    logSpy.mockRestore();
  });

  it("does not demote in-flight issues when enforcing the active issue limit", async () => {
    const inFlightKey = "tranfu-labs/tranfu-agents-app#1";
    const initialState: GitHubResponseIntakeState = {
      repositories: {},
      issues: {
        [inFlightKey]: {
          ...REPO,
          issueNumber: 1,
          updatedAt: "2026-07-01T00:00:00.000Z",
          mode: "active",
          activeNoChangeCount: 0,
          nextPollAt: "2026-07-02T03:00:00.000Z",
        },
        "tranfu-labs/tranfu-agents-app#2": {
          ...REPO,
          issueNumber: 2,
          updatedAt: "2026-07-01T12:00:00.000Z",
          mode: "active",
          activeNoChangeCount: 0,
          nextPollAt: "2026-07-02T03:00:00.000Z",
        },
      },
    };
    let releaseInFlight = (): void => {};
    const runJob = vi.fn(async (job: IssueProcessingJob) => {
      const issueNumber = job.kind === "changed" ? job.summary.issueNumber : 0;
      if (issueNumber === 1) {
        await new Promise<void>((resolve) => {
          releaseInFlight = resolve;
        });
      }
      return processedResult(issueNumber);
    });
    const { dispatcher, persister } = makeDispatcher({
      runJob,
      persister: makePersister(initialState),
      maxActiveIssues: 1,
    });

    dispatcher.dispatch(changedJob(1));
    dispatcher.dispatch(changedJob(3));
    await vi.waitFor(() => {
      expect(persister.state().issues["tranfu-labs/tranfu-agents-app#3"]).toBeDefined();
    });

    // #1 在跑被豁免降级；#2 最旧且不在跑，被降级腾出名额
    expect(persister.state().issues[inFlightKey]?.mode).toBe("active");
    expect(persister.state().issues["tranfu-labs/tranfu-agents-app#2"]?.mode).toBe("idle");

    releaseInFlight();
    await dispatcher.idle();
  });

  it("folds dead-lettered job results", async () => {
    const { dispatcher, persister } = makeDispatcher({
      persister: makePersister({
        repositories: {},
        issues: {
          "tranfu-labs/tranfu-agents-app#67": {
            ...REPO,
            issueNumber: 67,
            updatedAt: "2026-07-02T02:00:00.000Z",
            mode: "active",
            activeNoChangeCount: 0,
            nextPollAt: "2026-07-02T03:00:00.000Z",
            failureCount: 4,
            lastFailureReason: "old failure",
          },
        },
      }),
      runJob: async () => ({
        kind: "processed",
        summary: summary(67),
        outcome: "dead-lettered",
      }),
    });

    dispatcher.dispatch(changedJob(67));
    await dispatcher.idle();

    expect(persister.state().issues["tranfu-labs/tranfu-agents-app#67"]).toMatchObject({
      mode: "idle",
      updatedAt: "2026-07-02T03:00:00.000Z",
      failureCount: 0,
      nextPollAt: null,
    });
  });

  it("folds failed job results", async () => {
    const { dispatcher, persister } = makeDispatcher({
      persister: makePersister({
        repositories: {},
        issues: {
          "tranfu-labs/tranfu-agents-app#67": {
            ...REPO,
            issueNumber: 67,
            updatedAt: "2026-07-02T02:00:00.000Z",
            mode: "active",
            activeNoChangeCount: 2,
            nextPollAt: "2026-07-02T03:00:00.000Z",
          },
        },
      }),
      runJob: async () => ({
        kind: "processed",
        summary: summary(67),
        outcome: failedIssueProcessingOutcome({ reason: "fetch failed" }),
      }),
    });

    dispatcher.dispatch(changedJob(67));
    await dispatcher.idle();

    expect(persister.state().issues["tranfu-labs/tranfu-agents-app#67"]).toMatchObject({
      mode: "active",
      updatedAt: "2026-07-02T02:00:00.000Z",
      activeNoChangeCount: 2,
      failureCount: 1,
      lastFailureReason: "fetch failed",
    });
  });

  it("derives the issue key from either job shape", () => {
    expect(issueKeyForJob(changedJob(67))).toBe("tranfu-labs/tranfu-agents-app#67");
    expect(
      issueKeyForJob({
        kind: "active",
        source: makeIssueSource({ ...REPO, issueNumber: 68 }),
        previousUpdatedAt: "2026-07-02T03:00:00.000Z",
        previousActiveNoChangeCount: 0,
      }),
    ).toBe("tranfu-labs/tranfu-agents-app#68");
  });
});
