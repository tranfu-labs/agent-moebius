import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CODEX_DRIVER_POOL_MAX_CONCURRENT,
  CODEX_RUN_MAX_DURATION_MS,
  CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
} from "../src/config.js";
import { createDriverPool, type DriverPool } from "../src/driver-pool.js";
import { CEO_CORRECTED_METADATA, type FormatCeoResult } from "../src/format-ceo.js";
import { buildCeoOrchestrationKey } from "../src/ceo-orchestration.js";
import type { CeoScript } from "../src/ceo-scripts.js";
import {
  createDefaultCodexDriverPool,
  formatDeadLetterComment,
  createRunner,
  makeRunDir,
  pollActiveIssue,
  processIssueSource,
  type ProcessIssueSourceDependencies,
  type RunnerDependencies,
} from "../src/runner.js";
import { failedIssueProcessingOutcome, type GitHubResponseIntakeState } from "../src/github-response-intake.js";
import { CommandFailedError, type GitHubIssue } from "../src/github.js";
import type { GoalLedgerEntry, GoalLedgerState } from "../src/goal-ledger.js";
import { makeIssueSource } from "../src/issue-source.js";

const source = makeIssueSource({ owner: "tranfu-labs", repo: "agent-moebius", issueNumber: 4 });

describe("pollActiveIssue", () => {
  it("removes closed active issues without processing triggers or comments", async () => {
    const state: GitHubResponseIntakeState = {
      repositories: {},
      issues: {
        [source.issueKey]: {
          owner: source.owner,
          repo: source.repo,
          issueNumber: source.issueNumber,
          updatedAt: "2026-07-01T00:00:00Z",
          mode: "active",
          activeNoChangeCount: 0,
          nextPollAt: "2026-07-01T00:01:00Z",
        },
      },
    };
    const process = vi.fn(async () => "triggered-success" as const);

    const result = await pollActiveIssue(
      {
        state,
        source,
        agentFiles: [],
        now: new Date("2026-07-01T00:02:00Z"),
      },
      {
        fetchIssueWithComments: async () => makeIssue("@dev please run", [], "CLOSED"),
        processIssueSource: process,
      },
    );

    expect(result.issues).not.toHaveProperty(source.issueKey);
    expect(process).not.toHaveBeenCalled();
  });

  it("records fetch failures as failed without advancing the intake cursor", async () => {
    const state: GitHubResponseIntakeState = {
      repositories: {},
      issues: {
        [source.issueKey]: {
          owner: source.owner,
          repo: source.repo,
          issueNumber: source.issueNumber,
          updatedAt: "2026-07-01T00:00:00Z",
          mode: "active",
          activeNoChangeCount: 2,
          nextPollAt: "2026-07-01T00:01:00Z",
        },
      },
    };

    const result = await pollActiveIssue(
      {
        state,
        source,
        agentFiles: [],
        now: new Date("2026-07-01T00:02:00Z"),
      },
      {
        fetchIssueWithComments: async () => {
          throw new CommandFailedError("gh", 1, null, 'Post "https://api.github.com/graphql": EOF');
        },
        processIssueSource: async () => "triggered-success",
      },
    );

    expect(result.issues[source.issueKey]).toMatchObject({
      mode: "active",
      updatedAt: "2026-07-01T00:00:00Z",
      activeNoChangeCount: 2,
      failureCount: 1,
      lastFailureReason: 'gh failed with exit code 1: Post "https://api.github.com/graphql": EOF',
    });
  });
});

describe("runner heartbeat orchestration", () => {
  it("runs changed issue jobs through the injected driver pool without serializing them", async () => {
    const first = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 1 });
    const second = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 2 });
    const bothStarted = deferred<void>();
    const releaseJobs = deferred<void>();
    const startedIssueNumbers: number[] = [];
    let runningJobs = 0;
    let maxRunningJobs = 0;
    const savedStates: GitHubResponseIntakeState[] = [];
    const processIssueSourceMock = vi.fn(async (input: { source: ReturnType<typeof makeIssueSource> }) => {
      startedIssueNumbers.push(input.source.issueNumber);
      runningJobs += 1;
      maxRunningJobs = Math.max(maxRunningJobs, runningJobs);
      if (startedIssueNumbers.length === 2) {
        bothStarted.resolve();
      }

      await releaseJobs.promise;
      runningJobs -= 1;
      return "triggered-success" as const;
    });

    const runner = createRunner({
      initialState: stateWithIdleScanDueIssues([first, second]),
      dependencies: makeRunnerDependencies({
        summaries: [
          { issueNumber: 1, updatedAt: "2026-07-01T00:05:00Z" },
          { issueNumber: 2, updatedAt: "2026-07-01T00:06:00Z" },
        ],
        processIssueSource: processIssueSourceMock,
        saveGitHubResponseIntakeState: async (state: GitHubResponseIntakeState) => {
          savedStates.push(state);
        },
      }),
    });
    await runner.heartbeat(new Date("2026-07-01T00:10:00Z"));

    await Promise.race([
      bothStarted.promise,
      delay(100).then(() => {
        throw new Error("expected both jobs to start");
      }),
    ]);
    expect(maxRunningJobs).toBe(2);
    expect(startedIssueNumbers.sort()).toEqual([1, 2]);

    releaseJobs.resolve();
    await runner.dispatcher.idle();
    await runner.persister.flush();

    expect(processIssueSourceMock).toHaveBeenCalledTimes(2);
    expect(runner.persister.state().issues[first.issueKey]?.mode).toBe("active");
    expect(runner.persister.state().issues[second.issueKey]?.mode).toBe("active");
    expect(savedStates.at(-1)?.issues[first.issueKey]?.mode).toBe("active");
    expect(savedStates.at(-1)?.issues[second.issueKey]?.mode).toBe("active");
  });

  it("passes prior active intake state into changed issue jobs so fallback routing stays active-only", async () => {
    const issue = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 67 });
    const processIssueSourceMock = vi.fn<RunnerDependencies["processIssueSource"]>(async () => "no-trigger");
    const runner = createRunner({
      initialState: {
        repositories: {
          [`${source.owner}/${source.repo}`]: {
            lastIdleScanAt: "2026-07-01T00:00:00.000Z",
          },
        },
        issues: {
          [issue.issueKey]: {
            owner: issue.owner,
            repo: issue.repo,
            issueNumber: issue.issueNumber,
            updatedAt: "2026-07-01T00:00:00Z",
            mode: "active",
            activeNoChangeCount: 0,
            nextPollAt: "2026-07-01T00:05:00Z",
          },
        },
      },
      dependencies: makeRunnerDependencies({
        summaries: [{ issueNumber: 67, updatedAt: "2026-07-01T00:05:00Z" }],
        processIssueSource: processIssueSourceMock,
      }),
    });

    await runner.heartbeat(new Date("2026-07-01T00:10:00Z"));
    await runner.dispatcher.idle();

    expect(processIssueSourceMock.mock.calls[0]?.[0]).toMatchObject({
      source: issue,
      intakeIssueState: {
        mode: "active",
        updatedAt: "2026-07-01T00:00:00Z",
      },
    });
  });

  it("passes prior idle intake state into changed issue jobs without enabling fallback routing", async () => {
    const issue = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 67 });
    const processIssueSourceMock = vi.fn<RunnerDependencies["processIssueSource"]>(async () => "no-trigger");
    const runner = createRunner({
      initialState: stateWithIdleScanDueIssues([issue]),
      dependencies: makeRunnerDependencies({
        summaries: [{ issueNumber: 67, updatedAt: "2026-07-01T00:05:00Z" }],
        processIssueSource: processIssueSourceMock,
      }),
    });

    await runner.heartbeat(new Date("2026-07-01T00:10:00Z"));
    await runner.dispatcher.idle();

    expect(processIssueSourceMock.mock.calls[0]?.[0]).toMatchObject({
      intakeIssueState: {
        mode: "idle",
      },
    });
  });

  it("dedupes duplicate issue jobs within a heartbeat", async () => {
    const issue = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 1 });
    const processIssueSourceMock = vi.fn(async () => "triggered-success" as const);

    const runner = createRunner({
      initialState: stateWithIdleScanDueIssues([issue]),
      dependencies: makeRunnerDependencies({
        summaries: [
          { issueNumber: 1, updatedAt: "2026-07-01T00:05:00Z" },
          { issueNumber: 1, updatedAt: "2026-07-01T00:05:00Z" },
        ],
        processIssueSource: processIssueSourceMock,
      }),
    });
    await runner.heartbeat(new Date("2026-07-01T00:10:00Z"));
    await runner.dispatcher.idle();

    expect(processIssueSourceMock).toHaveBeenCalledTimes(1);
  });

  it("keeps later heartbeats scanning and dispatching while a job runs long", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const slow = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 67 });
    const fast = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 68 });
    const slowStarted = deferred<void>();
    const releaseSlow = deferred<void>();
    const summaries = [{ issueNumber: 67, updatedAt: "2026-07-01T00:05:00Z" }];
    const processIssueSourceMock = vi.fn(async (input: { source: ReturnType<typeof makeIssueSource> }) => {
      if (input.source.issueNumber === 67) {
        slowStarted.resolve();
        await releaseSlow.promise;
      }
      return "triggered-success" as const;
    });

    const runner = createRunner({
      initialState: stateWithIdleScanDueIssues([slow, fast]),
      dependencies: makeRunnerDependencies({ summaries, processIssueSource: processIssueSourceMock }),
    });

    // 心跳 1：派发 #67，它长跑挂起
    await runner.heartbeat(new Date("2026-07-01T00:10:00Z"));
    await slowStarted.promise;

    // 心跳 2：#67 仍在跑，#68 出现新变化，扫描与派发不被阻塞
    summaries.push({ issueNumber: 68, updatedAt: "2026-07-01T00:15:00Z" });
    await runner.heartbeat(new Date("2026-07-01T00:16:00Z"));
    await vi.waitFor(() => {
      expect(runner.persister.state().issues[fast.issueKey]?.mode).toBe("active");
    });

    // #67 未折叠、仍在跑；#68 已全流程完成
    expect(runner.persister.state().issues[slow.issueKey]?.mode).toBe("idle");
    expect(runner.dispatcher.busyIssueKeys().has(slow.issueKey)).toBe(true);
    expect(
      logSpy.mock.calls.some(([line]) => typeof line === "string" && line.includes('"event":"skip-overlap"')),
    ).toBe(false);
    // 心跳 2 再次发现 #67 变化，但被在跑防重跳过
    expect(
      logSpy.mock.calls.some(([line]) => typeof line === "string" && line.includes('"event":"skip-inflight"')),
    ).toBe(true);
    expect(processIssueSourceMock.mock.calls.filter(([input]) => input.source.issueNumber === 67)).toHaveLength(1);

    releaseSlow.resolve();
    await runner.dispatcher.idle();
    expect(runner.persister.state().issues[slow.issueKey]?.mode).toBe("active");
    logSpy.mockRestore();
  });

  it("posts a dead-letter comment and records dead-lettered when the failure retry budget is reached", async () => {
    const issue = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 67 });
    const posted: string[] = [];
    const runner = createRunner({
      initialState: {
        repositories: {
          [`${source.owner}/${source.repo}`]: {
            lastIdleScanAt: "2026-07-01T00:00:00.000Z",
          },
        },
        issues: {
          [issue.issueKey]: {
            owner: issue.owner,
            repo: issue.repo,
            issueNumber: issue.issueNumber,
            updatedAt: "2026-07-01T00:00:00Z",
            mode: "idle",
            activeNoChangeCount: 0,
            nextPollAt: null,
            failureCount: 4,
            lastFailureReason: "old failure",
          },
        },
      },
      dependencies: makeRunnerDependencies({
        summaries: [{ issueNumber: 67, updatedAt: "2026-07-01T00:05:00Z" }],
        processIssueSource: async () => failedIssueProcessingOutcome({ reason: "dev-workspace-error:git failed", agent: "dev" }),
        postComment: async (_source, body) => {
          posted.push(body);
        },
      }),
    });

    await runner.heartbeat(new Date("2026-07-01T00:10:00Z"));
    await runner.dispatcher.idle();

    expect(posted).toEqual([
      formatDeadLetterComment({
        agent: "dev",
        reason: "dev-workspace-error:git failed",
        failureCount: 5,
      }),
    ]);
    expect(posted[0]).toContain("<!-- agent-moebius:dead-letter -->");
    expect(posted[0]).toContain("<!-- agent-moebius:ceo-reviewed action=not_applicable reason=dead-letter -->");
    expect(posted[0]).not.toContain("@dev");
    expect(runner.persister.state().issues[issue.issueKey]).toMatchObject({
      mode: "idle",
      updatedAt: "2026-07-01T00:05:00Z",
      failureCount: 0,
      activeNoChangeCount: 0,
      nextPollAt: null,
    });
  });

  it("dead-letters sustained GitHub fetch failures without interrupting heartbeat dispatch", async () => {
    const issue = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 67 });
    const posted: string[] = [];
    const processIssueSourceMock = vi.fn(async () => "triggered-success" as const);
    const runner = createRunner({
      initialState: {
        repositories: {
          [`${source.owner}/${source.repo}`]: {
            lastIdleScanAt: "2026-07-01T00:00:00.000Z",
          },
        },
        issues: {
          [issue.issueKey]: {
            owner: issue.owner,
            repo: issue.repo,
            issueNumber: issue.issueNumber,
            updatedAt: "2026-07-01T00:00:00Z",
            mode: "idle",
            activeNoChangeCount: 0,
            nextPollAt: null,
            failureCount: 4,
            lastFailureReason: "old gh failure",
          },
        },
      },
      dependencies: makeRunnerDependencies({
        summaries: [{ issueNumber: 67, updatedAt: "2026-07-01T00:05:00Z" }],
        fetchIssueWithComments: async () => {
          throw new CommandFailedError("gh", 1, null, 'Post "https://api.github.com/graphql": EOF');
        },
        processIssueSource: processIssueSourceMock,
        postComment: async (_source, body) => {
          posted.push(body);
        },
      }),
    });

    await expect(runner.heartbeat(new Date("2026-07-01T00:10:00Z"))).resolves.toBeUndefined();
    await runner.dispatcher.idle();

    expect(processIssueSourceMock).not.toHaveBeenCalled();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain("Post \"https://api.github.com/graphql\": EOF");
    expect(posted[0]).toContain("<!-- agent-moebius:dead-letter -->");
    expect(runner.persister.state().issues[issue.issueKey]).toMatchObject({
      mode: "idle",
      updatedAt: "2026-07-01T00:05:00Z",
      failureCount: 0,
      activeNoChangeCount: 0,
      nextPollAt: null,
    });
  });

  it("keeps retrying when dead-letter posting fails", async () => {
    const issue = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 67 });
    const runner = createRunner({
      initialState: {
        repositories: {
          [`${source.owner}/${source.repo}`]: {
            lastIdleScanAt: "2026-07-01T00:00:00.000Z",
          },
        },
        issues: {
          [issue.issueKey]: {
            owner: issue.owner,
            repo: issue.repo,
            issueNumber: issue.issueNumber,
            updatedAt: "2026-07-01T00:00:00Z",
            mode: "idle",
            activeNoChangeCount: 0,
            nextPollAt: null,
            failureCount: 4,
          },
        },
      },
      dependencies: makeRunnerDependencies({
        summaries: [{ issueNumber: 67, updatedAt: "2026-07-01T00:05:00Z" }],
        processIssueSource: async () => failedIssueProcessingOutcome({ reason: "still failing", agent: "dev" }),
        postComment: async () => {
          throw new Error("comment failed");
        },
      }),
    });

    await runner.heartbeat(new Date("2026-07-01T00:10:00Z"));
    await runner.dispatcher.idle();

    expect(runner.persister.state().issues[issue.issueKey]).toMatchObject({
      mode: "active",
      updatedAt: "2026-07-01T00:00:00Z",
      failureCount: 5,
      lastFailureReason: "still failing",
    });
  });

  it("does not post a dead-letter comment when processing recovers on the budget round", async () => {
    const issue = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 67 });
    const postComment = vi.fn(async () => {});
    const runner = createRunner({
      initialState: {
        repositories: {
          [`${source.owner}/${source.repo}`]: {
            lastIdleScanAt: "2026-07-01T00:00:00.000Z",
          },
        },
        issues: {
          [issue.issueKey]: {
            owner: issue.owner,
            repo: issue.repo,
            issueNumber: issue.issueNumber,
            updatedAt: "2026-07-01T00:00:00Z",
            mode: "idle",
            activeNoChangeCount: 0,
            nextPollAt: null,
            failureCount: 4,
            lastFailureReason: "old failure",
          },
        },
      },
      dependencies: makeRunnerDependencies({
        summaries: [{ issueNumber: 67, updatedAt: "2026-07-01T00:05:00Z" }],
        processIssueSource: async () => "triggered-success",
        postComment,
      }),
    });

    await runner.heartbeat(new Date("2026-07-01T00:10:00Z"));
    await runner.dispatcher.idle();

    expect(postComment).not.toHaveBeenCalled();
    expect(runner.persister.state().issues[issue.issueKey]).toMatchObject({
      mode: "active",
      updatedAt: "2026-07-01T00:05:00Z",
      failureCount: 0,
    });
  });
});

