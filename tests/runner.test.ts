import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CEO_CORRECTED_METADATA, type FormatCeoResult } from "../src/format-ceo.js";
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

  it("does not post a stale Codex result when a new comment arrives before posting", async () => {
    const agent = await makeAgentFile("dev", "Dev persona");
    const postComment = vi.fn(async () => {});
    const saveRoleThreadStateStore = vi.fn(async () => {});

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("@dev please run"),
        agentFiles: [agent],
      },
      makeDependencies({
        fetchIssueWithComments: async () => makeIssue("@dev please run", [{ body: "new comment" }]),
        postComment,
        saveRoleThreadStateStore,
      }),
    );

    expect(outcome).toBe("interrupted");
    expect(postComment).not.toHaveBeenCalled();
    expect(saveRoleThreadStateStore).not.toHaveBeenCalled();
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

describe("processIssueSource CEO guardrail", () => {
  it("runs CEO guardrail for every Codex agent response", async () => {
    for (const role of ["dev", "product-manager", "hermes-user"]) {
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
        originalRequest: `@${role} please run`,
        lastReflectorHook: null,
      });
    }
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

  it("passes the latest reflector hook body to CEO", async () => {
    const dev = await makeAgentFile("dev", "Dev persona");
    const reflector = await makeAgentFile("reflector", "Reflector persona");
    const formatCeoComment = vi.fn(async (input: Parameters<ProcessIssueSourceDependencies["formatCeoComment"]>[0]) =>
      noChangeCeoResult(input.latestResponse),
    );
    const hook = `&lt;reflector&gt;:
@dev 请针对「plan-written」做一次反思。

<!-- agent-moebius:role=reflector -->
<!-- agent-moebius:stage-hook source=dev stage=plan-written sourceIndex=1 -->`;

    await processIssueSource(
      {
        source,
        issue: makeIssue("initial", [{ body: hook }, { body: "@dev continue" }]),
        agentFiles: [dev, reflector],
      },
      makeDependencies({ formatCeoComment }),
    );

    expect(formatCeoComment.mock.calls[0]?.[0].lastReflectorHook).toContain("stage-hook source=dev");
  });

  it("does not run CEO for deterministic reflector hook comments", async () => {
    const dev = await makeAgentFile("dev", "Dev persona");
    const reflector = await makeAgentFile("reflector", "Reflector persona");
    const formatCeoComment = vi.fn(async (input: Parameters<ProcessIssueSourceDependencies["formatCeoComment"]>[0]) =>
      noChangeCeoResult(input.latestResponse),
    );

    const outcome = await processIssueSource(
      {
        source,
        issue: makeIssue("initial", [
          {
            body: "&lt;dev&gt;:\nplan\n<!-- agent-moebius:stage=plan-written -->\n\n<!-- agent-moebius:role=dev -->",
          },
        ]),
        agentFiles: [dev, reflector],
      },
      makeDependencies({ formatCeoComment }),
    );

    expect(outcome).toBe("triggered-success");
    expect(formatCeoComment).not.toHaveBeenCalled();
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
    fetchIssueWithComments: async () => makeIssue("@dev please run"),
    postComment: async () => {},
    loadRoleThreadStateStore: async () => ({}),
    saveRoleThreadStateStore: async () => {},
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
