import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  getOnboardingCompletionMarkerPath,
  readOnboardingCompletion,
  writeOnboardingCompletion,
} from "../src/onboarding/first-run-marker.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })));
});

describe("onboarding completion marker", () => {
  it("treats a missing, unreadable, or damaged marker as incomplete", async () => {
    const dataRoot = await makeDataRoot();
    await expect(readOnboardingCompletion(dataRoot)).resolves.toEqual({
      completed: false,
      completedAt: null,
    });

    await fs.writeFile(getOnboardingCompletionMarkerPath(dataRoot), "not-a-time\n", "utf8");
    await expect(readOnboardingCompletion(dataRoot)).resolves.toEqual({
      completed: false,
      completedAt: null,
    });

    await fs.rm(getOnboardingCompletionMarkerPath(dataRoot));
    await fs.mkdir(getOnboardingCompletionMarkerPath(dataRoot));
    await expect(readOnboardingCompletion(dataRoot)).resolves.toEqual({
      completed: false,
      completedAt: null,
    });
  });

  it("atomically writes an ISO completion time and supports deletion to rerun onboarding", async () => {
    const dataRoot = await makeDataRoot();
    const completedAt = "2026-07-24T03:04:05.000Z";

    await expect(writeOnboardingCompletion(dataRoot, completedAt)).resolves.toEqual({
      completed: true,
      completedAt,
    });
    await expect(readOnboardingCompletion(dataRoot)).resolves.toEqual({
      completed: true,
      completedAt,
    });
    expect(await fs.readFile(getOnboardingCompletionMarkerPath(dataRoot), "utf8")).toBe(`${completedAt}\n`);

    await fs.rm(getOnboardingCompletionMarkerPath(dataRoot));
    await expect(readOnboardingCompletion(dataRoot)).resolves.toEqual({
      completed: false,
      completedAt: null,
    });
  });

  it("rejects a non-ISO completion time", async () => {
    const dataRoot = await makeDataRoot();
    await expect(writeOnboardingCompletion(dataRoot, "July 24")).rejects.toMatchObject({
      code: "ONBOARDING_COMPLETION_MARKER_INVALID",
    });
  });
});

async function makeDataRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onboarding-marker-"));
  temporaryRoots.push(root);
  return root;
}