describe("codex driver pool default limit", () => {
  it("pins the default concurrent limit at 5 to guard against silent bumps", () => {
    expect(CODEX_DRIVER_POOL_MAX_CONCURRENT).toBe(5);
  });

  it("caps the default codex driver pool at 5 concurrent jobs", async () => {
    const pool = createDefaultCodexDriverPool();
    const release = deferred<void>();
    let running = 0;
    let maxRunning = 0;

    const jobs = Array.from({ length: 7 }, (_, index) =>
      pool.run(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await release.promise;
        running -= 1;
        return index;
      }),
    );

    await delay(0);
    expect(maxRunning).toBe(CODEX_DRIVER_POOL_MAX_CONCURRENT);
    expect(running).toBe(CODEX_DRIVER_POOL_MAX_CONCURRENT);

    release.resolve();
    await expect(Promise.all(jobs)).resolves.toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("isolates a hanging job so other slots stay usable", async () => {
    const pool = createDefaultCodexDriverPool();
    const hang = deferred<void>();
    const releaseCompletable = deferred<void>();
    let running = 0;
    let maxRunning = 0;
    const completed: number[] = [];

    const hangingJob = pool.run(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await hang.promise;
      running -= 1;
      return -1;
    });

    const completableJobs = Array.from({ length: 4 }, (_, index) =>
      pool.run(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await releaseCompletable.promise;
        running -= 1;
        completed.push(index);
        return index;
      }),
    );

    await delay(0);
    expect(maxRunning).toBe(CODEX_DRIVER_POOL_MAX_CONCURRENT);
    expect(running).toBe(CODEX_DRIVER_POOL_MAX_CONCURRENT);

    releaseCompletable.resolve();
    await expect(Promise.all(completableJobs)).resolves.toEqual([0, 1, 2, 3]);
    expect(completed).toEqual([0, 1, 2, 3]);

    let laterJobStarted = false;
    const laterJob = pool.run(async () => {
      laterJobStarted = true;
      return "later";
    });
    await expect(laterJob).resolves.toBe("later");
    expect(laterJobStarted).toBe(true);

    hang.resolve();
    await expect(hangingJob).resolves.toBe(-1);
  });

  it("releases queued driver pool capacity when a Codex driver never settles after watchdog abort", async () => {
    const first = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 67 });
    const second = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 68 });
    const agent = await makeAgentFile("dev", "Dev persona");
    const firstCodexStarted = deferred<void>();
    let secondStarted = false;
    let abortReason: string | null = null;
    const runCodex = vi.fn<ProcessIssueSourceDependencies["runCodex"]>(
      async (options) =>
        new Promise(() => {
          firstCodexStarted.resolve();
          options.signal?.addEventListener(
            "abort",
            () => {
              abortReason = String(options.signal?.reason);
            },
            { once: true },
          );
        }),
    );
    const processIssueSourceDependency: RunnerDependencies["processIssueSource"] = async (input) => {
      if (input.source.issueNumber === first.issueNumber) {
        return processIssueSource(
          input,
          makeDependencies({
            runCodex,
            fetchIssueWithComments: async () => makeIssue("@dev please run", [], "OPEN", input.issue.updatedAt),
          }),
        );
      }

      secondStarted = true;
      return "triggered-success";
    };
    const runner = createRunner({
      initialState: stateWithIdleScanDueIssues([first, second]),
      dependencies: makeRunnerDependencies({
        driverPool: createDriverPool({ maxConcurrent: 1 }),
        listAgentFiles: async () => [agent],
        summaries: [
          { issueNumber: 67, updatedAt: "2026-07-01T00:05:00Z" },
          { issueNumber: 68, updatedAt: "2026-07-01T00:06:00Z" },
        ],
        processIssueSource: processIssueSourceDependency,
      }),
    });

    vi.useFakeTimers();
    try {
      await runner.heartbeat(new Date("2026-07-01T00:10:00Z"));
      await firstCodexStarted.promise;
      expect(secondStarted).toBe(false);

      await vi.advanceTimersByTimeAsync(CODEX_RUN_MAX_DURATION_MS);
      await runner.dispatcher.idle();

      expect(abortReason).toBe(`codex-run-timeout:${String(CODEX_RUN_MAX_DURATION_MS)}ms`);
      expect(secondStarted).toBe(true);
      expect(runner.persister.state().issues[first.issueKey]).toMatchObject({
        mode: "active",
        updatedAt: "2026-07-01T00:00:00Z",
        failureCount: 1,
        lastFailureReason: `codex-run-timeout:${String(CODEX_RUN_MAX_DURATION_MS)}ms`,
      });
      expect(runner.persister.state().issues[second.issueKey]).toMatchObject({
        mode: "active",
        updatedAt: "2026-07-01T00:06:00Z",
        failureCount: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("makeRunDir", () => {
  it("generates unique run directories for the same timestamp and message count", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");

    const first = makeRunDir(1, now);
    const second = makeRunDir(1, now);

    expect(first).not.toBe(second);
    expect(first).toMatch(/-c1-r\d+$/);
    expect(second).toMatch(/-c1-r\d+$/);
  });
});

describe("processIssueSource Codex execution reaction", () => {
  it("adds an eyes reaction to the issue before running Codex when issue body triggers", async () => {
    const calls: string[] = [];
    const agent = await makeAgentFile("dev", "Dev persona");
    const addReaction = vi.fn(async () => {
      calls.push("reaction");
    });
    const runCodex = vi.fn(async (options: Parameters<ProcessIssueSourceDependencies["runCodex"]>[0]) => {
      calls.push("codex");
      return successfulCodexRun(options.runDir);
    });
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {
      calls.push("comment");
    });

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({ addReaction, runCodex, postComment }),
    );

    expect(outcome).toBe("triggered-success");
    expect(calls.slice(0, 2)).toEqual(["reaction", "codex"]);
    expect(addReaction).toHaveBeenCalledWith({ kind: "issue", source }, "eyes");
    expect(runCodex).toHaveBeenCalledTimes(1);
    expect(postComment).toHaveBeenCalledTimes(1);
    expect(postComment.mock.calls[0]?.[1]).toContain("<!-- agent-moebius:ceo-reviewed action=no_change -->");
  });

  it("adds an eyes reaction to the latest comment before running Codex when comment triggers", async () => {
    const calls: string[] = [];
    const agent = await makeAgentFile("dev", "Dev persona");
    const addReaction = vi.fn(async () => {
      calls.push("reaction");
    });
    const runCodex = vi.fn(async (options: Parameters<ProcessIssueSourceDependencies["runCodex"]>[0]) => {
      calls.push("codex");
      return successfulCodexRun(options.runDir);
    });

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("initial", [{ id: "comment-node-1", body: "@dev please run" }]),
        agentFiles: [agent],
      },
      makeDependencies({ addReaction, runCodex }),
    );

    expect(outcome).toBe("triggered-success");
    expect(calls.slice(0, 2)).toEqual(["reaction", "codex"]);
    expect(addReaction).toHaveBeenCalledWith(
      { kind: "issue-comment", source, commentId: "comment-node-1" },
      "eyes",
    );
    expect(runCodex).toHaveBeenCalledTimes(1);
  });

  it("continues running Codex when adding the reaction fails", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const addReaction = vi.fn(async () => {
      throw new Error("reaction failed");
    });
    const runCodex = vi.fn(async (options: Parameters<ProcessIssueSourceDependencies["runCodex"]>[0]) =>
      successfulCodexRun(options.runDir),
    );

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("initial", [{ id: "comment-node-1", body: "@dev please run" }]),
        agentFiles: [agent],
      },
      makeDependencies({ addReaction, runCodex }),
    );

    expect(outcome).toBe("triggered-success");
    expect(addReaction).toHaveBeenCalledWith({ kind: "issue-comment", source, commentId: "comment-node-1" }, "eyes");
    expect(runCodex).toHaveBeenCalledTimes(1);
  });

  it("passes preScript Codex cwd to the secretary Codex run", async () => {
    const secretary = await makeAgentFile(
      "secretary",
      `---
preScript: src/agent-prescripts/current-repo-workspace.ts
---
Secretary persona`,
    );
    const runAgentPreScript = vi.fn(async () => ({ ok: true as const, codexCwd: "/repo/agent-moebius" }));
    const runCodex = vi.fn(async (options: Parameters<ProcessIssueSourceDependencies["runCodex"]>[0]) =>
      successfulCodexRun(options.runDir),
    );

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@secretary learn this CEO miss"),
        agentFiles: [secretary],
      },
      makeDependencies({ runAgentPreScript, runCodex }),
    );

    expect(outcome).toBe("triggered-success");
    expect(runAgentPreScript).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "secretary",
        preScript: "src/agent-prescripts/current-repo-workspace.ts",
      }),
    );
    expect(runCodex.mock.calls[0]?.[0].cwd).toBe("/repo/agent-moebius");
  });

  it("passes workspace Codex cwd and prompt context to a workspace-capable agent", async () => {
    const dev = await makeAgentFile(
      "dev",
      `---
workspaceAccess: write
---
Dev persona`,
    );
    const runIssueWorktreeCapability = vi.fn(async () => ({
      ok: true as const,
      codexCwd: "/worktrees/tranfu-labs__agent-moebius__4",
      promptContext: "Issue workspace capability context:\n- workspaceAccess: write",
    }));
    const runCodex = vi.fn(async (options: Parameters<ProcessIssueSourceDependencies["runCodex"]>[0]) =>
      successfulCodexRun(options.runDir),
    );

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [dev],
      },
      makeDependencies({ runIssueWorktreeCapability, runCodex }),
    );

    expect(outcome).toBe("triggered-success");
    expect(runIssueWorktreeCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "dev",
        workspaceAccess: "write",
        issueSource: source,
      }),
    );
    expect(runCodex.mock.calls[0]?.[0].cwd).toBe("/worktrees/tranfu-labs__agent-moebius__4");
    expect(runCodex.mock.calls[0]?.[0].prompt).toContain("Issue workspace capability context");
  });

  it("returns a failed outcome when workspace preparation fails before Codex", async () => {
    const dev = await makeAgentFile(
      "dev",
      `---
workspaceAccess: write
---
Dev persona`,
    );
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const runCodex = vi.fn<ProcessIssueSourceDependencies["runCodex"]>(async (options) =>
      successfulCodexRun(options.runDir),
    );

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [dev],
      },
      makeDependencies({
        postComment,
        runCodex,
        runIssueWorktreeCapability: async () => ({ ok: false, reason: "issue-worktree-error:timeout" }),
      }),
    );

    expect(outcome).toMatchObject({
      kind: "failed",
      agent: "dev",
      reason: "issue-worktree-error:timeout",
    });
    expect(runCodex).not.toHaveBeenCalled();
    expect(postComment).not.toHaveBeenCalled();
  });

  it("does not add a second reaction when resume falls back to a full Codex run", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const addReaction = vi.fn(async () => {});
    const runCodex = vi.fn(async (options: Parameters<ProcessIssueSourceDependencies["runCodex"]>[0]) => {
      if (options.mode?.kind === "resume") {
        return failedCodexRun(options.runDir, "resume failed");
      }

      return successfulCodexRun(options.runDir);
    });

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("initial", [{ id: "comment-node-1", body: "@dev please run again" }]),
        agentFiles: [agent],
      },
      makeDependencies({
        addReaction,
        runCodex,
        loadRoleThreadStateStore: async () => ({
          [source.issueKey]: {
            dev: {
              threadId: "thread-1",
              lastSeenIndex: 0,
            },
          },
        }),
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(addReaction).toHaveBeenCalledTimes(1);
    expect(addReaction).toHaveBeenCalledWith({ kind: "issue-comment", source, commentId: "comment-node-1" }, "eyes");
    expect(runCodex).toHaveBeenCalledTimes(2);
    expect(runCodex.mock.calls[0]?.[0].mode).toEqual({ kind: "resume", threadId: "thread-1" });
    expect(runCodex.mock.calls[1]?.[0].mode).toEqual({ kind: "full" });
  });

  it("does not post a stale Codex result when a new comment arrives before posting", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const saveRoleThreadStateEntry = vi.fn<ProcessIssueSourceDependencies["saveRoleThreadStateEntry"]>(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({
        fetchIssueWithComments: async () => makeIssue("@dev please run", [{ body: "new comment" }]),
        postComment,
        saveRoleThreadStateEntry,
      }),
    );

    expect(outcome).toBe("interrupted");
    expect(postComment).not.toHaveBeenCalled();
    expect(saveRoleThreadStateEntry).not.toHaveBeenCalled();
  });

  it("passes prepared issue images and media manifest to Codex", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const prepareIssueMedia = vi.fn(async (input: Parameters<ProcessIssueSourceDependencies["prepareIssueMedia"]>[0]) => ({
      ok: true as const,
      prepared: [
        {
          reference: input.references[0]!,
          messageIndex: input.references[0]!.messageIndex,
          kind: "image" as const,
          filePath: "/tmp/run/input-media/0000-01-image.png",
          originalUrl: input.references[0]!.url,
          label: "screen",
          contentType: "image/png",
          byteLength: 5,
        },
      ],
      imagePaths: ["/tmp/run/input-media/0000-01-image.png"],
    }));
    const runCodex = vi.fn(async (options: Parameters<ProcessIssueSourceDependencies["runCodex"]>[0]) => {
      expect(options.imagePaths).toEqual(["/tmp/run/input-media/0000-01-image.png"]);
      expect(options.prompt).toContain("本轮可用媒体文件");
      expect(options.prompt).toContain("kind=image");
      return successfulCodexRun(options.runDir);
    });

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please inspect ![screen](https://example.test/screen.png)"),
        agentFiles: [agent],
      },
      makeDependencies({ prepareIssueMedia, runCodex }),
    );

    expect(outcome).toBe("triggered-success");
    expect(prepareIssueMedia.mock.calls[0]?.[0].references[0]).toMatchObject({
      kind: "image",
      url: "https://example.test/screen.png",
    });
    expect(runCodex).toHaveBeenCalledTimes(1);
  });

  it("posts a media preparation error without running Codex or saving role state", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const runCodex = vi.fn(async (options: Parameters<ProcessIssueSourceDependencies["runCodex"]>[0]) =>
      successfulCodexRun(options.runDir),
    );
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const saveRoleThreadStateEntry = vi.fn(async () => {});
    const prepareIssueMedia = vi.fn(async (input: Parameters<ProcessIssueSourceDependencies["prepareIssueMedia"]>[0]) => ({
      ok: false as const,
      failures: [{ reference: input.references[0]!, reason: "unsupported-content-type:text/html" }],
    }));

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev inspect ![screen](https://example.test/screen.png)"),
        agentFiles: [agent],
      },
      makeDependencies({ prepareIssueMedia, runCodex, postComment, saveRoleThreadStateEntry }),
    );

    expect(outcome).toBe("triggered-success");
    expect(runCodex).not.toHaveBeenCalled();
    expect(saveRoleThreadStateEntry).not.toHaveBeenCalled();
    expect(postComment.mock.calls[0]?.[1]).toContain("无法准备媒体输入");
    expect(postComment.mock.calls[0]?.[1]).toContain(
      "<!-- agent-moebius:ceo-reviewed action=bypass reason=media-preparation-failed -->",
    );
  });

  it("publishes output artifacts before CEO sees the final response", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const formatCeoComment = vi.fn(async (input: Parameters<ProcessIssueSourceDependencies["formatCeoComment"]>[0]) =>
      noChangeCeoResult(input.latestResponse),
    );
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const writeRunManifest = vi.fn<ProcessIssueSourceDependencies["writeRunManifest"]>(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev generate an svg"),
        agentFiles: [agent],
      },
      makeDependencies({
        discoverOutputArtifacts: async (input) => [
          {
            filePath: path.join(input.runDir, "output-artifacts", "diagram.svg"),
            assetName: "diagram.svg",
            displayName: "diagram.svg",
            kind: "image",
            byteLength: 11,
          },
        ],
        publishArtifacts: async () => [{ displayName: "diagram.svg", kind: "image", url: "https://example.test/diagram.svg" }],
        formatCeoComment,
        postComment,
        writeRunManifest,
        runCodex: async (options) =>
          successfulCodexRunWithFinalText(
            options.runDir,
            "done\n<!-- agent-moebius:stage=code-verified -->",
          ),
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(formatCeoComment.mock.calls[0]?.[0].latestResponse).toContain(
      "![diagram.svg](https://example.test/diagram.svg)",
    );
    expect(postComment.mock.calls[0]?.[1]).toContain("![diagram.svg](https://example.test/diagram.svg)");
    expect(writeRunManifest).toHaveBeenCalledTimes(1);
    expect(writeRunManifest.mock.calls[0]?.[0].record).toMatchObject({
      issue: { owner: source.owner, repo: source.repo, number: source.issueNumber },
      role: "dev",
      stage: "code-verified",
      artifacts: [{ path: "output-artifacts/diagram.svg", publishedUrl: "https://example.test/diagram.svg" }],
    });
  });

  it("writes a run manifest with an empty artifacts array when no artifacts are discovered", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const writeRunManifest = vi.fn<ProcessIssueSourceDependencies["writeRunManifest"]>(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({ writeRunManifest }),
    );

    expect(outcome).toBe("triggered-success");
    expect(writeRunManifest).toHaveBeenCalledTimes(1);
    expect(writeRunManifest.mock.calls[0]?.[0].record).toMatchObject({
      role: "dev",
      stage: "unknown",
      artifacts: [],
    });
  });

  it("posts an artifact publishing error without saving role state", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const saveRoleThreadStateEntry = vi.fn<ProcessIssueSourceDependencies["saveRoleThreadStateEntry"]>(async () => {});
    const writeRunManifest = vi.fn<ProcessIssueSourceDependencies["writeRunManifest"]>(async () => {});
    const formatCeoComment = vi.fn(async (input: Parameters<ProcessIssueSourceDependencies["formatCeoComment"]>[0]) =>
      noChangeCeoResult(input.latestResponse),
    );

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev generate an svg"),
        agentFiles: [agent],
      },
      makeDependencies({
        discoverOutputArtifacts: async (input) => [
          {
            filePath: path.join(input.runDir, "output-artifacts", "diagram.svg"),
            assetName: "diagram.svg",
            displayName: "diagram.svg",
            kind: "image",
            byteLength: 11,
          },
        ],
        publishArtifacts: async () => {
          throw new Error("upload failed");
        },
        postComment,
        saveRoleThreadStateEntry,
        formatCeoComment,
        writeRunManifest,
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(formatCeoComment).not.toHaveBeenCalled();
    expect(saveRoleThreadStateEntry).not.toHaveBeenCalled();
    expect(postComment.mock.calls[0]?.[1]).toContain("无法发布生成产物");
    expect(postComment.mock.calls[0]?.[1]).toContain(
      "<!-- agent-moebius:ceo-reviewed action=bypass reason=artifact-publishing-failed -->",
    );
    expect(writeRunManifest).toHaveBeenCalledTimes(1);
    expect(writeRunManifest.mock.calls[0]?.[0].record.artifacts).toEqual([
      { path: "output-artifacts/diagram.svg", publishedUrl: null },
    ]);
  });

  it("does not let manifest writer failures block comments or role state", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const saveRoleThreadStateEntry = vi.fn<ProcessIssueSourceDependencies["saveRoleThreadStateEntry"]>(async () => {});
    const writeRunManifest = vi.fn<ProcessIssueSourceDependencies["writeRunManifest"]>(async () => {
      throw new Error("manifest unavailable");
    });

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({ postComment, saveRoleThreadStateEntry, writeRunManifest }),
    );

    expect(outcome).toBe("triggered-success");
    expect(postComment).toHaveBeenCalledTimes(1);
    expect(saveRoleThreadStateEntry).toHaveBeenCalledTimes(1);
  });

  it("does not let manifest writer failures block artifact error comments", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const saveRoleThreadStateEntry = vi.fn<ProcessIssueSourceDependencies["saveRoleThreadStateEntry"]>(async () => {});
    const writeRunManifest = vi.fn<ProcessIssueSourceDependencies["writeRunManifest"]>(async () => {
      throw new Error("manifest unavailable");
    });

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev generate an svg"),
        agentFiles: [agent],
      },
      makeDependencies({
        discoverOutputArtifacts: async (input) => [
          {
            filePath: path.join(input.runDir, "output-artifacts", "diagram.svg"),
            assetName: "diagram.svg",
            displayName: "diagram.svg",
            kind: "image",
            byteLength: 11,
          },
        ],
        publishArtifacts: async () => {
          throw new Error("upload failed");
        },
        postComment,
        saveRoleThreadStateEntry,
        writeRunManifest,
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(postComment.mock.calls[0]?.[1]).toContain("无法发布生成产物");
    expect(postComment.mock.calls[0]?.[1]).toContain(
      "<!-- agent-moebius:ceo-reviewed action=bypass reason=artifact-publishing-failed -->",
    );
    expect(saveRoleThreadStateEntry).not.toHaveBeenCalled();
  });

  it("returns a failed outcome with the pre script reason before any comment is posted", async () => {
    const agent = await makeAgentFile(
      "dev",
      `---
preScript: src/agent-prescripts/dev-workspace.ts
---
Dev persona`,
    );
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({
        postComment,
        runAgentPreScript: async () => ({ ok: false, reason: "dev-workspace-error:git failed with exit-code-128" }),
      }),
    );

    expect(outcome).toMatchObject({
      kind: "failed",
      agent: "dev",
      reason: "dev-workspace-error:git failed with exit-code-128",
    });
    expect(postComment).not.toHaveBeenCalled();
  });

  it("does not nack after the first visible agent comment has been posted", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const postComment = vi
      .fn<ProcessIssueSourceDependencies["postComment"]>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("second comment failed"));
    const saveRoleThreadStateEntry = vi.fn<ProcessIssueSourceDependencies["saveRoleThreadStateEntry"]>(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({
        postComment,
        saveRoleThreadStateEntry,
        formatCeoComment: async () => ({
          action: "APPEND",
          as: "ceo",
          body: "Please continue without waiting.",
          reason: "appended",
        }),
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(postComment).toHaveBeenCalledTimes(2);
    expect(saveRoleThreadStateEntry).toHaveBeenCalledTimes(1);
  });

  it("fails open and still posts the Codex result when the final interrupt check hits a transient gh error", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const saveRoleThreadStateEntry = vi.fn(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({
        fetchIssueWithComments: async () => {
          throw new CommandFailedError("gh", 1, null, 'Post "https://api.github.com/graphql": EOF');
        },
        postComment,
        saveRoleThreadStateEntry,
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(postComment).toHaveBeenCalledTimes(1);
    expect(saveRoleThreadStateEntry).toHaveBeenCalledTimes(1);
  });

  it("does not add a reaction when no Codex driver will run", async () => {
    const dev = await makeAgentFile("dev", "Dev persona");
    const devWithPreScript = await makeAgentFile(
      "dev",
      `---
preScript: src/agent-prescripts/dev-workspace.ts
---
Dev persona`,
    );

    await expectNoReaction({
      issue: makeIssue("plain latest message"),
      agentFiles: [dev],
      expectedOutcome: "no-trigger",
    });
    await expectNoReaction({
      issue: makeIssue("initial", [
        {
          body: "&lt;dev&gt;:\nplan\n<!-- agent-moebius:stage=plan-written -->\n\n<!-- agent-moebius:role=dev -->",
        },
      ]),
      agentFiles: [dev],
      expectedOutcome: "no-trigger",
    });
    await expectNoReaction({
      issue: makeIssue("@dev please run"),
      agentFiles: [devWithPreScript],
      dependencies: makeDependencies({
        runAgentPreScript: async () => ({ ok: false, reason: "blocked" }),
      }),
      expectedOutcome: "failed",
    });
    await expectNoReaction({
      issue: makeIssue("@dev please run"),
      agentFiles: [dev],
      dependencies: makeDependencies({
        loadRoleThreadStateStore: async () => ({
          [source.issueKey]: {
            dev: {
              threadId: "thread-1",
              lastSeenIndex: 0,
            },
          },
        }),
      }),
      expectedOutcome: "no-trigger",
    });
  });

  it("posts a visible fail-closed comment when the CEO ledger prescript fails", async () => {
    const ceo = await makeAgentFile(
      "ceo",
      `---
preScript: src/agent-prescripts/ceo-ledger-context.ts
---
CEO persona`,
    );
    const runCodex = vi.fn<ProcessIssueSourceDependencies["runCodex"]>(async (options) =>
      successfulCodexRun(options.runDir),
    );
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const saveRoleThreadStateEntry = vi.fn<ProcessIssueSourceDependencies["saveRoleThreadStateEntry"]>(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@ceo 请拆解。"),
        agentFiles: [ceo],
      },
      makeDependencies({
        runCodex,
        postComment,
        saveRoleThreadStateEntry,
        runAgentPreScript: async () => ({
          ok: false,
          reason: "ceo-ledger-context-error:missing-ledger",
          visibleFailureBody:
            "CEO 编排路径 fail-closed：missing-ledger\n\n<!-- agent-moebius:stage=in-progress -->",
        }),
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(runCodex).not.toHaveBeenCalled();
    expect(saveRoleThreadStateEntry).not.toHaveBeenCalled();
    expect(postComment.mock.calls[0]?.[1]).toContain("CEO 编排路径 fail-closed");
    expect(postComment.mock.calls[0]?.[1]).toContain(
      "<!-- agent-moebius:ceo-reviewed action=bypass reason=agent-prescript-failed -->",
    );
  });

  it("posts a visible fail-closed comment when CEO orchestration context reload fails after Codex", async () => {
    const ceo = await makeAgentFile("ceo", "CEO persona");
    const dev = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const saveRoleThreadStateEntry = vi.fn<ProcessIssueSourceDependencies["saveRoleThreadStateEntry"]>(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@ceo 请按账本拆解。"),
        agentFiles: [ceo, dev],
      },
      makeDependencies({
        postComment,
        saveRoleThreadStateEntry,
        loadCeoScripts: async () => {
          throw new Error("missing script");
        },
        runCodex: async (options) =>
          successfulCodexRunWithFinalText(options.runDir, makeCeoSpawnFinalText({ title: "T3 child" })),
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(postComment.mock.calls[0]?.[1]).toContain("CEO 编排路径 fail-closed");
    expect(postComment.mock.calls[0]?.[1]).toContain("missing script");
    expect(postComment.mock.calls[0]?.[1]).toContain("ceo-orchestration-failed");
    expect(saveRoleThreadStateEntry).not.toHaveBeenCalled();
  });

  it("runs CEO spawn orchestration through the GitHub adapter and writes a child ledger ref", async () => {
    const ceo = await makeAgentFile("ceo", "CEO persona");
    const dev = await makeAgentFile("dev", "Dev persona");
    const ledger = makeCeoLedgerState();
    const createIssue = vi.fn<ProcessIssueSourceDependencies["createIssue"]>(async () => ({
      number: 101,
      url: "https://github.com/tranfu-labs/agent-moebius/issues/101",
    }));
    const saveGoalLedgerEntry = vi.fn<ProcessIssueSourceDependencies["saveGoalLedgerEntry"]>(async (kind, id, mutate) => {
      expect(kind).toBe("tasks");
      const next = mutate(ledger.tasks[id] ?? null, ledger);
      if (next !== null) {
        ledger.tasks[id] = next as GoalLedgerState["tasks"][string];
      }
    });
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const saveRoleThreadStateEntry = vi.fn<ProcessIssueSourceDependencies["saveRoleThreadStateEntry"]>(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@ceo 请按账本拆解。"),
        agentFiles: [ceo, dev],
      },
      makeDependencies({
        createIssue,
        postComment,
        saveGoalLedgerEntry,
        saveRoleThreadStateEntry,
        loadCeoScripts: async () => ceoScriptsForRunner(),
        loadGoalLedgerState: async () => ledger,
        runCodex: async (options) =>
          successfulCodexRunWithFinalText(options.runDir, makeCeoSpawnFinalText({ title: "T3 child" })),
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(createIssue).toHaveBeenCalledTimes(1);
    expect(createIssue.mock.calls[0]?.[1].title).toBe("T3 child");
    expect(createIssue.mock.calls[0]?.[1].body).toContain("Parent issue: https://github.com/tranfu-labs/agent-moebius/issues/4");
    expect(createIssue.mock.calls[0]?.[1].body).toContain("Quality baseline: data-correct");
    expect(createIssue.mock.calls[0]?.[1].body).toContain("@dev 请按本子 issue");
    expect(saveGoalLedgerEntry).toHaveBeenCalledTimes(1);
    expect(ledger.tasks["task-1"]?.childIssueRefs[0]).toMatchObject({
      owner: "tranfu-labs",
      repo: "agent-moebius",
      number: 101,
      relation: "child",
      status: "open",
    });
    expect(ledger.tasks["task-1"]?.childIssueRefs[0]?.note).toContain("agent-moebius-orchestration-key:");
    expect(postComment.mock.calls[0]?.[1]).toContain("CEO 编排完成");
    expect(postComment.mock.calls[0]?.[1]).toContain("issues/101");
    expect(saveRoleThreadStateEntry).toHaveBeenCalledTimes(1);
  });

  it("settles with a visible fail-closed comment when createIssue never settles", async () => {
    const ceo = await makeAgentFile("ceo", "CEO persona");
    const dev = await makeAgentFile("dev", "Dev persona");
    const createStarted = deferred<void>();
    const createIssue = vi.fn<ProcessIssueSourceDependencies["createIssue"]>(
      async () =>
        new Promise(() => {
          createStarted.resolve();
        }),
    );
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const saveRoleThreadStateEntry = vi.fn<ProcessIssueSourceDependencies["saveRoleThreadStateEntry"]>(async () => {});

    vi.useFakeTimers();
    try {
      const outcomePromise = processIssueSource(
        {
          source,
          issue: makeIssue("@ceo 请按账本拆解。"),
          agentFiles: [ceo, dev],
        },
        makeDependencies({
          createIssue,
          postComment,
          saveRoleThreadStateEntry,
          loadCeoScripts: async () => ceoScriptsForRunner(),
          loadGoalLedgerState: async () => makeCeoLedgerState(),
          runCodex: async (options) =>
            successfulCodexRunWithFinalText(options.runDir, makeCeoSpawnFinalText({ title: "T3 child" })),
        }),
      );

      await createStarted.promise;
      await vi.advanceTimersByTimeAsync(CEO_ORCHESTRATION_ACTION_TIMEOUT_MS);
      await expect(outcomePromise).resolves.toBe("triggered-success");
    } finally {
      vi.useRealTimers();
    }

    expect(postComment.mock.calls[0]?.[1]).toContain("createIssue-timeout");
    expect(saveRoleThreadStateEntry).not.toHaveBeenCalled();
  });

  it("includes the created issue URL when ledger child ref saving times out", async () => {
    const ceo = await makeAgentFile("ceo", "CEO persona");
    const dev = await makeAgentFile("dev", "Dev persona");
    const saveStarted = deferred<void>();
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const saveRoleThreadStateEntry = vi.fn<ProcessIssueSourceDependencies["saveRoleThreadStateEntry"]>(async () => {});

    vi.useFakeTimers();
    try {
      const outcomePromise = processIssueSource(
        {
          source,
          issue: makeIssue("@ceo 请按账本拆解。"),
          agentFiles: [ceo, dev],
        },
        makeDependencies({
          createIssue: async () => ({ number: 101, url: "https://github.com/tranfu-labs/agent-moebius/issues/101" }),
          postComment,
          saveRoleThreadStateEntry,
          saveGoalLedgerEntry: async () =>
            new Promise(() => {
              saveStarted.resolve();
            }),
          loadCeoScripts: async () => ceoScriptsForRunner(),
          loadGoalLedgerState: async () => makeCeoLedgerState(),
          runCodex: async (options) =>
            successfulCodexRunWithFinalText(options.runDir, makeCeoSpawnFinalText({ title: "T3 child" })),
        }),
      );

      await saveStarted.promise;
      await vi.advanceTimersByTimeAsync(CEO_ORCHESTRATION_ACTION_TIMEOUT_MS);
      await expect(outcomePromise).resolves.toBe("triggered-success");
    } finally {
      vi.useRealTimers();
    }

    expect(postComment.mock.calls[0]?.[1]).toContain("saveGoalLedgerEntry-timeout");
    expect(postComment.mock.calls[0]?.[1]).toContain("https://github.com/tranfu-labs/agent-moebius/issues/101");
    expect(saveRoleThreadStateEntry).not.toHaveBeenCalled();
  });

  it("returns failed when fail-closed comment publishing also fails and preserves created URLs in the reason", async () => {
    const ceo = await makeAgentFile("ceo", "CEO persona");
    const dev = await makeAgentFile("dev", "Dev persona");
    const saveRoleThreadStateEntry = vi.fn<ProcessIssueSourceDependencies["saveRoleThreadStateEntry"]>(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@ceo 请按账本拆解。"),
        agentFiles: [ceo, dev],
      },
      makeDependencies({
        createIssue: async () => ({ number: 101, url: "https://github.com/tranfu-labs/agent-moebius/issues/101" }),
        postComment: async () => {
          throw new Error("comment failed");
        },
        saveGoalLedgerEntry: async () => {
          throw new Error("ledger write failed");
        },
        saveRoleThreadStateEntry,
        loadCeoScripts: async () => ceoScriptsForRunner(),
        loadGoalLedgerState: async () => makeCeoLedgerState(),
        runCodex: async (options) =>
          successfulCodexRunWithFinalText(options.runDir, makeCeoSpawnFinalText({ title: "T3 child" })),
      }),
    );

    expect(outcome).toMatchObject({
      kind: "failed",
      agent: "ceo",
      reason: expect.stringContaining("https://github.com/tranfu-labs/agent-moebius/issues/101"),
    });
    expect(saveRoleThreadStateEntry).not.toHaveBeenCalled();
  });

  it("does not create a duplicate child issue when the ledger already has the orchestration key", async () => {
    const ceo = await makeAgentFile("ceo", "CEO persona");
    const dev = await makeAgentFile("dev", "Dev persona");
    const key = buildCeoOrchestrationKey({ source, workflowId: "milestone-spawn-child-issues", ledgerTaskId: "task-1" });
    const ledger = makeCeoLedgerState({
      childIssueRefs: [
        {
          owner: "tranfu-labs",
          repo: "agent-moebius",
          number: 101,
          relation: "child",
          status: "open",
          note: `${key}; provenance=previous`,
        },
      ],
    });
    const createIssue = vi.fn<ProcessIssueSourceDependencies["createIssue"]>(async () => ({
      number: 102,
      url: "https://github.com/tranfu-labs/agent-moebius/issues/102",
    }));
    const findIssueByOrchestrationKey = vi.fn<ProcessIssueSourceDependencies["findIssueByOrchestrationKey"]>(async () => ({
      kind: "none",
    }));

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@ceo 请重试编排。"),
        agentFiles: [ceo, dev],
      },
      makeDependencies({
        createIssue,
        findIssueByOrchestrationKey,
        loadCeoScripts: async () => ceoScriptsForRunner(),
        loadGoalLedgerState: async () => ledger,
        runCodex: async (options) =>
          successfulCodexRunWithFinalText(options.runDir, makeCeoSpawnFinalText({ title: "T3 child renamed" })),
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(createIssue).not.toHaveBeenCalled();
    expect(findIssueByOrchestrationKey).not.toHaveBeenCalled();
  });

  it("recovers an existing child issue by hidden orchestration key before creating a duplicate", async () => {
    const ceo = await makeAgentFile("ceo", "CEO persona");
    const dev = await makeAgentFile("dev", "Dev persona");
    const ledger = makeCeoLedgerState();
    const createIssue = vi.fn<ProcessIssueSourceDependencies["createIssue"]>(async () => ({
      number: 102,
      url: "https://github.com/tranfu-labs/agent-moebius/issues/102",
    }));
    const findIssueByOrchestrationKey = vi.fn<ProcessIssueSourceDependencies["findIssueByOrchestrationKey"]>(async () => ({
      kind: "one",
      issue: {
        number: 101,
        url: "https://github.com/tranfu-labs/agent-moebius/issues/101",
      },
    }));
    const saveGoalLedgerEntry = vi.fn<ProcessIssueSourceDependencies["saveGoalLedgerEntry"]>(async (kind, id, mutate) => {
      expect(kind).toBe("tasks");
      const next = mutate(ledger.tasks[id] ?? null, ledger);
      if (next !== null) {
        ledger.tasks[id] = next as GoalLedgerState["tasks"][string];
      }
    });

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@ceo 请重试编排。"),
        agentFiles: [ceo, dev],
      },
      makeDependencies({
        createIssue,
        findIssueByOrchestrationKey,
        saveGoalLedgerEntry,
        loadCeoScripts: async () => ceoScriptsForRunner(),
        loadGoalLedgerState: async () => ledger,
        runCodex: async (options) =>
          successfulCodexRunWithFinalText(options.runDir, makeCeoSpawnFinalText({ title: "T3 child renamed" })),
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(findIssueByOrchestrationKey).toHaveBeenCalledTimes(1);
    expect(createIssue).not.toHaveBeenCalled();
    expect(saveGoalLedgerEntry).toHaveBeenCalledTimes(1);
    expect(ledger.tasks["task-1"]?.childIssueRefs[0]).toMatchObject({
      owner: "tranfu-labs",
      repo: "agent-moebius",
      number: 101,
      relation: "child",
      status: "open",
    });
    expect(ledger.tasks["task-1"]?.childIssueRefs[0]?.note).toContain("agent-moebius-orchestration-key:");
  });

  it("integration acceptance prepass posts one parent request only after every ledger child has passed", async () => {
    const dev = await makeAgentFile("dev", "Dev persona");
    const productManager = await makeAgentFile("product-manager", "PM persona");
    const ledger = makeIntegrationLedgerState({ task2Passed: true });
    const posted: Array<{ issueNumber: number; body: string }> = [];
    const saveGoalLedgerEntry = ledgerSaveMutator(ledger);
    const runCodex = vi.fn<ProcessIssueSourceDependencies["runCodex"]>(async (options) =>
      successfulCodexRun(options.runDir),
    );
    const childSource = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 101 });

    const outcome = await processIssueSource(
      {
        source: childSource,
        issue: makeIssue("child", [
          {
            id: "comment-child-pass",
            body: pmEnvelope("验收结论：通过\n1. 通过：跑 child 1"),
          },
        ]),
        agentFiles: [dev, productManager],
      },
      makeDependencies({
        loadGoalLedgerState: async () => ledger,
        saveGoalLedgerEntry,
        fetchIssueWithComments: async () => makeIssue("parent"),
        postComment: async (target, body) => {
          posted.push({ issueNumber: target.issueNumber, body });
        },
        runCodex,
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(runCodex).not.toHaveBeenCalled();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ issueNumber: source.issueNumber });
    expect(posted[0]?.body).toContain("@product-manager");
    expect(posted[0]?.body).toContain("目标级验收语句");
    expect(posted[0]?.body).toContain("agent-moebius-integration-acceptance-key:");
    expect(ledger.tasks["task-1"]?.acceptanceFacts).toHaveLength(1);
    expect(ledger.phases["phase-1"]?.integrationAcceptance?.[0]).toMatchObject({ status: "requested" });
  });

  it("integration acceptance prepass leaves parent untouched when some in-scope child is not passed", async () => {
    const productManager = await makeAgentFile("product-manager", "PM persona");
    const ledger = makeIntegrationLedgerState();
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const childSource = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 101 });

    const outcome = await processIssueSource(
      {
        source: childSource,
        issue: makeIssue("child", [
          {
            id: "comment-child-pass",
            body: pmEnvelope("验收结论：通过\n1. 通过：跑 child 1"),
          },
        ]),
        agentFiles: [productManager],
      },
      makeDependencies({
        loadGoalLedgerState: async () => ledger,
        saveGoalLedgerEntry: ledgerSaveMutator(ledger),
        postComment,
      }),
    );

    expect(outcome).toBe("no-trigger");
    expect(postComment).not.toHaveBeenCalled();
    expect(ledger.phases["phase-1"]?.integrationAcceptance).toBeUndefined();
  });

  it("integration acceptance parent request publish failure returns failed without recording requested", async () => {
    const productManager = await makeAgentFile("product-manager", "PM persona");
    const ledger = makeIntegrationLedgerState({ task2Passed: true });
    const childSource = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 101 });

    const outcome = await processIssueSource(
      {
        source: childSource,
        issue: makeIssue("child", [
          {
            id: "comment-child-pass",
            body: pmEnvelope("验收结论：通过\n1. 通过：跑 child 1"),
          },
        ]),
        agentFiles: [productManager],
      },
      makeDependencies({
        loadGoalLedgerState: async () => ledger,
        saveGoalLedgerEntry: ledgerSaveMutator(ledger),
        fetchIssueWithComments: async () => makeIssue("parent"),
        postComment: async () => {
          throw new Error("parent post failed");
        },
      }),
    );

    expect(outcome).toMatchObject({ kind: "failed", reason: "parent post failed" });
    expect(ledger.phases["phase-1"]?.integrationAcceptance).toBeUndefined();
  });

  it("integration acceptance prepass records failed child acceptance before a handoff mention triggers dev", async () => {
    const dev = await makeAgentFile("dev", "Dev persona");
    const productManager = await makeAgentFile("product-manager", "PM persona");
    const ledger = makeIntegrationLedgerState();
    const calls: string[] = [];
    const childSource = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 101 });

    const outcome = await processIssueSource(
      {
        source: childSource,
        issue: makeIssue("child", [
          {
            id: "comment-child-fail",
            body: pmEnvelope("验收结论：不通过\n1. 不通过：跑 child 1\n\n@dev 请修复失败项。"),
          },
        ]),
        agentFiles: [dev, productManager],
      },
      makeDependencies({
        loadGoalLedgerState: async () => ledger,
        saveGoalLedgerEntry: async (...args) => {
          calls.push("save");
          await ledgerSaveMutator(ledger)(...args);
        },
        runCodex: async (options) => {
          calls.push("codex");
          return successfulCodexRun(options.runDir);
        },
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(calls.slice(0, 2)).toEqual(["save", "codex"]);
    expect(ledger.tasks["task-1"]?.acceptanceFacts?.[0]).toMatchObject({ status: "failed", commentId: "comment-child-fail" });
  });

  it("integration acceptance parent failure creates a repair child and suppresses a ceo handoff mention", async () => {
    const ceo = await makeAgentFile("ceo", "CEO persona");
    const dev = await makeAgentFile("dev", "Dev persona");
    const productManager = await makeAgentFile("product-manager", "PM persona");
    const ledger = makeIntegrationLedgerState({ requested: true });
    const createIssue = vi.fn<ProcessIssueSourceDependencies["createIssue"]>(async () => ({
      number: 201,
      url: "https://github.com/tranfu-labs/agent-moebius/issues/201",
    }));
    const runCodex = vi.fn<ProcessIssueSourceDependencies["runCodex"]>(async (options) =>
      successfulCodexRun(options.runDir),
    );
    const posted: string[] = [];

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("parent", [
          {
            id: "comment-parent-fail",
            body: pmEnvelope("集成验收结论：不通过\n1. 不通过：目标级验收 1\n2. 通过：目标级验收 2\n\n@ceo 请回流修复。"),
          },
        ]),
        agentFiles: [ceo, dev, productManager],
      },
      makeDependencies({
        loadGoalLedgerState: async () => ledger,
        saveGoalLedgerEntry: ledgerSaveMutator(ledger),
        createIssue,
        runCodex,
        postComment: async (_target, body) => {
          posted.push(body);
        },
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(runCodex).not.toHaveBeenCalled();
    expect(createIssue).toHaveBeenCalledTimes(1);
    expect(createIssue.mock.calls[0]?.[1].body).toContain("@dev 请按本子 issue");
    expect(createIssue.mock.calls[0]?.[1].body).toContain("目标级验收 1");
    expect(Object.keys(ledger.tasks).some((id) => id.startsWith("integration-repair-"))).toBe(true);
    expect(posted[0]).toContain("集成验收失败已回流为修复子任务");
    expect(ledger.phases["phase-1"]?.integrationAcceptance?.find((event) => event.status === "failed")).toMatchObject({
      failedStatementIds: ["1"],
    });
  });

  it("integration acceptance fail-closed is visible on the child issue when parent ref is missing", async () => {
    const productManager = await makeAgentFile("product-manager", "PM persona");
    const ledger = makeIntegrationLedgerState({ missingParent: true, task2Passed: true });
    const childSource = makeIssueSource({ owner: source.owner, repo: source.repo, issueNumber: 101 });
    const posted: string[] = [];

    const outcome = await processIssueSource(
      {
        source: childSource,
        issue: makeIssue("child", [
          {
            id: "comment-child-pass",
            body: pmEnvelope("验收结论：通过\n1. 通过：跑 child 1"),
          },
        ]),
        agentFiles: [productManager],
      },
      makeDependencies({
        loadGoalLedgerState: async () => ledger,
        saveGoalLedgerEntry: ledgerSaveMutator(ledger),
        postComment: async (_target, body) => {
          posted.push(body);
        },
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(posted[0]).toContain("parent-reference-missing");
    expect(posted[0]).toContain("integration-acceptance-blocked");
  });

  it("integration repair hidden key lookup timeout is bounded and does not create duplicate repair issues", async () => {
    const ceo = await makeAgentFile("ceo", "CEO persona");
    const dev = await makeAgentFile("dev", "Dev persona");
    const productManager = await makeAgentFile("product-manager", "PM persona");
    const lookupStarted = deferred<void>();
    const createIssue = vi.fn<ProcessIssueSourceDependencies["createIssue"]>(async () => ({
      number: 201,
      url: "https://github.com/tranfu-labs/agent-moebius/issues/201",
    }));
    const ledger = makeIntegrationLedgerState({ requested: true });
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});

    vi.useFakeTimers();
    try {
      const outcomePromise = processIssueSource(
        {
          source,
          issue: makeIssue("parent", [
            {
              id: "comment-parent-fail",
              body: pmEnvelope("集成验收结论：不通过\n1. 不通过：目标级验收 1\n2. 通过：目标级验收 2"),
            },
          ]),
          agentFiles: [ceo, dev, productManager],
        },
        makeDependencies({
          loadGoalLedgerState: async () => ledger,
          saveGoalLedgerEntry: ledgerSaveMutator(ledger),
          createIssue,
          postComment,
          findIssueByOrchestrationKey: async () =>
            new Promise(() => {
              lookupStarted.resolve();
            }),
        }),
      );

      await lookupStarted.promise;
      await vi.advanceTimersByTimeAsync(CEO_ORCHESTRATION_ACTION_TIMEOUT_MS);
      await expect(outcomePromise).resolves.toBe("triggered-success");
    } finally {
      vi.useRealTimers();
    }

    expect(createIssue).not.toHaveBeenCalled();
    expect(postComment.mock.calls[0]?.[1]).toContain("findIssueByOrchestrationKey-timeout");
  });

  it("routes the latest external no-mention comment on active issues with a CEO append envelope", async () => {
    const dev = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const formatExternalCommentRoute = vi.fn<ProcessIssueSourceDependencies["formatExternalCommentRoute"]>(async () => ({
      action: "APPEND",
      body: "@dev 验收通过，请继续实现。",
      targetRole: "dev",
      reason: "appended",
    }));
    const runCodex = vi.fn<ProcessIssueSourceDependencies["runCodex"]>(async (options) =>
      successfulCodexRun(options.runDir),
    );

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("initial", [{ id: "comment-node-1", body: "验收通过，请继续实现。" }], "OPEN", "2026-07-01T00:05:00Z"),
        agentFiles: [dev],
        intakeIssueState: {
          ...source,
          issueNumber: source.issueNumber,
          updatedAt: "2026-07-01T00:00:00Z",
          mode: "active",
          activeNoChangeCount: 0,
          nextPollAt: "2026-07-01T00:01:00Z",
        },
      },
      makeDependencies({ formatExternalCommentRoute, postComment, runCodex }),
    );

    expect(outcome).toMatchObject({
      kind: "external-comment-fallback-route",
      result: "triggered-success",
      route: {
        commentId: "comment-node-1",
        outcome: "append",
        targetRole: "dev",
      },
    });
    expect(formatExternalCommentRoute).toHaveBeenCalledTimes(1);
    expect(runCodex).not.toHaveBeenCalled();
    expect(postComment).toHaveBeenCalledWith(
      source,
      `&lt;ceo&gt;:
@dev 验收通过，请继续实现。

<!-- agent-moebius:role=ceo -->

<!-- agent-moebius:ceo-reviewed action=external_route_append -->`,
    );
  });

  it("records no_action fallback routing without posting a comment", async () => {
    const dev = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const formatExternalCommentRoute = vi.fn<ProcessIssueSourceDependencies["formatExternalCommentRoute"]>(async () => ({
      action: "NO_ACTION",
      reason: "ceo-no-action",
    }));

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("initial", [{ id: "comment-node-1", body: "收到。" }], "OPEN", "2026-07-01T00:05:00Z"),
        agentFiles: [dev],
        intakeIssueState: activeIntakeIssueState(),
      },
      makeDependencies({ formatExternalCommentRoute, postComment }),
    );

    expect(outcome).toMatchObject({
      kind: "external-comment-fallback-route",
      result: "no-trigger",
      route: {
        commentId: "comment-node-1",
        outcome: "no_action",
        reason: "ceo-no-action",
      },
    });
    expect(postComment).not.toHaveBeenCalled();
  });

  it("records fail_open fallback routing without posting a comment", async () => {
    const dev = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const formatExternalCommentRoute = vi.fn<ProcessIssueSourceDependencies["formatExternalCommentRoute"]>(async () => ({
      action: "FAIL_OPEN",
      reason: "multiple-mentions",
    }));

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("initial", [{ id: "comment-node-1", body: "请继续实现。" }], "OPEN", "2026-07-01T00:05:00Z"),
        agentFiles: [dev],
        intakeIssueState: activeIntakeIssueState(),
      },
      makeDependencies({ formatExternalCommentRoute, postComment }),
    );

    expect(outcome).toMatchObject({
      kind: "external-comment-fallback-route",
      result: "no-trigger",
      route: {
        commentId: "comment-node-1",
        outcome: "fail_open",
        reason: "multiple-mentions",
      },
    });
    expect(postComment).not.toHaveBeenCalled();
  });

  it("does not re-run fallback routing for the same comment id", async () => {
    const dev = await makeAgentFile("dev", "Dev persona");
    const formatExternalCommentRoute = vi.fn<ProcessIssueSourceDependencies["formatExternalCommentRoute"]>(async () => ({
      action: "APPEND",
      body: "@dev please continue",
      targetRole: "dev",
      reason: "appended",
    }));

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("initial", [{ id: "comment-node-1", body: "验收通过，请继续。" }], "OPEN", "2026-07-01T00:05:00Z"),
        agentFiles: [dev],
        intakeIssueState: {
          ...activeIntakeIssueState(),
          externalCommentFallbackRoutes: {
            "comment-node-1": {
              commentId: "comment-node-1",
              outcome: "append",
              targetRole: "dev",
              decidedAt: "2026-07-01T00:04:00.000Z",
            },
          },
        },
      },
      makeDependencies({ formatExternalCommentRoute }),
    );

    expect(outcome).toBe("no-trigger");
    expect(formatExternalCommentRoute).not.toHaveBeenCalled();
  });

  it("does not fallback-route idle comments or runner metadata comments", async () => {
    const dev = await makeAgentFile("dev", "Dev persona");
    const formatExternalCommentRoute = vi.fn<ProcessIssueSourceDependencies["formatExternalCommentRoute"]>(async () => ({
      action: "NO_ACTION",
      reason: "ceo-no-action",
    }));

    await expect(
      processIssueSource(
        {
          source,
          issue: makeIssue("initial", [{ id: "comment-node-1", body: "验收通过，请继续。" }], "OPEN", "2026-07-01T00:05:00Z"),
          agentFiles: [dev],
          intakeIssueState: { ...activeIntakeIssueState(), mode: "idle", nextPollAt: null },
        },
        makeDependencies({ formatExternalCommentRoute }),
      ),
    ).resolves.toBe("no-trigger");

    await expect(
      processIssueSource(
        {
          source,
          issue: makeIssue(
            "initial",
            [
              {
                id: "comment-node-2",
                body: "&lt;dev&gt;:\n我会继续。\n\n<!-- agent-moebius:role=dev -->",
              },
            ],
            "OPEN",
            "2026-07-01T00:06:00Z",
          ),
          agentFiles: [dev],
          intakeIssueState: activeIntakeIssueState(),
        },
        makeDependencies({ formatExternalCommentRoute }),
      ),
    ).resolves.toBe("no-trigger");

    await expect(
      processIssueSource(
        {
          source,
          issue: makeIssue(
            "initial",
            [
              {
                id: "comment-node-3",
                body: "Agent Moebius dead letter\n\n<!-- agent-moebius:dead-letter -->\n\n<!-- agent-moebius:ceo-reviewed action=not_applicable reason=dead-letter -->",
              },
            ],
            "OPEN",
            "2026-07-01T00:07:00Z",
          ),
          agentFiles: [dev],
          intakeIssueState: activeIntakeIssueState(),
        },
        makeDependencies({ formatExternalCommentRoute }),
      ),
    ).resolves.toBe("no-trigger");

    expect(formatExternalCommentRoute).not.toHaveBeenCalled();
  });

  it("bounds a never-settling fallback route call through timeout injection and suppresses the second pass by comment id", async () => {
    const dev = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const routeCalls: string[] = [];
    const timeoutMs = 5;
    const routeWithTimeout: ProcessIssueSourceDependencies["formatExternalCommentRoute"] = async (input) => {
      routeCalls.push(input.latestComment);
      await delay(timeoutMs);
      return { action: "FAIL_OPEN", reason: "codex-timeout" };
    };
    const issue = makeIssue(
      "initial",
      [{ id: "comment-node-1", body: "验收通过，请继续。" }],
      "OPEN",
      "2026-07-01T00:05:00Z",
    );

    const firstOutcome = await processIssueSource(
      {
        source,
        issue,
        agentFiles: [dev],
        intakeIssueState: activeIntakeIssueState(),
      },
      makeDependencies({ formatExternalCommentRoute: routeWithTimeout, postComment }),
    );

    expect(firstOutcome).toMatchObject({
      kind: "external-comment-fallback-route",
      result: "no-trigger",
      route: {
        commentId: "comment-node-1",
        outcome: "fail_open",
        reason: "codex-timeout",
      },
    });
    expect(postComment).not.toHaveBeenCalled();

    const secondOutcome = await processIssueSource(
      {
        source,
        issue,
        agentFiles: [dev],
        intakeIssueState: {
          ...activeIntakeIssueState(),
          externalCommentFallbackRoutes: {
            "comment-node-1": {
              commentId: "comment-node-1",
              outcome: "fail_open",
              decidedAt: "2026-07-01T00:05:01.000Z",
              reason: "codex-timeout",
            },
          },
        },
      },
      makeDependencies({ formatExternalCommentRoute: routeWithTimeout, postComment }),
    );

    expect(secondOutcome).toBe("no-trigger");
    expect(routeCalls).toEqual(["验收通过，请继续。"]);
  });
});

