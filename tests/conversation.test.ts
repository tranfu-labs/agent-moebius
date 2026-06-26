import { describe, expect, it } from "vitest";
import { buildPrompt, countMessages, shouldRespond } from "../src/conversation.js";

describe("conversation", () => {
  it("counts issue body plus comments", () => {
    expect(countMessages(0)).toBe(1);
    expect(countMessages(2)).toBe(3);
  });

  it("responds only to new odd counts", () => {
    expect(shouldRespond(1, 0)).toBe(true);
    expect(shouldRespond(3, 1)).toBe(true);
    expect(shouldRespond(3, 3)).toBe(false);
    expect(shouldRespond(2, 1)).toBe(false);
  });

  it("builds a prompt from agent markdown, issue body, and comments", () => {
    expect(buildPrompt("A", "B", [])).toBe("A\n\nB");
    expect(buildPrompt("A", "B", ["C", "D"])).toBe("A\n\nB\n\nC\n\nD");
  });
});
