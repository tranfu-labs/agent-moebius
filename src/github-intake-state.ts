import fs from "node:fs/promises";
import path from "node:path";
import { GITHUB_RESPONSE_INTAKE_STATE_PATH } from "./config.js";
import type { GitHubResponseIntakeState, IntakeIssueState, IntakeRepositoryState } from "./github-response-intake.js";

export async function loadGitHubResponseIntakeState(
  filePath = GITHUB_RESPONSE_INTAKE_STATE_PATH,
): Promise<GitHubResponseIntakeState> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { repositories: {}, issues: {} };
    }

    throw error;
  }

  const parsed: unknown = JSON.parse(raw);
  if (!isGitHubResponseIntakeState(parsed)) {
    throw new Error(`Invalid GitHub response intake state file: ${filePath}`);
  }

  return parsed;
}

export async function saveGitHubResponseIntakeState(
  state: GitHubResponseIntakeState,
  filePath = GITHUB_RESPONSE_INTAKE_STATE_PATH,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

function isGitHubResponseIntakeState(value: unknown): value is GitHubResponseIntakeState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const state = value as Partial<GitHubResponseIntakeState>;
  return isRecord(state.repositories, isIntakeRepositoryState) && isRecord(state.issues, isIntakeIssueState);
}

function isIntakeRepositoryState(value: unknown): value is IntakeRepositoryState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const state = value as Partial<IntakeRepositoryState>;
  return typeof state.lastIdleScanAt === "string" && state.lastIdleScanAt.length > 0;
}

function isIntakeIssueState(value: unknown): value is IntakeIssueState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const state = value as Partial<IntakeIssueState>;
  return (
    typeof state.owner === "string" &&
    state.owner.length > 0 &&
    typeof state.repo === "string" &&
    state.repo.length > 0 &&
    Number.isInteger(state.issueNumber) &&
    state.issueNumber !== undefined &&
    state.issueNumber > 0 &&
    typeof state.updatedAt === "string" &&
    state.updatedAt.length > 0 &&
    (state.mode === "idle" || state.mode === "active") &&
    Number.isInteger(state.activeNoChangeCount) &&
    state.activeNoChangeCount !== undefined &&
    state.activeNoChangeCount >= 0 &&
    (state.nextPollAt === null || (typeof state.nextPollAt === "string" && state.nextPollAt.length > 0))
  );
}

function isRecord<T>(value: unknown, isValue: (item: unknown) => item is T): value is Record<string, T> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isValue);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