describe("processIssueSource CEO guardrail", () => {
  it("runs CEO guardrail for every Codex agent response", async () => {
    for (const role of ["dev", "dev-manager", "product-manager", "hermes-user", "secretary"]) {
      const agent = await makeAgentFile(role, `${role} persona`);
      const formatCeoComment = vi.fn(async (input: Parameters<ProcessIssueSourceDependencies["formatCeoComment"]>[0]) =>
        noChangeCeoResult(input.latestResponse),
      );

      await expect(
        processIssueSource(
          {
            source,
            issue: makeIssue(`@${role} please run`),
            agentFiles: [agent],
          },
          makeDependencies({ formatCeoComment }),
        ),
      ).resolves.toBe("triggered-success");

      expect(formatCeoComment).toHaveBeenCalledTimes(1);
      expect(formatCeoComment.mock.calls[0]?.[0]).toMatchObject({
        agent: role,
        issueContext: {
          issueUrl: "https://github.com/tranfu-labs/agent-moebius/issues/4",
          issueBody: `@${role} please run`,
          comments: [],
        },
      });
    }
  });

  it("passes full public issue context to CEO with comments in order", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const formatCeoComment = vi.fn(async (input: Parameters<ProcessIssueSourceDependencies["formatCeoComment"]>[0]) =>
      noChangeCeoResult(input.latestResponse),
    );
    const firstComment = "临时修改：本次不需要额外 token 统计";
    const secondComment = `&lt;reflector&gt;:
@dev 请针对「plan-written」做一次反思。

<!-- agent-moebius:role=reflector -->
<!-- agent-moebius:stage-hook source=dev stage=plan-written sourceIndex=1 -->`;
    const thirdComment = "@dev continue";

    await processIssueSource(
      {
        source,
        issue: makeIssue("全局流程：先采访再方案", [
          { body: firstComment },
          { body: secondComment },
          { body: thirdComment },
        ]),
        agentFiles: [agent],
      },
      makeDependencies({ formatCeoComment }),
    );

    expect(formatCeoComment.mock.calls[0]?.[0]).toMatchObject({
      issueContext: {
        issueUrl: "https://github.com/tranfu-labs/agent-moebius/issues/4",
        issueBody: "全局流程：先采访再方案",
        comments: [{ body: firstComment }, { body: secondComment }, { body: thirdComment }],
      },
    });
  });

  it("posts CEO repaired text with correction metadata after role metadata", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const repaired = `done
<!-- agent-moebius:stage=in-progress -->

${CEO_CORRECTED_METADATA}`;
    const postComment = vi.fn(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({
        postComment,
        formatCeoComment: async () => ({ action: "REPLACE", body: repaired, reason: "repaired" }),
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(postComment).toHaveBeenCalledWith(
      source,
      `&lt;dev&gt;:
done
<!-- agent-moebius:stage=in-progress -->

<!-- agent-moebius:role=dev -->

<!-- agent-moebius:ceo-reviewed action=replace -->

${CEO_CORRECTED_METADATA}`,
    );
  });

  it("posts CEO fail-open original text with review metadata and without correction metadata", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({
        postComment,
        formatCeoComment: async (input) => ({
          action: "FAIL_OPEN",
          body: input.latestResponse,
          reason: "invalid-json",
        }),
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(postComment.mock.calls[0]?.[1]).toContain(
      "<!-- agent-moebius:ceo-reviewed action=fail_open reason=invalid-json -->",
    );
    expect(postComment.mock.calls[0]?.[1]).not.toContain(CEO_CORRECTED_METADATA);
  });

  it("posts dev original + independent CEO comment when CEO returns APPEND as=ceo", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const ceoBody = `> CEO guardrail: 新建 change 分支属于 dev 自主裁决范围。

@dev 同意你提出的分支方案，请自行创建并继续推进。`;
    const postComment = vi.fn(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({
        postComment,
        formatCeoComment: async () => ({ action: "APPEND", body: ceoBody, as: "ceo", reason: "appended" }),
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(postComment).toHaveBeenCalledTimes(2);
    expect(postComment).toHaveBeenNthCalledWith(
      1,
      source,
      `&lt;dev&gt;:
done

<!-- agent-moebius:role=dev -->

<!-- agent-moebius:ceo-reviewed action=append_original -->`,
    );
    expect(postComment).toHaveBeenNthCalledWith(
      2,
      source,
      `&lt;ceo&gt;:
${ceoBody}

<!-- agent-moebius:role=ceo -->

<!-- agent-moebius:ceo-reviewed action=append_ceo -->

${CEO_CORRECTED_METADATA}`,
    );
  });

  it("impersonates dev and posts a second dev comment when CEO returns APPEND as=dev", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const ceoBody = `> CEO guardrail: 新建 change 分支属于 dev 自主裁决范围。

我按 change/foo 自行推进。

<!-- agent-moebius:stage=in-progress -->`;
    const postComment = vi.fn(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({
        postComment,
        formatCeoComment: async () => ({ action: "APPEND", body: ceoBody, as: "dev", reason: "appended" }),
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(postComment).toHaveBeenCalledTimes(2);
    expect(postComment).toHaveBeenNthCalledWith(
      1,
      source,
      `&lt;dev&gt;:
done

<!-- agent-moebius:role=dev -->

<!-- agent-moebius:ceo-reviewed action=append_original -->`,
    );
    expect(postComment).toHaveBeenNthCalledWith(
      2,
      source,
      `&lt;dev&gt;:
${ceoBody}

<!-- agent-moebius:role=dev -->

<!-- agent-moebius:ceo-reviewed action=append_ceo -->

${CEO_CORRECTED_METADATA}`,
    );
  });

  it("does not run CEO or post comments for stage-only agent comments", async () => {
    const dev = await makeAgentFile("dev", "Dev persona");
    const formatCeoComment = vi.fn(async (input: Parameters<ProcessIssueSourceDependencies["formatCeoComment"]>[0]) =>
      noChangeCeoResult(input.latestResponse),
    );
    const postComment = vi.fn(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("initial", [
          {
            body: "&lt;dev&gt;:\nplan\n<!-- agent-moebius:stage=plan-written -->\n\n<!-- agent-moebius:role=dev -->",
          },
        ]),
        agentFiles: [dev],
      },
      makeDependencies({ formatCeoComment, postComment }),
    );

    expect(outcome).toBe("no-trigger");
    expect(formatCeoComment).not.toHaveBeenCalled();
    expect(postComment).not.toHaveBeenCalled();
  });
});

async function expectNoReaction(input: {
  issue: GitHubIssue;
  agentFiles: Array<{ name: string; path: string }>;
  dependencies?: ProcessIssueSourceDependencies;
  expectedOutcome: "failed" | "no-trigger" | "triggered-success";
}): Promise<void> {
  const addReaction = vi.fn(async () => {});
  const runCodex = vi.fn(async (options: Parameters<ProcessIssueSourceDependencies["runCodex"]>[0]) =>
    successfulCodexRun(options.runDir),
  );
  const dependencies = {
    ...(input.dependencies ?? makeDependencies()),
    addReaction,
    runCodex,
  };

  const outcome = await processIssueSource(
    {
      source,
      issue: input.issue,
      agentFiles: input.agentFiles,
    },
    dependencies,
  );
  if (input.expectedOutcome === "failed") {
    expect(outcome).toMatchObject({ kind: "failed" });
  } else {
    expect(outcome).toBe(input.expectedOutcome);
  }
  expect(addReaction).not.toHaveBeenCalled();
  expect(runCodex).not.toHaveBeenCalled();
}

function makeDependencies(overrides: Partial<ProcessIssueSourceDependencies> = {}): ProcessIssueSourceDependencies {
  return {
    runIssueWorktreeCapability: async () => ({ ok: true }),
    runAgentPreScript: async () => ({ ok: true }),
    runCodex: async (options) => successfulCodexRun(options.runDir),
    addReaction: async () => {},
    createIssue: async () => ({ number: 101, url: "https://github.com/tranfu-labs/agent-moebius/issues/101" }),
    fetchIssueWithComments: async () => makeIssue("@dev please run"),
    findIssueByOrchestrationKey: async () => ({ kind: "none" }),
    postComment: async () => {},
    prepareIssueMedia: async () => ({ ok: true, prepared: [], imagePaths: [] }),
    discoverOutputArtifacts: async () => [],
    publishArtifacts: async (_source, files) =>
      files.map((file) => ({
        displayName: file.displayName,
        kind: file.kind,
        url: `https://example.test/${file.assetName}`,
    })),
    loadRoleThreadStateStore: async () => ({}),
    saveRoleThreadStateEntry: async () => {},
    loadCeoScripts: async () => [],
    loadGoalLedgerState: async () => ({
      schemaVersion: 1,
      goals: {},
      milestones: {},
      tasks: {},
      phases: {},
    }),
    saveGoalLedgerEntry: async () => {},
    formatCeoComment: async (input) => noChangeCeoResult(input.latestResponse),
    formatExternalCommentRoute: async () => ({ action: "NO_ACTION", reason: "ceo-no-action" }),
    writeRunManifest: async () => {},
    ...overrides,
  };
}

function ceoScriptsForRunner(): CeoScript[] {
  return [
    { id: "plan-review", action: "route", body: "plan review", fileName: "plan-review.md" },
    {
      id: "post-implementation-retro",
      action: "route",
      body: "retro",
      fileName: "post-implementation-retro.md",
    },
    {
      id: "milestone-spawn-child-issues",
      action: "spawn_child_issues",
      body: "spawn",
      fileName: "milestone-spawn-child-issues.md",
    },
  ];
}

function makeCeoSpawnFinalText(input: { title: string }): string {
  return `${JSON.stringify({
    action: "spawn_child_issues",
    workflowId: "milestone-spawn-child-issues",
    summary: "按当前阶段拆解完成。",
    groups: [{ id: "g1", reason: "同一 runner 模块，串行。" }],
    issues: [
      {
        ledgerTaskId: "task-1",
        groupId: "g1",
        title: input.title,
        description: "实现 CEO 编排路径。",
        initialRole: "dev",
        qualityBaseline: "data-correct",
        acceptanceStatements: ["跑 pnpm test → 应退出码 0"],
        dependencies: [],
        provenance: "来自当前阶段 projection",
      },
    ],
  })}

<!-- agent-moebius:stage=in-progress -->`;
}

function makeCeoLedgerState(input: { childIssueRefs?: GoalLedgerState["tasks"][string]["childIssueRefs"] } = {}): GoalLedgerState {
  const now = "2026-07-04T00:00:00.000Z";
  return {
    schemaVersion: 1,
    goals: {
      "goal-1": {
        id: "goal-1",
        title: "CEO 编排",
        status: "ready",
        scope: "CEO 编排路径",
        acceptanceStatements: ["跑 pnpm test → 应退出码 0"],
        dependencies: [],
        qualityBaseline: "data-correct",
        issueRefs: [{ owner: source.owner, repo: source.repo, number: source.issueNumber, relation: "source", status: "open" }],
        milestoneIds: [],
        provenance: [{ issue: { owner: source.owner, repo: source.repo, number: source.issueNumber }, messageIndex: 0, capturedAt: now }],
        missingFields: [],
        nextQuestions: [],
        createdAt: now,
        updatedAt: now,
      },
    },
    milestones: {},
    tasks: {
      "task-1": {
        id: "task-1",
        goalId: "goal-1",
        title: "T3 child",
        status: "ready",
        scope: "spawn",
        acceptanceStatements: ["跑 pnpm test → 应退出码 0"],
        dependencies: [],
        qualityBaseline: "data-correct",
        phaseIds: [],
        childIssueRefs: input.childIssueRefs ?? [],
        runManifestRefs: [],
        provenance: [{ issue: { owner: source.owner, repo: source.repo, number: source.issueNumber }, messageIndex: 0, capturedAt: now }],
        createdAt: now,
        updatedAt: now,
      },
    },
    phases: {
      "phase-1": {
        id: "phase-1",
        owner: { kind: "goal", id: "goal-1" },
        name: "orchestration",
        status: "active",
        qualityBaseline: "data-correct",
        objective: "拆解并创建子 issue",
        acceptanceStatements: ["跑 pnpm test → 应退出码 0"],
        dependencies: [],
        provenance: [{ issue: { owner: source.owner, repo: source.repo, number: source.issueNumber }, messageIndex: 0, capturedAt: now }],
      },
    },
  };
}

function makeIntegrationLedgerState(input: {
  task2Passed?: boolean;
  requested?: boolean;
  missingParent?: boolean;
} = {}): GoalLedgerState {
  const now = "2026-07-04T00:00:00.000Z";
  const parentIssueRef = { owner: source.owner, repo: source.repo, number: source.issueNumber, relation: "parent" as const, status: "open" as const };
  const requested = {
    joinKey: `agent-moebius-integration-acceptance-key:${"a".repeat(64)}`,
    phaseId: "phase-1",
    parentIssue: { owner: source.owner, repo: source.repo, number: source.issueNumber },
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
        issueRefs: input.missingParent ? [] : [{ owner: source.owner, repo: source.repo, number: source.issueNumber, relation: "source", status: "open" }],
        milestoneIds: [],
        provenance: [{ issue: { owner: source.owner, repo: source.repo, number: source.issueNumber }, messageIndex: 0, capturedAt: now }],
        missingFields: [],
        nextQuestions: [],
        createdAt: now,
        updatedAt: now,
      },
    },
    milestones: {},
    tasks: {
      "task-1": {
        id: "task-1",
        goalId: "goal-1",
        title: "child 1",
        status: "ready",
        scope: "child 1",
        acceptanceStatements: ["跑 child 1"],
        dependencies: [],
        qualityBaseline: "data-correct",
        phaseIds: [],
        ...(input.missingParent ? {} : { parentIssueRef }),
        childIssueRefs: [{ owner: source.owner, repo: source.repo, number: 101, relation: "child", status: "open" }],
        runManifestRefs: [],
        provenance: [{ issue: { owner: source.owner, repo: source.repo, number: source.issueNumber }, messageIndex: 0, capturedAt: now }],
        createdAt: now,
        updatedAt: now,
      },
      "task-2": {
        id: "task-2",
        goalId: "goal-1",
        title: "child 2",
        status: "ready",
        scope: "child 2",
        acceptanceStatements: ["跑 child 2"],
        dependencies: [],
        qualityBaseline: "data-correct",
        phaseIds: [],
        ...(input.missingParent ? {} : { parentIssueRef }),
        childIssueRefs: [{ owner: source.owner, repo: source.repo, number: 102, relation: "child", status: "open" }],
        acceptanceFacts: input.task2Passed
          ? [
              {
                factKey: `task-acceptance:${"d".repeat(64)}`,
                issue: { owner: source.owner, repo: source.repo, number: 102 },
                role: "product-manager",
                status: "passed",
                statementResults: [{ id: "1", status: "passed", statement: "跑 child 2" }],
                messageIndex: 1,
                commentId: "comment-102-pass",
                capturedAt: "2026-07-04T00:01:00.000Z",
              },
            ]
          : undefined,
        runManifestRefs: [],
        provenance: [{ issue: { owner: source.owner, repo: source.repo, number: source.issueNumber }, messageIndex: 0, capturedAt: now }],
        createdAt: now,
        updatedAt: now,
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
        provenance: [{ issue: { owner: source.owner, repo: source.repo, number: source.issueNumber }, messageIndex: 0, capturedAt: now }],
      },
    },
  };
}

function ledgerSaveMutator(ledger: GoalLedgerState): ProcessIssueSourceDependencies["saveGoalLedgerEntry"] {
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

function noChangeCeoResult(body: string): FormatCeoResult {
  return {
    action: "NO_CHANGE",
    body,
    reason: "ceo-no-change",
  };
}

function makeRunnerDependencies(
  input: Partial<RunnerDependencies> & {
    summaries?: Array<{ issueNumber: number; updatedAt: string }>;
  } = {},
): RunnerDependencies {
  const driverPool: DriverPool = {
    run: (job) => job(),
  };

  return {
    watchRepositories: [{ owner: source.owner, repo: source.repo }],
    driverPool,
    listAgentFiles: async () => [],
    listOpenIssueSummaries: async () => input.summaries ?? [],
    fetchIssueWithComments: async (issueSource) =>
      makeIssue(
        "@dev please run",
        [],
        "OPEN",
        input.summaries?.find((summary) => summary.issueNumber === issueSource.issueNumber)?.updatedAt ??
          "2026-07-01T00:00:00Z",
      ),
    processIssueSource: async () => "triggered-success",
    postComment: async () => {},
    saveGitHubResponseIntakeState: async () => {},
    ...input,
  };
}

function stateWithIdleScanDueIssues(sources: ReturnType<typeof makeIssueSource>[]): GitHubResponseIntakeState {
  return {
    repositories: {
      [`${source.owner}/${source.repo}`]: {
        lastIdleScanAt: "2026-07-01T00:00:00.000Z",
      },
    },
    issues: Object.fromEntries(
      sources.map((issueSource) => [
        issueSource.issueKey,
        {
          owner: issueSource.owner,
          repo: issueSource.repo,
          issueNumber: issueSource.issueNumber,
          updatedAt: "2026-07-01T00:00:00Z",
          mode: "idle" as const,
          activeNoChangeCount: 0,
          nextPollAt: null,
        },
      ]),
    ),
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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

function makeIssue(
  body: string,
  comments: Array<{ body: string; id?: string }> = [],
  state: GitHubIssue["state"] = "OPEN",
  updatedAt = "2026-07-01T00:00:00Z",
): GitHubIssue {
  return {
    body,
    comments: comments.map((comment, index) => ({
      id: comment.id ?? `comment-${index + 1}`,
      body: comment.body,
    })),
    updatedAt,
    state,
  };
}

function activeIntakeIssueState() {
  return {
    owner: source.owner,
    repo: source.repo,
    issueNumber: source.issueNumber,
    updatedAt: "2026-07-01T00:00:00Z",
    mode: "active" as const,
    activeNoChangeCount: 0,
    nextPollAt: "2026-07-01T00:01:00Z",
  };
}

async function makeAgentFile(name: string, markdown: string): Promise<{ name: string; path: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-runner-test-"));
  const filePath = path.join(dir, `${name}.md`);
  await fs.writeFile(filePath, markdown, "utf8");
  return { name, path: filePath };
}

function successfulCodexRun(runDir: string) {
  return successfulCodexRunWithFinalText(runDir, "done");
}

function successfulCodexRunWithFinalText(runDir: string, finalText: string) {
  return {
    ok: true as const,
    finalText,
    threadId: "thread-1",
    cachedInputTokens: null,
    runDir,
    stdoutPath: path.join(runDir, "stdout.jsonl"),
    stderrPath: path.join(runDir, "stderr.log"),
  };
}

function failedCodexRun(runDir: string, reason: string) {
  return {
    ok: false as const,
    reason,
    runDir,
    stdoutPath: path.join(runDir, "stdout.jsonl"),
    stderrPath: path.join(runDir, "stderr.log"),
  };
}
