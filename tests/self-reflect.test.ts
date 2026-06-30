import { describe, expect, it } from "vitest";
import type { TimelineMessage } from "../src/conversation.js";
import { appendPostedComment, decideNextSelfReflectStep } from "../src/triggers/self-reflect.js";
import type { TriggerResult } from "../src/triggers/types.js";

const baseTimeline: TimelineMessage[] = [
  { index: 0, speaker: "user", body: "@dev 你看下", source: "issue-body" },
  { index: 1, speaker: "user", body: "再加一句", source: "comment" },
];

describe("appendPostedComment", () => {
  it("appends a message with role as speaker and index = length", () => {
    const next = appendPostedComment(baseTimeline, "dev", "&lt;dev&gt;:\n方案\n<!-- agent-moebius:role=dev -->");

    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({
      index: 2,
      speaker: "dev",
      body: "&lt;dev&gt;:\n方案\n<!-- agent-moebius:role=dev -->",
      source: "comment",
    });
  });

  it("does not mutate the input timeline", () => {
    const original = [...baseTimeline];
    appendPostedComment(baseTimeline, "dev", "body");

    expect(baseTimeline).toEqual(original);
    expect(baseTimeline).toHaveLength(2);
  });
});

describe("decideNextSelfReflectStep", () => {
  const postComment: TriggerResult = {
    kind: "post-comment",
    role: "reflector",
    body: "hook",
    reason: "reflector-stage",
    sourceRole: "dev",
    sourceIndex: 1,
    stage: "plan-written",
  };
  const runAgent: TriggerResult = { kind: "run-agent", role: "product-manager", reason: "mention" };
  const skip: TriggerResult = { kind: "skip", reason: "no-trigger" };

  it("continues on post-comment when below the iteration cap", () => {
    expect(decideNextSelfReflectStep(postComment, 1, 3)).toEqual({
      kind: "continue-hook",
      reason: "stage-hook",
    });
  });

  it("stops on post-comment when iteration exceeds the cap", () => {
    expect(decideNextSelfReflectStep(postComment, 4, 3)).toEqual({
      kind: "stop",
      reason: "max-iterations",
    });
  });

  it("stops on run-agent — mentions are not self-reflected in the same tick", () => {
    expect(decideNextSelfReflectStep(runAgent, 1, 3)).toEqual({
      kind: "stop",
      reason: "mention-not-self-reflected",
    });
  });

  it("stops on skip", () => {
    expect(decideNextSelfReflectStep(skip, 1, 3)).toEqual({
      kind: "stop",
      reason: "trigger-skip",
    });
  });
});
