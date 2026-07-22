import { describe, expect, it } from "vitest";

import { deriveSessionTitle } from "../src/local-console/title.js";

describe("deriveSessionTitle", () => {
  it("uses the normalized first line", () => {
    expect(deriveSessionTitle("  帮我   完成\t登录页  ")).toBe("帮我 完成 登录页");
    expect(deriveSessionTitle("第一行标题\n第二行不属于标题")).toBe("第一行标题");
  });

  it("truncates by display width instead of UTF-16 length", () => {
    expect(deriveSessionTitle("中".repeat(20))).toBe(`${"中".repeat(15)}…`);
    expect(deriveSessionTitle("a".repeat(40))).toBe(`${"a".repeat(31)}…`);
  });

  it("uses the fallback for whitespace-only and symbol-only input", () => {
    expect(deriveSessionTitle("   \t  ")).toBe("新会话");
    expect(deriveSessionTitle("！？…---")).toBe("新会话");
  });

  it("does not include a later non-empty line when the first line is empty", () => {
    expect(deriveSessionTitle("\n这是第二行")).toBe("新会话");
  });
});
