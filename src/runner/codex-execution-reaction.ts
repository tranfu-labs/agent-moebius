import { log } from "../log.js";
import type { GitHubIssue, IssueReactionContent, ReactionTarget } from "../github.js";
import type { IssueSource } from "../issue-source.js";
import { formatError } from "./runtime-contracts.js";

export type CodexExecutionReactionTarget = {
  source: IssueSource;
  targetSource: "issue-body" | "comment";
  targetIndex: number;
} & (
  | {
      target: ReactionTarget;
      unavailableReason?: never;
    }
  | {
      target: null;
      unavailableReason: string;
    }
);

export async function addCodexExecutionReaction(input: {
  reaction: CodexExecutionReactionTarget;
  agent: string;
  count: number;
  addReaction: (target: ReactionTarget, content: IssueReactionContent) => Promise<void>;
}): Promise<void> {
  try {
    if (input.reaction.target === null) {
      throw new Error(input.reaction.unavailableReason);
    }

    await input.addReaction(input.reaction.target, "eyes");
    log({
      event: "codex-execution-reaction-added",
      count: input.count,
      agent: input.agent,
      issueKey: input.reaction.source.issueKey,
      targetSource: input.reaction.targetSource,
      targetIndex: input.reaction.targetIndex,
    });
  } catch (error) {
    log({
      event: "codex-execution-reaction-failed",
      count: input.count,
      agent: input.agent,
      issueKey: input.reaction.source.issueKey,
      targetSource: input.reaction.targetSource,
      targetIndex: input.reaction.targetIndex,
      error: formatError(error),
    });
  }
}

export function resolveCodexExecutionReactionTarget(input: {
  source: IssueSource;
  issue: GitHubIssue;
  latestIndex: number;
}): CodexExecutionReactionTarget {
  if (input.latestIndex === 0) {
    return {
      source: input.source,
      targetSource: "issue-body",
      targetIndex: input.latestIndex,
      target: { kind: "issue", source: input.source },
    };
  }

  const comment = input.issue.comments[input.latestIndex - 1];
  if (comment === undefined) {
    return {
      source: input.source,
      targetSource: "comment",
      targetIndex: input.latestIndex,
      target: null,
      unavailableReason: `missing comment for timeline index ${String(input.latestIndex)}`,
    };
  }

  return {
    source: input.source,
    targetSource: "comment",
    targetIndex: input.latestIndex,
    target: {
      kind: "issue-comment",
      source: input.source,
      commentId: comment.id,
    },
  };
}
