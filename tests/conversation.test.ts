import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  countMessages,
  getLatestMessage,
  parseAgentMentions,
  selectMentionedAgent,
} from "../src/conversation.js";

describe("conversation", () => {
  it("counts issue body plus comments", () => {
    expect(countMessages(0)).toBe(1);
    expect(countMessages(2)).toBe(3);
  });

  it("builds a prompt from agent markdown, issue body, and comments", () => {
    expect(buildPrompt("A", "B", [])).toBe("A\n\nB");
    expect(buildPrompt("A", "B", ["C", "D"])).toBe("A\n\nB\n\nC\n\nD");
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
});
