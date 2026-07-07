import { describe, expect, it } from "vitest";
import { checkDesktopEnvironment, parseGhAuthAccount } from "../src/env-doctor.js";
import type { CommandRunner } from "../src/shell-path.js";

describe("desktop env doctor", () => {
  it("parses gh auth account names", () => {
    expect(parseGhAuthAccount("github.com\n  ✓ Logged in to github.com account aquarius-wing (/keychain)\n")).toBe(
      "aquarius-wing",
    );
    expect(parseGhAuthAccount("✓ Logged in to github.com as mona")).toBe("mona");
    expect(parseGhAuthAccount("not logged in")).toBeNull();
  });

  it("checks codex, gh, and gh auth", async () => {
    const runCommand: CommandRunner = async (command, args) => {
      if (command === "codex" && args[0] === "--version") {
        return { exitCode: 0, stdout: "codex 1.0.0\n", stderr: "" };
      }
      if (command === "gh" && args[0] === "--version") {
        return { exitCode: 0, stdout: "gh version 2.0.0\n", stderr: "" };
      }
      if (command === "gh" && args[0] === "auth") {
        return { exitCode: 0, stdout: "", stderr: "✓ Logged in to github.com account aquarius-wing\n" };
      }
      throw new Error("unexpected command");
    };

    await expect(checkDesktopEnvironment({ runCommand })).resolves.toMatchObject({
      codex: { status: "ok", message: "已找到" },
      gh: { status: "ok", message: "已找到" },
      ghAuth: { status: "ok", message: "已登录 (aquarius-wing)" },
    });
  });

  it("reports missing gh auth without blocking other checks", async () => {
    const runCommand: CommandRunner = async (command, args) => {
      if (command === "gh" && args[0] === "auth") {
        return { exitCode: 1, stdout: "", stderr: "not logged in" };
      }
      return { exitCode: 0, stdout: `${command} ok`, stderr: "" };
    };

    const result = await checkDesktopEnvironment({ runCommand });

    expect(result.codex.status).toBe("ok");
    expect(result.gh.status).toBe("ok");
    expect(result.ghAuth).toMatchObject({ status: "error", message: "未登录，请运行 gh auth login" });
  });
});
