import { describe, expect, it } from "vitest";
import { checkCodex } from "../src/env-doctor.js";
import type { CommandRunner } from "../src/shell-path.js";

describe("desktop env doctor", () => {
  it("checks only whether Codex can run", async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const runCommand: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      if (command === "codex" && args[0] === "--version") {
        return { exitCode: 0, stdout: "codex 1.0.0\n", stderr: "" };
      }
      throw new Error("unexpected command");
    };

    await expect(checkCodex({ runCommand })).resolves.toMatchObject({
      status: "ok",
      message: "已找到",
      detail: "codex 1.0.0",
    });
    expect(calls).toEqual([{ command: "codex", args: ["--version"] }]);
  });

  it("reports a missing or non-runnable Codex without probing another command", async () => {
    await expect(checkCodex({
      runCommand: async () => {
        throw new Error("ENOENT");
      },
    })).resolves.toMatchObject({
      status: "error",
      message: "Codex 未找到",
      detail: "ENOENT",
    });

    await expect(checkCodex({
      runCommand: async () => ({ exitCode: 1, stdout: "", stderr: "startup failed" }),
    })).resolves.toMatchObject({
      status: "error",
      message: "Codex 不可用",
      detail: "startup failed",
    });
  });
});
