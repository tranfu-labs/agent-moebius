import { describe, expect, it, vi } from "vitest";
import {
  addCodexExecutionReaction,
  resolveCodexExecutionReactionTarget,
} from "../src/runner/codex-execution-reaction.js";
import type { GitHubIssue } from "../src/github.js";
import { makeIssueSource } from "../src/issue-source.js";

const source = makeIssueSource({ owner: "tranfu-labs", repo: "moebius", issueNumber: 4 });

describe("codex execution reaction", () => {
  it("resolves the issue body as the issue reaction target", () => {
    const target = resolveCodexExecutionReactionTarget({
      source,
      issue: makeIssue("@dev please run"),
      latestIndex: 0,
    });

    expect(target).toMatchObject({
      targetSource: "issue-body",
      targetIndex: 0,
      target: { kind: "issue", source },
    });
  });

  it("resolves a timeline comment as an issue-comment reaction target", () => {
    const target = resolveCodexExecutionReactionTarget({
      source,
      issue: makeIssue("initial", [{ id: "comment-node-1", body: "@dev please run" }]),
      latestIndex: 1,
    });

    expect(target).toMatchObject({
      targetSource: "comment",
      targetIndex: 1,
      target: { kind: "issue-comment", source, commentId: "comment-node-1" },
    });
  });

  it("keeps reaction failures best-effort", async () => {
    const addReaction = vi.fn(async () => {
      throw new Error("reaction failed");
    });

    await expect(
      addCodexExecutionReaction({
        reaction: resolveCodexExecutionReactionTarget({
          source,
          issue: makeIssue("initial", [{ id: "comment-node-1", body: "@dev please run" }]),
          latestIndex: 1,
        }),
        agent: "dev",
        count: 2,
        addReaction,
      }),
    ).resolves.toBeUndefined();

    expect(addReaction).toHaveBeenCalledWith({ kind: "issue-comment", source, commentId: "comment-node-1" }, "eyes");
  });

  it("does not throw when a comment reaction target cannot be found", async () => {
    const addReaction = vi.fn(async () => {});

    await expect(
      addCodexExecutionReaction({
        reaction: resolveCodexExecutionReactionTarget({
          source,
          issue: makeIssue("initial", []),
          latestIndex: 1,
        }),
        agent: "dev",
        count: 2,
        addReaction,
      }),
    ).resolves.toBeUndefined();

    expect(addReaction).not.toHaveBeenCalled();
  });
});

function makeIssue(body: string, comments: Array<{ id: string; body: string }> = []): GitHubIssue {
  return {
    body,
    comments,
    updatedAt: "2026-07-01T00:00:00Z",
    state: "OPEN",
  };
}
