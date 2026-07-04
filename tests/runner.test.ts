import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CODEX_DRIVER_POOL_MAX_CONCURRENT, CODEX_RUN_MAX_DURATION_MS } from "../src/config.js";
import { createDriverPool, type DriverPool } from "../src/driver-pool.js";
import { CEO_CORRECTED_METADATA, type FormatCeoResult } from "../src/format-ceo.js";
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
    const postComment = vi.fn(async () => {
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
  });

  it("publishes output artifacts before CEO sees the final response", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const formatCeoComment = vi.fn(async (input: Parameters<ProcessIssueSourceDependencies["formatCeoComment"]>[0]) =>
      noChangeCeoResult(input.latestResponse),
    );
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev generate an svg"),
        agentFiles: [agent],
      },
      makeDependencies({
        discoverOutputArtifacts: async () => [
          {
            filePath: "/tmp/run/output-artifacts/diagram.svg",
            assetName: "diagram.svg",
            displayName: "diagram.svg",
            kind: "image",
            byteLength: 11,
          },
        ],
        publishArtifacts: async () => [{ displayName: "diagram.svg", kind: "image", url: "https://example.test/diagram.svg" }],
        formatCeoComment,
        postComment,
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(formatCeoComment.mock.calls[0]?.[0].latestResponse).toContain(
      "![diagram.svg](https://example.test/diagram.svg)",
    );
    expect(postComment.mock.calls[0]?.[1]).toContain("![diagram.svg](https://example.test/diagram.svg)");
  });

  it("posts an artifact publishing error without saving role state", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn<ProcessIssueSourceDependencies["postComment"]>(async () => {});
    const saveRoleThreadStateEntry = vi.fn<ProcessIssueSourceDependencies["saveRoleThreadStateEntry"]>(async () => {});
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
        discoverOutputArtifacts: async () => [
          {
            filePath: "/tmp/run/output-artifacts/diagram.svg",
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
      }),
    );

    expect(outcome).toBe("triggered-success");
    expect(formatCeoComment).not.toHaveBeenCalled();
    expect(saveRoleThreadStateEntry).not.toHaveBeenCalled();
    expect(postComment.mock.calls[0]?.[1]).toContain("无法发布生成产物");
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
    const postComment = vi.fn(async () => {});
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

${CEO_CORRECTED_METADATA}`,
    );
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

<!-- agent-moebius:role=dev -->`,
    );
    expect(postComment).toHaveBeenNthCalledWith(
      2,
      source,
      `&lt;ceo&gt;:
${ceoBody}

<!-- agent-moebius:role=ceo -->

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

<!-- agent-moebius:role=dev -->`,
    );
    expect(postComment).toHaveBeenNthCalledWith(
      2,
      source,
      `&lt;dev&gt;:
${ceoBody}

<!-- agent-moebius:role=dev -->

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
    runAgentPreScript: async () => ({ ok: true }),
    runCodex: async (options) => successfulCodexRun(options.runDir),
    addReaction: async () => {},
    fetchIssueWithComments: async () => makeIssue("@dev please run"),
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
    formatCeoComment: async (input) => noChangeCeoResult(input.latestResponse),
    ...overrides,
  };
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

async function makeAgentFile(name: string, markdown: string): Promise<{ name: string; path: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-runner-test-"));
  const filePath = path.join(dir, `${name}.md`);
  await fs.writeFile(filePath, markdown, "utf8");
  return { name, path: filePath };
}

function successfulCodexRun(runDir: string) {
  return {
    ok: true as const,
    finalText: "done",
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
