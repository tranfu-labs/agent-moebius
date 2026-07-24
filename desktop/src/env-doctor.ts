import type { CommandRunner } from "./shell-path.js";
import { runCommand } from "./shell-path.js";

export type DoctorStatus = "ok" | "error";

export interface DoctorCheck {
  status: DoctorStatus;
  message: string;
  detail?: string;
}

export async function checkCodex(input: {
  runCommand?: CommandRunner;
} = {}): Promise<DoctorCheck> {
  const run = input.runCommand ?? runCommand;
  try {
    const result = await run("codex", ["--version"]);
    if (result.exitCode === 0) {
      return { status: "ok", message: "已找到", detail: firstLine(result.stdout) };
    }
    return {
      status: "error",
      message: "Codex 不可用",
      detail: firstLine(result.stderr || result.stdout),
    };
  } catch (error) {
    return { status: "error", message: "Codex 未找到", detail: formatError(error) };
  }
}

function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/u).map((part) => part.trim()).find((part) => part.length > 0);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
