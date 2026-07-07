import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergePathValues, resolveShellPath } from "../src/shell-path.js";

describe("desktop shell path", () => {
  it("does not change PATH outside macOS", async () => {
    await expect(resolveShellPath({ platform: "linux", currentPath: "/usr/bin" })).resolves.toEqual({
      path: "/usr/bin",
      source: "unchanged",
    });
  });

  it("merges login shell PATH before the current PATH on macOS", async () => {
    const result = await resolveShellPath({
      platform: "darwin",
      currentPath: ["/usr/bin", "/bin"].join(path.delimiter),
      shellPath: "/bin/zsh",
      runCommand: async () => ({
        exitCode: 0,
        stdout: ["/opt/homebrew/bin", "/usr/bin"].join(path.delimiter),
        stderr: "",
      }),
    });

    expect(result).toEqual({
      path: ["/opt/homebrew/bin", "/usr/bin", "/bin"].join(path.delimiter),
      source: "login-shell",
    });
  });

  it("falls back to the current PATH when login shell probing fails", async () => {
    await expect(
      resolveShellPath({
        platform: "darwin",
        currentPath: "/usr/bin",
        shellPath: "/bin/zsh",
        runCommand: async () => ({ exitCode: 1, stdout: "", stderr: "nope" }),
      }),
    ).resolves.toEqual({
      path: "/usr/bin",
      source: "fallback",
      error: "nope",
    });
  });

  it("deduplicates PATH entries", () => {
    expect(mergePathValues(["/a", "/b"].join(path.delimiter), ["/b", "/c"].join(path.delimiter))).toBe(
      ["/b", "/c", "/a"].join(path.delimiter),
    );
  });
});
