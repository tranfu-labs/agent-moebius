import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CodexRunOptions, CodexRunResult } from "../src/codex.js";
import { startLocalConsoleServer, type StartedLocalConsoleServer } from "../src/local-console/server.js";
import { createSqliteLocalConsoleStore } from "../src/local-console/store.js";
import { runSqliteStateCommand } from "../src/sqlite-state.js";

const roots: string[] = [];
const servers: StartedLocalConsoleServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("ADR-0004 per-session JSONL fact logs", () => {
  it("round-trips appended facts, keeps a stable path, and commits the log before the SQLite index", async () => {
    const root = await fixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    await store.createSession({ sessionId: "local:roundtrip", title: "roundtrip", now: "2026-07-22T00:00:00.000Z" });

    const firstPath = store.getSessionFactLogPath("local:roundtrip");
    const message = await store.appendUserMessage({
      sessionId: "local:roundtrip",
      body: "包含附件引用 ![proof](https://example.com/proof.png)",
      now: "2026-07-22T00:00:01.000Z",
    });
    expect(store.getSessionFactLogPath("local:roundtrip")).toBe(firstPath);
    expect(path.dirname(firstPath)).toBe(path.join(root, "sessions"));
    expect((await fs.readFile(firstPath, "utf8")).endsWith("\n")).toBe(true);
    await expect(store.listMessages("local:roundtrip")).resolves.toEqual([
      expect.objectContaining({ id: message.id, body: "包含附件引用 ![proof](https://example.com/proof.png)" }),
    ]);
    await store.close();

    const blockedRoot = path.join(root, "not-a-directory");
    await fs.writeFile(blockedRoot, "blocked", "utf8");
    const blocked = await createSqliteLocalConsoleStore({ sqlitePath, sessionLogRoot: blockedRoot });
    await expect(blocked.appendUserMessage({
      sessionId: "local:roundtrip",
      body: "must not reach sqlite",
      now: "2026-07-22T00:00:02.000Z",
    })).rejects.toThrow();
    const database = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      expect(database.prepare("SELECT 1 AS found FROM session_messages WHERE body = ?").get("must not reach sqlite"))
        .toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("ignores an incomplete tail while reading and truncates it before the next append", async () => {
    const root = await fixtureRoot();
    const store = await createSqliteLocalConsoleStore({ sqlitePath: path.join(root, ".state", "local-console.sqlite") });
    await store.init();
    await store.createSession({ sessionId: "local:half-line", title: "half", now: "2026-07-22T00:00:00.000Z" });
    await store.appendUserMessage({ sessionId: "local:half-line", body: "完整消息", now: "2026-07-22T00:00:01.000Z" });
    const logPath = store.getSessionFactLogPath("local:half-line");
    await fs.appendFile(logPath, "{\"version\":1,\"incomplete\"", "utf8");

    await expect(store.listMessages("local:half-line")).resolves.toEqual([
      expect.objectContaining({ body: "完整消息" }),
    ]);
    expect(await fs.readFile(logPath, "utf8")).not.toContain("incomplete");
    await store.appendUserMessage({ sessionId: "local:half-line", body: "修复后消息", now: "2026-07-22T00:00:02.000Z" });

    const text = await fs.readFile(logPath, "utf8");
    expect(text).not.toContain("incomplete");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.trimEnd().split("\n").every((line) => {
      JSON.parse(line);
      return true;
    })).toBe(true);
  });

  it("migrates legacy session_messages once and never lets later legacy rows overwrite the fact log", async () => {
    const root = await fixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    await runSqliteStateCommand({ sqlitePath, command: { kind: "local-init" } });
    await runSqliteStateCommand({
      sqlitePath,
      command: { kind: "local-append-user", sessionId: "local:legacy", body: "旧消息", now: "2026-07-22T00:00:00.000Z" },
    });

    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    const logPath = store.getSessionFactLogPath("local:legacy");
    const migratedText = await fs.readFile(logPath, "utf8");
    expect(migratedText).toContain("session_history_migrated");
    await store.close();

    await runSqliteStateCommand({
      sqlitePath,
      command: { kind: "local-append-user", sessionId: "local:legacy", body: "marker 后旧表新增", now: "2026-07-22T00:00:01.000Z" },
    });
    const reopened = await createSqliteLocalConsoleStore({ sqlitePath });
    await reopened.init();
    expect(await fs.readFile(logPath, "utf8")).toBe(migratedText);
    await expect(reopened.listMessages("local:legacy")).resolves.toEqual([
      expect.objectContaining({ body: "旧消息" }),
    ]);
    const database = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      expect(database.prepare("SELECT 1 AS found FROM schema_migrations WHERE version = ?")
        .get("session-jsonl-fact-log-v1")).toBeDefined();
      expect(database.prepare("SELECT 1 AS found FROM session_messages WHERE body = ?").get("marker 后旧表新增"))
        .toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("discovers JSONL files and rebuilds the SQLite message cache without session index rows", async () => {
    const root = await fixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    await store.createSession({ sessionId: "local:rebuild", title: "rebuild", now: "2026-07-22T00:00:00.000Z" });
    await store.appendUserMessage({ sessionId: "local:rebuild", body: "事实仍在", now: "2026-07-22T00:00:01.000Z" });

    const database = new DatabaseSync(sqlitePath);
    try {
      database.prepare("DELETE FROM session_messages WHERE session_id = ?").run("local:rebuild");
      database.prepare("DELETE FROM sessions WHERE session_id = ?").run("local:rebuild");
    } finally {
      database.close();
    }
    await store.rebuildMessageIndex();

    const verify = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      expect(verify.prepare("SELECT body FROM session_messages WHERE session_id = ?").get("local:rebuild"))
        .toMatchObject({ body: "事实仍在" });
    } finally {
      verify.close();
    }
  });

  it("writes independent child facts and the parent creation event through the real HTTP assembly", async () => {
    const root = await fixtureRoot();
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex: vi.fn(async (options: CodexRunOptions) => codexOk(options)),
    });
    servers.push(started);
    const parentResponse = await fetch(new URL("/api/local-console/sessions", started.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "local", title: "parent" }),
    });
    const parent = await parentResponse.json() as { session: { sessionId: string } };
    const childId = "local:http-child";
    const childResponse = await fetch(new URL("/api/local-console/child-sessions", started.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        parentSessionId: parent.session.sessionId,
        childSessionId: childId,
        projectId: "local",
        title: "child",
        hiddenKey: "http-child-key",
        initialBody: "@dev 子任务",
      }),
    });
    expect(childResponse.status).toBe(201);

    const parentLog = await readSessionLog(root, parent.session.sessionId);
    const childLog = await readSessionLog(root, childId);
    expect(parentLog.map((event) => event.type)).toContain("child_session_created");
    expect(childLog.map((event) => event.type)).toContain("session_created");
    expect(JSON.stringify(childLog)).toContain("@dev 子任务");
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-session-fact-"));
  roots.push(root);
  return root;
}

async function readSessionLog(root: string, sessionId: string): Promise<Array<{ type: string }>> {
  const fileName = `${Buffer.from(sessionId, "utf8").toString("base64url")}.jsonl`;
  const text = await fs.readFile(path.join(root, "sessions", fileName), "utf8");
  return text.trimEnd().split("\n").map((line) => JSON.parse(line) as { type: string });
}

function codexOk(options: CodexRunOptions): CodexRunResult {
  return {
    ok: true,
    finalText: "完成\n\n<!-- agent-stage:code-verified -->",
    threadId: null,
    cachedInputTokens: null,
    runDir: options.runDir,
    stdoutPath: path.join(options.runDir, "stdout.jsonl"),
    stderrPath: path.join(options.runDir, "stderr.log"),
  };
}
