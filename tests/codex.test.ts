import { describe, expect, it } from "vitest";
import { buildCodexArgs, extractCodexOutput, extractFinalAssistant } from "../src/codex.js";

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

  it("supports codex item.completed agent message events", () => {
    const lines = [
      JSON.stringify({ type: "thread.started", thread_id: "thread" }),
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "item_0",
          type: "agent_message",
          text: "final from codex",
        },
      }),
    ];

    expect(extractFinalAssistant(lines)).toBe("final from codex");
  });

  it("extracts thread id and cached input tokens from codex jsonl", () => {
    const lines = [
      JSON.stringify({ type: "thread.started", thread_id: "thread-123" }),
      JSON.stringify({
        type: "turn.completed",
        usage: {
          cached_input_tokens: 42,
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "agent_message",
          text: "final",
        },
      }),
    ];

    expect(extractCodexOutput(lines)).toEqual({
      finalText: "final",
      threadId: "thread-123",
      cachedInputTokens: 42,
    });
  });

  it("builds full and resume codex args without ephemeral mode", () => {
    expect(buildCodexArgs("hello")).toEqual(
      expect.arrayContaining(["exec", "--json", "-m", "gpt-5.5", "hello"]),
    );
    expect(buildCodexArgs("hello")).not.toContain("--ephemeral");

    expect(buildCodexArgs("delta", { kind: "resume", threadId: "thread-1" })).toEqual(
      expect.arrayContaining(["exec", "resume", "--json", "thread-1", "delta"]),
    );
    expect(buildCodexArgs("delta", { kind: "resume", threadId: "thread-1" })).not.toContain("--ephemeral");
  });

  it("returns null when no assistant message is present", () => {
    const lines = [
      JSON.stringify({ type: "message", role: "user", content: "hello" }),
      JSON.stringify({ type: "event", text: "not an assistant message" }),
    ];

    expect(extractFinalAssistant(lines)).toBeNull();
  });
});
