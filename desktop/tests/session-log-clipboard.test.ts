import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSqliteLocalConsoleStore } from "../../src/local-console/store.js";
import {
  COPY_SESSION_LOG_PATH_IPC_CHANNEL,
  registerSessionLogClipboardIpc,
  type CopySessionLogPathResult,
} from "../src/session-log-clipboard.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("desktop session log clipboard IPC", () => {
  it("drives the registered IPC handler through the real local-console store and keeps the copied path stable", async () => {
    const root = await fixtureRoot();
    const store = await createSqliteLocalConsoleStore({
      sqlitePath: path.join(root, ".state", "local-console.sqlite"),
      sessionLogRoot: path.join(root, "sessions"),
    });
    await store.init();
    await store.createSession({
      sessionId: "local:existing",
      title: "existing",
      now: "2026-07-22T00:00:00.000Z",
    });

    const writes: string[] = [];
    const handler = registerHarness({
      getPathSource: () => store,
      writeText: (value) => writes.push(value),
    });

    await expect(handler("local:existing")).resolves.toEqual({ ok: true });
    await store.appendUserMessage({
      sessionId: "local:existing",
      body: "对话继续推进",
      now: "2026-07-22T00:00:01.000Z",
    });
    await expect(handler("local:existing")).resolves.toEqual({ ok: true });

    expect(writes).toEqual([
      store.getSessionFactLogPath("local:existing"),
      store.getSessionFactLogPath("local:existing"),
    ]);
    expect(path.isAbsolute(writes[0]!)).toBe(true);
    expect(await fs.readFile(writes[0]!, "utf8")).toContain("对话继续推进");
    await store.close();
  });

  it("does not write the clipboard when the record is missing or clipboard writing fails", async () => {
    const existingClipboard = "keep-existing-clipboard";
    let clipboard = existingClipboard;
    const missingHandler = registerHarness({
      getPathSource: () => ({ getSessionFactLogPath: () => "/missing/session.jsonl" }),
      writeText: (value) => {
        clipboard = value;
      },
    });

    await expect(missingHandler("local:missing")).resolves.toEqual({
      ok: false,
      reason: "record-unavailable",
    });
    expect(clipboard).toBe(existingClipboard);

    const root = await fixtureRoot();
    const logPath = path.join(root, "session.jsonl");
    await fs.writeFile(logPath, "{}\n", "utf8");
    const unavailableClipboardHandler = registerHarness({
      getPathSource: () => ({ getSessionFactLogPath: () => logPath }),
      writeText: () => {
        throw new Error("clipboard unavailable");
      },
    });
    await expect(unavailableClipboardHandler("local:existing")).resolves.toEqual({
      ok: false,
      reason: "clipboard-unavailable",
    });
    expect(clipboard).toBe(existingClipboard);
  });
});

function registerHarness(input: {
  getPathSource: Parameters<typeof registerSessionLogClipboardIpc>[0]["getPathSource"];
  writeText(value: string): void;
}): (sessionId: unknown) => Promise<CopySessionLogPathResult> {
  let registeredChannel = "";
  let registeredHandler: ((event: unknown, sessionId: unknown) => Promise<CopySessionLogPathResult>) | null = null;
  registerSessionLogClipboardIpc({
    ipcMain: {
      handle(channel, handler) {
        registeredChannel = channel;
        registeredHandler = handler;
      },
    },
    getPathSource: input.getPathSource,
    clipboard: { writeText: input.writeText },
    access: (targetPath) => fs.access(targetPath),
  });
  expect(registeredChannel).toBe(COPY_SESSION_LOG_PATH_IPC_CHANNEL);
  expect(registeredHandler).not.toBeNull();
  return (sessionId) => registeredHandler!(undefined, sessionId);
}

async function fixtureRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "moebius-session-log-clipboard-"));
  roots.push(root);
  return root;
}
