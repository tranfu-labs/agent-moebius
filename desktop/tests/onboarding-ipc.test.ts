import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ONBOARDING_IPC_CHANNELS,
  registerOnboardingIpc,
  type OnboardingIpcMain,
} from "../src/onboarding/ipc.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })));
});

describe("onboarding IPC boundary", () => {
  it("connects marker, Codex check, and the fixed install command through narrow handlers", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onboarding-ipc-"));
    temporaryRoots.push(dataRoot);
    const handlers = new Map<string, (event: unknown, request?: unknown) => Promise<unknown>>();
    const writeText = vi.fn();
    const ipcMain: OnboardingIpcMain = {
      handle(channel, listener) {
        handlers.set(channel, listener);
      },
    };
    registerOnboardingIpc({
      ipcMain,
      getDataRoot: () => dataRoot,
      checkCodex: async () => ({
        status: "ok",
        message: "已找到",
        detail: "codex-cli 1.0",
      }),
      clipboard: { writeText },
    });

    await expect(invoke(handlers, ONBOARDING_IPC_CHANNELS.status)).resolves.toEqual({
      completed: false,
      completedAt: null,
    });
    await expect(invoke(handlers, ONBOARDING_IPC_CHANNELS.checkCodex)).resolves.toEqual({
      status: "ok",
      message: "已找到",
      detail: "codex-cli 1.0",
    });
    await expect(invoke(handlers, ONBOARDING_IPC_CHANNELS.copyInstallCommand)).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith("brew install codex");
    await expect(invoke(
      handlers,
      ONBOARDING_IPC_CHANNELS.teamBuilderStart,
      { draftId: "onboarding-team-builder" },
    )).resolves.toMatchObject({
      ok: true,
      state: { phase: "idle" },
    });
    expect([...handlers.keys()].filter((channel) => channel.includes("team-builder")).every(
      (channel) => channel.startsWith("onboarding:"),
    )).toBe(true);

    await expect(invoke(handlers, ONBOARDING_IPC_CHANNELS.complete)).resolves.toMatchObject({
      completed: true,
      completedAt: expect.any(String),
    });
    await expect(invoke(handlers, ONBOARDING_IPC_CHANNELS.status)).resolves.toMatchObject({
      completed: true,
      completedAt: expect.any(String),
    });
  });
});

function invoke(
  handlers: Map<string, (event: unknown, request?: unknown) => Promise<unknown>>,
  channel: string,
  request?: unknown,
): Promise<unknown> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler({}, request);
}
