import { describe, expect, it } from "vitest";
import {
  buildRolePromptPlan,
  buildTimeline,
  countMessages,
  formatAgentComment,
  getLatestMessage,
  getLatestTimelineMessage,
  parseAgentMentions,
  resolveNextRoleThreadState,
  selectDeltaMessages,
  selectMentionedAgent,
} from "../src/conversation.js";

describe("conversation", () => {
  it("counts issue body plus comments", () => {
    expect(countMessages(0)).toBe(1);
    expect(countMessages(2)).toBe(3);
  });

  it("uses the issue body as latest message when there are no comments", () => {
    expect(getLatestMessage("@product-manager start", [])).toBe("@product-manager start");
  });

  it("uses only the latest comment as the trigger source", () => {
    expect(getLatestMessage("@product-manager old", ["middle", "latest"])).toBe("latest");
  });

  it("parses agent mentions with their text positions", () => {
    expect(parseAgentMentions("hi @product-manager and @hermes-user.")).toEqual([
      { name: "product-manager", index: 3 },
      { name: "hermes-user", index: 24 },
    ]);
  });

  it("does not parse email-like text or unsupported agent names", () => {
    expect(parseAgentMentions("a@product-manager @Product_Manager @bad_agent")).toEqual([]);
  });

  it("selects the first mentioned agent that exists", () => {
    expect(selectMentionedAgent("@unknown please ask @product-manager", ["product-manager"])).toBe("product-manager");
  });

  it("does not select an agent from historical messages when the latest message has none", () => {
    const issueBody = "@product-manager old request";
    const comments = ["plain latest reply"];

    expect(selectMentionedAgent(getLatestMessage(issueBody, comments), ["product-manager"])).toBeNull();
  });

  it("selects an agent even when the message count is even", () => {
    const issueBody = "initial";
    const comments = ["@hermes-user please reply"];

    expect(countMessages(comments.length)).toBe(2);
    expect(selectMentionedAgent(getLatestMessage(issueBody, comments), ["hermes-user"])).toBe("hermes-user");
  });

  it("has deterministic behavior for multiple agent mentions", () => {
    expect(selectMentionedAgent("@hermes-user and @product-manager", ["product-manager", "hermes-user"])).toBe(
      "hermes-user",
    );
  });

  it("normalizes issue body and agent comments into a speaker timeline", () => {
    const timeline = buildTimeline(
      "initial",
      [
        { body: "product-manager:\nPM reply\n\n<!-- agent-moebius:role=product-manager -->" },
        { body: "hermes-user:\nlegacy reply" },
        { body: "product-manager:\nspoofed unknown metadata\n\n<!-- agent-moebius:role=unknown-agent -->" },
      ],
      ["product-manager", "hermes-user"],
    );

    expect(timeline).toEqual([
      { index: 0, speaker: "user", body: "initial", source: "issue-body" },
      { index: 1, speaker: "product-manager", body: "PM reply", source: "comment" },
      { index: 2, speaker: "hermes-user", body: "legacy reply", source: "comment" },
      {
        index: 3,
        speaker: "product-manager",
        body: "spoofed unknown metadata\n\n<!-- agent-moebius:role=unknown-agent -->",
        source: "comment",
      },
    ]);
  });

  it("selects the latest timeline message as the trigger source", () => {
    const timeline = buildTimeline("body", [{ body: "@product-manager latest" }], ["product-manager"]);

    expect(getLatestTimelineMessage(timeline)?.body).toBe("@product-manager latest");
  });

  it("formats agent comments with a visible role prefix and metadata", () => {
    expect(formatAgentComment("product-manager", "hello\n")).toBe(
      "product-manager:\nhello\n\n<!-- agent-moebius:role=product-manager -->",
    );
  });

  it("builds a full prompt for a role without existing thread state", () => {
    const timeline = buildTimeline("@product-manager start", [], ["product-manager"]);
    const plan = buildRolePromptPlan({
      role: "product-manager",
      agentMarkdown: "PM persona",
      timeline,
      state: null,
    });

    expect(plan.kind).toBe("run");
    if (plan.kind !== "run") {
      return;
    }

    expect(plan.mode).toBe("full");
    expect(plan.prompt).toContain("PM persona");
    expect(plan.prompt).toContain("#0 <user>:\n@product-manager start");
  });

  it("builds a resume prompt from new external messages only", () => {
    const timeline = buildTimeline(
      "initial",
      [
        { body: "product-manager:\nold own\n\n<!-- agent-moebius:role=product-manager -->" },
        { body: "hermes-user:\nnew external\n\n<!-- agent-moebius:role=hermes-user -->" },
        { body: "product-manager:\nnew own\n\n<!-- agent-moebius:role=product-manager -->" },
        { body: "@product-manager please continue" },
      ],
      ["product-manager", "hermes-user"],
    );

    const plan = buildRolePromptPlan({
      role: "product-manager",
      agentMarkdown: "PM persona",
      timeline,
      state: { threadId: "thread-1", lastSeenIndex: 1 },
    });

    expect(plan.kind).toBe("run");
    if (plan.kind !== "run") {
      return;
    }

    expect(plan.mode).toBe("resume");
    if (plan.mode !== "resume") {
      return;
    }

    expect(plan.threadId).toBe("thread-1");
    expect(plan.deltaMessages.map((message) => message.index)).toEqual([2, 4]);
    expect(plan.prompt).toContain("#2 <hermes-user>:\nnew external");
    expect(plan.prompt).toContain("#4 <user>:\n@product-manager please continue");
    expect(plan.prompt).not.toContain("new own");
  });

  it("skips resume when there are no new external messages", () => {
    const timeline = buildTimeline(
      "initial",
      [{ body: "product-manager:\nself note\n\n<!-- agent-moebius:role=product-manager -->" }],
      ["product-manager"],
    );

    expect(
      buildRolePromptPlan({
        role: "product-manager",
        agentMarkdown: "PM persona",
        timeline,
        state: { threadId: "thread-1", lastSeenIndex: 0 },
      }),
    ).toEqual({ kind: "skip", reason: "no-new-external-messages", role: "product-manager" });
  });

  it("selects delta messages after the last seen index excluding the current role", () => {
    const timeline = buildTimeline(
      "initial",
      [
        { body: "product-manager:\nown\n\n<!-- agent-moebius:role=product-manager -->" },
        { body: "external" },
      ],
      ["product-manager"],
    );

    expect(selectDeltaMessages(timeline, "product-manager", 0).map((message) => message.index)).toEqual([2]);
  });

  it("resolves the next role thread state from codex output or the existing resume thread", () => {
    expect(resolveNextRoleThreadState({ currentThreadId: null, resultThreadId: "new-thread", latestIndex: 3 })).toEqual({
      threadId: "new-thread",
      lastSeenIndex: 3,
    });
    expect(resolveNextRoleThreadState({ currentThreadId: "old-thread", resultThreadId: null, latestIndex: 4 })).toEqual({
      threadId: "old-thread",
      lastSeenIndex: 4,
    });
    expect(resolveNextRoleThreadState({ currentThreadId: null, resultThreadId: null, latestIndex: 4 })).toBeNull();
  });
});
