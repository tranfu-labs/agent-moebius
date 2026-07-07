import type { CommandRunner } from "./shell-path.js";
import { runCommand } from "./shell-path.js";

export type DoctorStatus = "ok" | "error";

export interface DoctorCheck {
  status: DoctorStatus;
  message: string;
  detail?: string;
}

export interface DesktopDoctorResult {
  codex: DoctorCheck;
  gh: DoctorCheck;
  ghAuth: DoctorCheck;
}

export async function checkDesktopEnvironment(input: {
  runCommand?: CommandRunner;
} = {}): Promise<DesktopDoctorResult> {
  const run = input.runCommand ?? runCommand;
  const codex = await checkExecutable(run, "codex", ["--version"], "codex CLI");
  const gh = await checkExecutable(run, "gh", ["--version"], "gh CLI");
  const ghAuth = gh.status === "ok" ? await checkGhAuth(run) : { status: "error" as const, message: "gh CLI 未找到" };

  return { codex, gh, ghAuth };
}

export function parseGhAuthAccount(output: string): string | null {
  const accountMatch = output.match(/account\s+([^\s()]+)/i);
  if (accountMatch?.[1] !== undefined) {
    return accountMatch[1];
  }

  const asMatch = output.match(/Logged in to [^\s]+ as ([^\s]+)/i);
  return asMatch?.[1] ?? null;
}

async function checkExecutable(
  run: CommandRunner,
  command: string,
  args: readonly string[],
  label: string,
): Promise<DoctorCheck> {
  try {
    const result = await run(command, args);
    if (result.exitCode === 0) {
      return { status: "ok", message: "已找到", detail: firstLine(result.stdout) };
    }
    return { status: "error", message: `${label} 不可用`, detail: firstLine(result.stderr || result.stdout) };
  } catch (error) {
    return { status: "error", message: `${label} 未找到`, detail: formatError(error) };
  }
}

async function checkGhAuth(run: CommandRunner): Promise<DoctorCheck> {
  try {
    const result = await run("gh", ["auth", "status"]);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0) {
      const account = parseGhAuthAccount(output);
      return { status: "ok", message: account === null ? "已登录" : `已登录 (${account})`, detail: firstLine(output) };
    }
    return { status: "error", message: "未登录，请运行 gh auth login", detail: firstLine(output) };
  } catch (error) {
    return { status: "error", message: "gh 登录态检测失败", detail: formatError(error) };
  }
}

function firstLine(value: string): string | undefined {
  const line = value.split(/\r?\n/).map((part) => part.trim()).find((part) => part.length > 0);
  return line;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
