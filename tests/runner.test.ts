import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { pollActiveIssue, processIssueSource, type ProcessIssueSourceDependencies } from "../src/runner.js";
import type { GitHubResponseIntakeState } from "../src/github-response-intake.js";
import type { GitHubIssue } from "../src/github.js";
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
});

describe("processIssueSource Codex execution reaction", () => {
  it("adds an eyes reaction before running Codex on the real Codex driver path", async () => {
    const calls: string[] = [];
    const agent = await makeAgentFile("dev", "Dev persona");
    const addIssueReaction = vi.fn(async () => {
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
      makeDependencies({ addIssueReaction, runCodex, postComment }),
    );

    expect(outcome).toBe("triggered-success");
    expect(calls.slice(0, 2)).toEqual(["reaction", "codex"]);
    expect(addIssueReaction).toHaveBeenCalledWith(source, "eyes");
    expect(runCodex).toHaveBeenCalledTimes(1);
    expect(postComment).toHaveBeenCalledTimes(1);
  });

  it("continues running Codex when adding the reaction fails", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const addIssueReaction = vi.fn(async () => {
      throw new Error("reaction failed");
    });
    const runCodex = vi.fn(async (options: Parameters<ProcessIssueSourceDependencies["runCodex"]>[0]) =>
      successfulCodexRun(options.runDir),
    );

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({ addIssueReaction, runCodex }),
    );

    expect(outcome).toBe("triggered-success");
    expect(addIssueReaction).toHaveBeenCalledWith(source, "eyes");
    expect(runCodex).toHaveBeenCalledTimes(1);
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
    const reflector = await makeAgentFile("reflector", "Reflector persona");

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
      agentFiles: [dev, reflector],
      expectedOutcome: "triggered-success",
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

async function expectNoReaction(input: {
  issue: GitHubIssue;
  agentFiles: Array<{ name: string; path: string }>;
  dependencies?: ProcessIssueSourceDependencies;
  expectedOutcome: "failed" | "no-trigger" | "triggered-success";
}): Promise<void> {
  const addIssueReaction = vi.fn(async () => {});
  const runCodex = vi.fn(async (options: Parameters<ProcessIssueSourceDependencies["runCodex"]>[0]) =>
    successfulCodexRun(options.runDir),
  );
  const dependencies = {
    ...(input.dependencies ?? makeDependencies()),
    addIssueReaction,
    runCodex,
  };

  await expect(
    processIssueSource(
      {
        source,
        issue: input.issue,
        agentFiles: input.agentFiles,
      },
      dependencies,
    ),
  ).resolves.toBe(input.expectedOutcome);
  expect(addIssueReaction).not.toHaveBeenCalled();
  expect(runCodex).not.toHaveBeenCalled();
}

function makeDependencies(overrides: Partial<ProcessIssueSourceDependencies> = {}): ProcessIssueSourceDependencies {
  return {
    runAgentPreScript: async () => ({ ok: true }),
    runCodex: async (options) => successfulCodexRun(options.runDir),
    addIssueReaction: async () => {},
    postComment: async () => {},
    loadRoleThreadStateStore: async () => ({}),
    saveRoleThreadStateStore: async () => {},
    ...overrides,
  };
}

function makeIssue(body: string, comments: GitHubIssue["comments"] = [], state: GitHubIssue["state"] = "OPEN"): GitHubIssue {
  return {
    body,
    comments,
    updatedAt: "2026-07-01T00:00:00Z",
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
