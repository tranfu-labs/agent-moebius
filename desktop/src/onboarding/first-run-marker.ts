import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const ONBOARDING_COMPLETION_MARKER_FILE = ".onboarding-completed";

export interface OnboardingCompletionStatus {
  completed: boolean;
  completedAt: string | null;
}

export async function readOnboardingCompletion(
  dataRoot: string,
): Promise<OnboardingCompletionStatus> {
  try {
    const completedAt = (await fs.readFile(getOnboardingCompletionMarkerPath(dataRoot), "utf8")).trim();
    return isIsoTimestamp(completedAt)
      ? { completed: true, completedAt }
      : { completed: false, completedAt: null };
  } catch {
    return { completed: false, completedAt: null };
  }
}

export async function writeOnboardingCompletion(
  dataRoot: string,
  completedAt = new Date().toISOString(),
): Promise<OnboardingCompletionStatus> {
  if (!isIsoTimestamp(completedAt)) {
    throw new OnboardingCompletionMarkerError("引导完成时间无效。");
  }

  const markerPath = getOnboardingCompletionMarkerPath(dataRoot);
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  const temporaryPath = `${markerPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.writeFile(temporaryPath, `${completedAt}\n`, "utf8");
    await fs.rename(temporaryPath, markerPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
  return { completed: true, completedAt };
}

export function getOnboardingCompletionMarkerPath(dataRoot: string): string {
  return path.join(path.resolve(dataRoot), ONBOARDING_COMPLETION_MARKER_FILE);
}

function isIsoTimestamp(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

export class OnboardingCompletionMarkerError extends Error {
  readonly code = "ONBOARDING_COMPLETION_MARKER_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "OnboardingCompletionMarkerError";
  }
}
