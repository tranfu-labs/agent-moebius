import { describe, expect, it } from "vitest";
import { extractFinalAssistant } from "../src/codex.js";

describe("extractFinalAssistant", () => {
  it("returns the final assistant text across supported event shapes", () => {
    const lines = [
      JSON.stringify({ type: "agent_message", message: "first" }),
      JSON.stringify({ type: "assistant_message", content: "second" }),
      JSON.stringify({ type: "message", role: "assistant", text: "third" }),
    ];

    expect(extractFinalAssistant(lines)).toBe("third");
  });

  it("skips invalid JSON lines", () => {
    const lines = [
      "not json",
      JSON.stringify({ type: "agent_message", message: "first" }),
      "{",
      JSON.stringify({ type: "assistant_message", text: "last" }),
    ];

    expect(extractFinalAssistant(lines)).toBe("last");
  });

  it("supports nested assistant message content arrays", () => {
    const lines = [
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "output_text", text: "hello" },
            { type: "output_text", text: " world" },
          ],
        },
      }),
    ];

    expect(extractFinalAssistant(lines)).toBe("hello world");
  });

  it("returns null when no assistant message is present", () => {
    const lines = [
      JSON.stringify({ type: "message", role: "user", content: "hello" }),
      JSON.stringify({ type: "event", text: "not an assistant message" }),
    ];

    expect(extractFinalAssistant(lines)).toBeNull();
  });
});
