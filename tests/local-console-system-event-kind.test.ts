import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createSqliteLocalConsoleStore } from "../src/local-console/store.js";
import type { LocalConsoleStore } from "../src/local-console/types.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("local console persisted system event kinds", () => {
  it("persists every terminal fact and defaults neutral records to other", async () => {
    const { store } = await fixtureStore();
    try {
      await recordTerminal(store, "failed", (input) => store.recordFailure({ ...input, error: "exit 1" }));
      await recordTerminal(store, "retryable", (input) => store.recordRetryableFailure({ ...input, error: "exit 2" }));
      await recordTerminal(store, "stuck", (input) => store.recordStuck({ ...input, reason: "idle" }));
      await recordTerminal(store, "stopped", (input) => store.recordInterrupted({ ...input, reason: "user-stop", interruptionKind: "user" }));
      await recordTerminal(store, "dead-letter", (input) => store.recordDeadLetter({ ...input, error: "again", failureCount: 5 }));
      await store.recordSystemMessage({
        sessionId: "local:neutral",
        body: "上下文已经更新。",
        runId: null,
        runDir: null,
        error: null,
        now: "2026-07-22T00:10:00.000Z",
      });

      const systemMessages = (await Promise.all(
        ["failed", "retryable", "stuck", "stopped", "dead-letter", "neutral"]
          .map((name) => store.listMessages(`local:${name}`)),
      )).flat().filter((message) => message.speaker === "system");
      expect(systemMessages.map((message) => message.systemEventKind)).toEqual([
        "run-not-started",
        "run-not-started",
        "run-stuck",
        "user-stopped",
        "retry-exhausted",
        "other",
      ]);
      expect(systemMessages.every((message) => message.systemEventKind !== null)).toBe(true);
    } finally {
      await store.close();
    }
  });

  it("clears legacy attention values, maps old system rows to neutral, preserves unbound legacy sessions, and is idempotent", async () => {
    const { store, sqlitePath } = await fixtureStore();
    for (const [index, reason] of ["exception", "answer", "confirmation", "acceptance"].entries()) {
      await store.createSession({
        sessionId: `local:legacy-${String(index)}`,
        title: `legacy ${reason}`,
        now: `2026-07-22T00:0${String(index)}:00.000Z`,
      });
    }
    await store.recordSystemMessage({
      sessionId: "local:legacy-0",
      body: "旧系统记录",
      runId: null,
      runDir: null,
      error: null,
      now: "2026-07-22T00:05:00.000Z",
    });
    await store.close();

    const database = new DatabaseSync(sqlitePath);
    try {
      for (const [index, reason] of ["exception", "answer", "confirmation", "acceptance"].entries()) {
        database.prepare(
          "UPDATE sessions SET awaits_human_reason = ?, agent_team_ownership = NULL, agent_team_id = NULL WHERE session_id = ?",
        ).run(reason, `local:legacy-${String(index)}`);
      }
    } finally {
      database.close();
    }

    for (let pass = 0; pass < 2; pass += 1) {
      const reopened = await createSqliteLocalConsoleStore({ sqlitePath });
      await reopened.init();
      const legacy = (await reopened.listSessions()).filter((session) => session.sessionId.startsWith("local:legacy-"));
      expect(legacy).toHaveLength(4);
      expect(legacy.every((session) => session.awaitsHumanReason === null)).toBe(true);
      expect(legacy.every((session) => session.agentTeamOwnership === null && session.agentTeamId === null)).toBe(true);
      expect((await reopened.listMessages("local:legacy-0")).find((message) => message.speaker === "system"))
        .toMatchObject({ systemEventKind: "other" });
      await reopened.close();
    }
  });
});

async function fixtureStore(): Promise<{ store: LocalConsoleStore; sqlitePath: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-system-events-"));
  roots.push(root);
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  const store = await createSqliteLocalConsoleStore({ sqlitePath });
  await store.init();
  return { store, sqlitePath };
}

async function recordTerminal(
  store: LocalConsoleStore,
  name: string,
  finish: (input: {
    userMessageId: number;
    sessionId: string;
    runId: string;
    runDir: string | null;
    now: string;
  }) => Promise<unknown>,
): Promise<void> {
  const sessionId = `local:${name}`;
  await store.createSession({ sessionId, title: name, now: "2026-07-22T00:00:00.000Z" });
  const message = await store.appendUserMessage({ sessionId, body: "开始", now: "2026-07-22T00:00:01.000Z" });
  await store.claimNextPendingMessage({ sessionId, runId: `run-${name}`, now: "2026-07-22T00:00:02.000Z" });
  await finish({
    userMessageId: message.id,
    sessionId,
    runId: `run-${name}`,
    runDir: null,
    now: "2026-07-22T00:00:03.000Z",
  });
}
