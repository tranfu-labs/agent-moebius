import fs from "node:fs/promises";
import path from "node:path";
import { STATE_FILE } from "./config.js";

export interface RunnerState {
  maxRespondedCount: number;
}

export const DEFAULT_STATE: RunnerState = {
  maxRespondedCount: 0,
};

export async function read(filePath = STATE_FILE): Promise<RunnerState> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (!isRunnerState(parsed)) {
      throw new Error(`Invalid state file shape at ${filePath}`);
    }

    return parsed;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { ...DEFAULT_STATE };
    }

    throw error;
  }
}

export async function write(state: RunnerState, filePath = STATE_FILE): Promise<void> {
  if (!isRunnerState(state)) {
    throw new Error("Invalid runner state");
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(state)}\n`, "utf8");
  await fs.rename(tempFile, filePath);
}

function isRunnerState(value: unknown): value is RunnerState {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.maxRespondedCount) &&
    typeof record.maxRespondedCount === "number" &&
    record.maxRespondedCount >= 0
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
