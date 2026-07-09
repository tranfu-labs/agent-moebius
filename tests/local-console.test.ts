import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTrigger } from "../src/triggers/index.js";
import { buildLocalConsoleTimeline } from "../src/local-console/timeline.js";
import { createSqliteLocalConsoleStore } from "../src/local-console/store.js";
import { startLocalConsoleServer } from "../src/local-console/server.js";
import { readLocalConsoleOutputTail } from "../src/local-console/output-tail.js";
import {
  LOCAL_CONSOLE_DEFAULT_SESSION_ID,
  type LocalConsoleMessage,
  type LocalConsoleSessionSummary,
  type LocalConsoleStore,
} from "../src/local-console/types.js";
import type { CodexRunOptions, CodexRunResult } from "../src/codex.js";

const originalPath = process.env.PATH;

afterEach(() => {
  process.env.PATH = originalPath;
});

describe("local console", () => {
  it("stores user and agent messages in SQLite", async () => {
    const root = await makeFixtureRoot();
    const store = await createSqliteLocalConsoleStore({ sqlitePath: path.join(root, ".state", "local-console.sqlite") });
    await store.init();
    try {
      const user = await store.appendUserMessage({
        sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
        body: "@dev hello",
        now: "2026-07-09T00:00:00.000Z",
      });
      const claimed = await store.claimNextPendingMessage({
        sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
        runId: "run-1",
        now: "2026-07-09T00:00:01.000Z",
      });
      expect(claimed).toMatchObject({ id: user.id, status: "running", runId: "run-1" });

      await store.recordAgentResponse({
        userMessageId: user.id,
        sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
        role: "dev",
        body: "hello from codex",
        runId: "run-1",
        runDir: "/tmp/run-1",
        now: "2026-07-09T00:00:02.000Z",
      });

      expect(await store.listMessages(LOCAL_CONSOLE_DEFAULT_SESSION_ID)).toMatchObject([
        { speaker: "user", status: "completed", body: "@dev hello" },
        { speaker: "agent", role: "dev", status: "displayed", body: "hello from codex" },
      ]);
    } finally {
      await store.close();
    }

    const restarted = await createSqliteLocalConsoleStore({ sqlitePath: path.join(root, ".state", "local-console.sqlite") });
    await restarted.init();
    try {
      expect(await restarted.listMessages(LOCAL_CONSOLE_DEFAULT_SESSION_ID)).toMatchObject([
        { speaker: "user", status: "completed", body: "@dev hello" },
        { speaker: "agent", role: "dev", status: "displayed", body: "hello from codex" },
      ]);
    } finally {
      await restarted.close();
    }
  });

  it("marks stale running SQLite messages as stuck", async () => {
    const root = await makeFixtureRoot();
    const store = await createSqliteLocalConsoleStore({ sqlitePath: path.join(root, ".state", "local-console.sqlite") });
    await store.init();
    try {
      const user = await store.appendUserMessage({
        sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
        body: "@dev hello",
        now: "2026-07-09T00:00:00.000Z",
      });
      await store.claimNextPendingMessage({
        sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
        runId: "run-1",
        now: "2026-07-09T00:00:01.000Z",
      });

      expect(
        await store.markStaleRunning({
          sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
          cutoffIso: "2026-07-09T00:00:02.000Z",
          now: "2026-07-09T00:00:03.000Z",
          reason: "Recovered stale local console run after process restart",
        }),
      ).toBe(1);
      expect(await store.listMessages(LOCAL_CONSOLE_DEFAULT_SESSION_ID)).toMatchObject([
        { id: user.id, speaker: "user", status: "stuck", error: "Recovered stale local console run after process restart" },
        { speaker: "system", status: "displayed", error: "Recovered stale local console run after process restart" },
      ]);
    } finally {
      await store.close();
    }
  });

  it("builds local timelines that reuse mention parsing rules", () => {
    const agents = ["dev"];
    const runTimeline = buildLocalConsoleTimeline([message({ id: 1, body: "@dev hello" })], agents);
    expect(resolveTrigger({ timeline: runTimeline, availableAgentNames: agents })).toMatchObject({
      kind: "run-agent",
      role: "dev",
    });

    const codeTimeline = buildLocalConsoleTimeline([message({ id: 1, body: "示例：`@dev hello`" })], agents);
    expect(resolveTrigger({ timeline: codeTimeline, availableAgentNames: agents })).toEqual({
      kind: "skip",
      reason: "no-trigger",
    });
  });

  it("runs a local HTTP message through fake Codex without calling gh", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# Dev\n\nReply briefly.");
    const fakeBin = path.join(root, "fake-bin");
    await fs.mkdir(fakeBin, { recursive: true });
    const ghLog = path.join(root, "fake-gh.log");
    await fs.writeFile(path.join(fakeBin, "gh"), fakeCommandScript(ghLog, "gh"), { mode: 0o755 });
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ""}`;

    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => ({
      ok: true,
      finalText: "hello from fake codex",
      threadId: null,
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));

    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: 1_000,
    });
    try {
      const post = await fetch(new URL("/api/local-console/messages", started.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "@dev 帮我写个 hello" }),
      });
      expect(post.status).toBe(202);

      const snapshot = await waitForSnapshot(started.url, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.body.includes("fake codex")),
      );
      expect(snapshot.messages).toMatchObject([
        { speaker: "user", status: "completed" },
        { speaker: "agent", role: "dev", body: "hello from fake codex" },
      ]);
      expect(runCodex).toHaveBeenCalledTimes(1);
      await expect(fs.stat(ghLog)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await started.close();
    }
  });

  it("returns project/session state and runs messages in the selected session", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# Dev\n\nReply briefly.");
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => ({
      ok: true,
      finalText: `reply for ${path.basename(options.runDir)}`,
      threadId: null,
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: 1_000,
    });
    try {
      const session = await createSession(started.url, "T4 验收会话");
      expect(session.title).toBe("T4 验收会话");

      const post = await postSessionMessage(started.url, session.sessionId, "@dev session hello");
      expect(post.status).toBe(202);

      const state = await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.body.includes("reply")),
      );
      expect(state.project.sessions.map((entry) => entry.sessionId)).toContain(session.sessionId);
      expect(state.selectedSessionId).toBe(session.sessionId);
      expect(state.messages).toMatchObject([
        { speaker: "user", status: "completed", body: "@dev session hello" },
        { speaker: "agent", role: "dev", status: "displayed" },
      ]);
    } finally {
      await started.close();
    }
  });

  it("shows a bounded live run snapshot with non-empty fallback output", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# Dev");
    const runCodex = vi.fn((options: CodexRunOptions) => waitForAbortResult(options));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: 1_000,
    });
    try {
      const session = await createSession(started.url, "empty output");
      await postSessionMessage(started.url, session.sessionId, "@dev slow empty output");
      const state = await waitForState(started.url, session.sessionId, (data) => data.activeRun !== null);
      expect(state.activeRun).toMatchObject({
        sessionId: session.sessionId,
        status: "running",
        lastOutputSummary: "正在运行，等待输出",
        interruptible: true,
      });
      expect(state.activeRun?.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(state.activeRun?.runDir).toContain(path.join(root, "runs"));

      const interrupted = await interruptRun(started.url, session.sessionId, state.activeRun?.runId ?? "");
      expect(interrupted.status).toBe(202);
      await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.status === "interrupted"),
      );
    } finally {
      await started.close();
    }
  });

  it("interrupts only when both sessionId and runId match", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# Dev");
    let callCount = 0;
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => {
      callCount += 1;
      await fs.mkdir(options.runDir, { recursive: true });
      await fs.writeFile(path.join(options.runDir, "stdout.jsonl"), JSON.stringify({ message: "live tail from codex" }) + "\n");
      if (callCount === 1) {
        return await waitForAbortResult(options);
      }
      return {
        ok: true,
        finalText: "after interrupt",
        threadId: null,
        cachedInputTokens: null,
        runDir: options.runDir,
        stdoutPath: path.join(options.runDir, "stdout.jsonl"),
        stderrPath: path.join(options.runDir, "stderr.log"),
      };
    });
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: 1_000,
    });
    try {
      const sessionA = await createSession(started.url, "A");
      const sessionB = await createSession(started.url, "B");
      await postSessionMessage(started.url, sessionA.sessionId, "@dev slow A");
      const runningA = await waitForState(started.url, sessionA.sessionId, (data) =>
        data.activeRun?.lastOutputSummary === "live tail from codex",
      );

      const wrongSession = await interruptRun(started.url, sessionB.sessionId, runningA.activeRun?.runId ?? "");
      expect(wrongSession.status).toBe(409);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect((await getState(started.url, sessionA.sessionId)).activeRun?.runId).toBe(runningA.activeRun?.runId);

      const rightSession = await interruptRun(started.url, sessionA.sessionId, runningA.activeRun?.runId ?? "");
      expect(rightSession.status).toBe(202);
      const interrupted = await waitForState(started.url, sessionA.sessionId, (data) =>
        data.messages.some((entry) => entry.status === "interrupted"),
      );
      expect(interrupted.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ speaker: "user", status: "interrupted", error: "interrupted:user-interrupted" }),
          expect.objectContaining({ speaker: "system", body: "Codex interrupted: interrupted:user-interrupted" }),
        ]),
      );

      const after = await postSessionMessage(started.url, sessionA.sessionId, "@dev after interrupt");
      expect(after.status).toBe(202);
      await waitForState(started.url, sessionA.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.body === "after interrupt"),
      );
      expect(runCodex).toHaveBeenCalledTimes(2);
    } finally {
      await started.close();
    }
  });

  it("records Codex failures with run metadata and restores them after restart", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# Dev");
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => ({
      ok: false,
      reason: "exit:42",
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      sqlitePath,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: 1_000,
    });
    const session = await createSession(started.url, "failure");
    try {
      await postSessionMessage(started.url, session.sessionId, "@dev fail");
      await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.status === "failed" && entry.error === "exit:42"),
      );
    } finally {
      await started.close();
    }

    const restarted = await startLocalConsoleServer({
      projectRoot: root,
      sqlitePath,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `restart-${String(count)}`),
      storeTimeoutMs: 1_000,
    });
    try {
      const state = await getState(restarted.url, session.sessionId);
      expect(state.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: "failed", error: "exit:42", runDir: path.join(root, "runs", "run-1") }),
          expect.objectContaining({ speaker: "system", body: "Codex failed: exit:42", error: "exit:42" }),
        ]),
      );
    } finally {
      await restarted.close();
    }
  });

  it("returns a visible POST error on fast store write failure and does not call Codex", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# Dev");
    const runCodex = vi.fn<LocalRunCodex>(async () => {
      throw new Error("should not run");
    });
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      store: new FastFailAppendStore(),
      runCodex,
      storeTimeoutMs: 20,
    });
    try {
      const response = await fetch(new URL("/api/local-console/messages", started.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "@dev hello" }),
      });
      const body = (await response.json()) as { error: string };
      expect(response.status).toBe(503);
      expect(body.error).toContain("read-only local console store");
      expect(runCodex).not.toHaveBeenCalled();
    } finally {
      await started.close();
    }
  });

  it("bounds a hanging store write and accepts the next message after recovery", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# Dev");
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => ({
      ok: true,
      finalText: "after recovery",
      threadId: null,
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      store: new RecoveringAppendStore(),
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: 20,
    });
    try {
      const first = await postMessage(started.url, "@dev first");
      const body = (await first.json()) as { error: string };
      expect(first.status).toBe(503);
      expect(body.error).toContain("local-console-store-append-user-timeout");
      expect(runCodex).not.toHaveBeenCalled();

      const second = await postMessage(started.url, "@dev second");
      expect(second.status).toBe(202);
      const snapshot = await waitForSnapshot(started.url, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.body.includes("after recovery")),
      );
      expect(snapshot.messages).toMatchObject([
        { speaker: "user", status: "completed", body: "@dev second" },
        { speaker: "agent", role: "dev", status: "displayed", body: "after recovery" },
      ]);
      expect(runCodex).toHaveBeenCalledTimes(1);
    } finally {
      await started.close();
    }
  });

  it("fails visibly on a real SQLite lock without starting Codex", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# Dev");
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({
      sqlitePath,
      busyTimeoutMs: 500,
      timeoutMs: 500,
    });
    await store.init();
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => ({
      ok: true,
      finalText: "after sqlite unlock",
      threadId: null,
      cachedInputTokens: null,
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      store,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: 500,
      pollIntervalMs: 20,
    });
    (started.runtime as unknown as { storeTimeoutMs: number }).storeTimeoutMs = 50;
    const lock = new DatabaseSync(sqlitePath);
    try {
      lock.exec("BEGIN EXCLUSIVE");
      const locked = await postMessage(started.url, "@dev locked");
      const lockedBody = (await locked.json()) as { error: string };
      expect(locked.status).toBe(503);
      expect(lockedBody.error).toContain("timeout");
      expect(runCodex).not.toHaveBeenCalled();

      expect(runCodex).toHaveBeenCalledTimes(0);
    } finally {
      try {
        lock.exec("ROLLBACK");
      } catch {
        // The lock may already have been released by the recovery path.
      }
      lock.close();
      await started.close();
    }
  }, 10_000);

  it("records Codex timeout as stuck and accepts the next local message", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# Dev");
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => ({
      ok: false,
      reason: "idle-timeout:10ms",
      runDir: options.runDir,
      stdoutPath: path.join(options.runDir, "stdout.jsonl"),
      stderrPath: path.join(options.runDir, "stderr.log"),
    }));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: 1_000,
      codexIdleTimeoutMs: 10,
      codexMaxDurationMs: 20,
    });
    try {
      await postMessage(started.url, "@dev first");
      await waitForSnapshot(started.url, (data) => data.messages.some((entry) => entry.status === "stuck"));

      const second = await postMessage(started.url, "@dev second");
      expect(second.status).toBe(202);
      await waitFor(() => runCodex.mock.calls.length === 2);
      expect(runCodex).toHaveBeenCalledTimes(2);
    } finally {
      await started.close();
    }
  });

  it("reads large output tails with a byte cap and deterministic summary", async () => {
    const root = await makeFixtureRoot();
    const runDir = path.join(root, "runs", "large");
    await fs.mkdir(runDir, { recursive: true });
    const lines = Array.from({ length: 200 }, (_, index) =>
      JSON.stringify({ message: `line-${String(index).padStart(3, "0")}` }),
    );
    await fs.writeFile(path.join(runDir, "stdout.jsonl"), `${lines.join("\n")}\n`);

    const before = Date.now();
    const tail = await readLocalConsoleOutputTail(runDir, { maxBytes: 256, timeoutMs: 500 });
    expect(Date.now() - before).toBeLessThan(500);
    expect(tail.lastOutputSummary).toBe("line-199");
    expect(tail.tailDiagnostic).toContain("tail-truncated:stdout.jsonl");
    expect(tail.stdoutTail?.length).toBeLessThanOrEqual(256);
  });

  it("rejects a second local message while a slow Codex run is active", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# Dev");
    let resolveCodex: ((result: CodexRunResult) => void) | null = null;
    const runCodex = vi.fn(
      (options: CodexRunOptions) =>
        new Promise<CodexRunResult>((resolve) => {
          resolveCodex = resolve;
          void options;
        }),
    );
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: 1_000,
    });
    try {
      await postMessage(started.url, "@dev slow");
      await waitForSnapshot(started.url, (data) => data.status === "running");
      await waitFor(() => runCodex.mock.calls.length === 1);

      const second = await postMessage(started.url, "@dev should not run");
      expect(second.status).toBe(409);
      expect(runCodex).toHaveBeenCalledTimes(1);

      expect(resolveCodex).toBeTypeOf("function");
      resolveCodex!({
        ok: true,
        finalText: "done",
        threadId: null,
        cachedInputTokens: null,
        runDir: path.join(root, "runs", "run-1"),
        stdoutPath: path.join(root, "runs", "run-1", "stdout.jsonl"),
        stderrPath: path.join(root, "runs", "run-1", "stderr.log"),
      });
      await waitForSnapshot(started.url, (data) => data.messages.some((entry) => entry.speaker === "agent"));
      expect(runCodex).toHaveBeenCalledTimes(1);
    } finally {
      await started.close();
    }
  });
});

type LocalRunCodex = (options: CodexRunOptions) => Promise<CodexRunResult>;

async function makeFixtureRoot(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-local-console-"));
}

async function waitFor(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
}

async function writeAgent(root: string, name: string, body: string): Promise<void> {
  const agentsDir = path.join(root, "agents");
  await fs.mkdir(agentsDir, { recursive: true });
  await fs.writeFile(path.join(agentsDir, `${name}.md`), body, "utf8");
}

function message(input: { id: number; body: string; speaker?: "user" | "agent" | "system"; role?: string | null }): LocalConsoleMessage {
  return {
    id: input.id,
    sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
    speaker: input.speaker ?? "user",
    role: input.role ?? null,
    body: input.body,
    status: "pending",
    runId: null,
    runDir: null,
    error: null,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}

async function postMessage(url: string, body: string): Promise<Response> {
  return await fetch(new URL("/api/local-console/messages", url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

async function createSession(url: string, title: string): Promise<LocalConsoleSessionSummary> {
  const response = await fetch(new URL("/api/local-console/sessions", url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { session: LocalConsoleSessionSummary };
  return body.session;
}

async function postSessionMessage(url: string, sessionId: string, body: string): Promise<Response> {
  return await fetch(new URL(`/api/local-console/sessions/${encodeURIComponent(sessionId)}/messages`, url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

async function interruptRun(url: string, sessionId: string, runId: string): Promise<Response> {
  return await fetch(new URL(`/api/local-console/sessions/${encodeURIComponent(sessionId)}/interrupt`, url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId }),
  });
}

async function getState(url: string, sessionId: string): Promise<LocalStateResponse> {
  const stateUrl = new URL("/api/local-console/state", url);
  stateUrl.searchParams.set("sessionId", sessionId);
  const response = await fetch(stateUrl);
  expect(response.status).toBe(200);
  return (await response.json()) as LocalStateResponse;
}

async function waitForState(
  url: string,
  sessionId: string,
  predicate: (snapshot: LocalStateResponse) => boolean,
): Promise<LocalStateResponse> {
  const deadline = Date.now() + 5_000;
  let latest: LocalStateResponse | null = null;
  while (Date.now() < deadline) {
    latest = await getState(url, sessionId);
    if (predicate(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for local state: ${JSON.stringify(latest)}`);
}

async function waitForSnapshot(
  url: string,
  predicate: (snapshot: LocalSnapshotResponse) => boolean,
): Promise<LocalSnapshotResponse> {
  const deadline = Date.now() + 5_000;
  let latest: LocalSnapshotResponse | null = null;
  while (Date.now() < deadline) {
    const response = await fetch(new URL("/api/local-console/messages", url));
    if (response.status !== 200) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      continue;
    }
    latest = (await response.json()) as LocalSnapshotResponse;
    if (!Array.isArray(latest.messages)) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      continue;
    }
    if (predicate(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for local snapshot: ${JSON.stringify(latest)}`);
}

interface LocalSnapshotResponse {
  status: "idle" | "running" | "failed" | "stuck";
  messages: Array<{ speaker: string; role: string | null; body: string; status: string; error: string | null; runDir: string | null }>;
  activeRun: LocalRunSnapshotResponse | null;
}

interface LocalStateResponse {
  project: {
    sessions: LocalConsoleSessionSummary[];
  };
  selectedSessionId: string;
  selectedSession: LocalConsoleSessionSummary | null;
  messages: Array<{ speaker: string; role: string | null; body: string; status: string; error: string | null; runDir: string | null }>;
  activeRun: LocalRunSnapshotResponse | null;
}

interface LocalRunSnapshotResponse {
  sessionId: string;
  runId: string;
  status: "running";
  elapsedMs: number;
  runDir: string | null;
  lastOutputSummary: string;
  interruptible: boolean;
}

function fakeCommandScript(logPath: string, name: string): string {
  return `#!/bin/sh
printf '%s %s\\n' '${name}' "$*" >> '${logPath}'
exit 0
`;
}

function waitForAbortResult(options: CodexRunOptions): Promise<CodexRunResult> {
  return new Promise<CodexRunResult>((resolve) => {
    options.signal?.addEventListener(
      "abort",
      () => {
        resolve({
          ok: false,
          reason: `interrupted:${String(options.signal?.reason ?? "abort")}`,
          runDir: options.runDir,
          stdoutPath: path.join(options.runDir, "stdout.jsonl"),
          stderrPath: path.join(options.runDir, "stderr.log"),
        });
      },
      { once: true },
    );
  });
}

function buildSessionSummary(sessionId: string, title = "默认会话", messages: LocalConsoleMessage[] = []): LocalConsoleSessionSummary {
  const runningCount = messages.filter((message) => message.sessionId === sessionId && message.status === "running").length;
  const stuckCount = messages.filter((message) => message.sessionId === sessionId && message.status === "stuck").length;
  const errorCount = messages.filter((message) => message.sessionId === sessionId && message.status === "failed").length;
  const interruptedCount = messages.filter((message) => message.sessionId === sessionId && message.status === "interrupted").length;
  return {
    sessionId,
    title,
    status: runningCount > 0
      ? "running"
      : stuckCount > 0
        ? "stuck"
        : errorCount > 0
          ? "failed"
          : interruptedCount > 0
            ? "interrupted"
            : "idle",
    runningCount,
    waitingCount: 0,
    stuckCount,
    errorCount,
    interruptedCount,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}

class FastFailAppendStore implements LocalConsoleStore {
  readonly sqlitePath = "/tmp/fast-fail-local-console.sqlite";

  async init(): Promise<void> {}

  async close(): Promise<void> {}

  async createSession(input: { sessionId: string; title: string; now: string }): Promise<LocalConsoleSessionSummary> {
    void input.now;
    return buildSessionSummary(input.sessionId, input.title);
  }

  async listSessions(): Promise<LocalConsoleSessionSummary[]> {
    return [buildSessionSummary(LOCAL_CONSOLE_DEFAULT_SESSION_ID)];
  }

  appendUserMessage(): Promise<LocalConsoleMessage> {
    throw new Error("read-only local console store");
  }

  async listMessages(): Promise<LocalConsoleMessage[]> {
    return [];
  }

  async hasRunningMessage(): Promise<boolean> {
    return false;
  }

  async claimNextPendingMessage(): Promise<LocalConsoleMessage | null> {
    return null;
  }

  async setRunDir(): Promise<void> {}

  async recordAgentResponse(): Promise<void> {}

  async recordSystemAndComplete(): Promise<void> {}

  async recordFailure(): Promise<void> {}

  async recordInterrupted(): Promise<void> {}

  async recordStuck(): Promise<void> {}

  async markStaleRunning(): Promise<number> {
    return 0;
  }
}

class RecoveringAppendStore implements LocalConsoleStore {
  readonly sqlitePath = "/tmp/recovering-local-console.sqlite";

  private messages: LocalConsoleMessage[] = [];
  private sessions = new Map<string, string>([[LOCAL_CONSOLE_DEFAULT_SESSION_ID, "默认会话"]]);
  private nextId = 1;
  private hangNextAppend = true;

  async init(): Promise<void> {}

  async close(): Promise<void> {}

  async createSession(input: { sessionId: string; title: string; now: string }): Promise<LocalConsoleSessionSummary> {
    void input.now;
    this.sessions.set(input.sessionId, input.title);
    return buildSessionSummary(input.sessionId, input.title, this.messages);
  }

  async listSessions(): Promise<LocalConsoleSessionSummary[]> {
    const ids = new Set([LOCAL_CONSOLE_DEFAULT_SESSION_ID, ...this.sessions.keys(), ...this.messages.map((message) => message.sessionId)]);
    return Array.from(ids).map((sessionId) =>
      buildSessionSummary(sessionId, this.sessions.get(sessionId) ?? sessionId, this.messages),
    );
  }

  appendUserMessage(input: { sessionId: string; body: string; now: string }): Promise<LocalConsoleMessage> {
    if (this.hangNextAppend) {
      this.hangNextAppend = false;
      return new Promise<LocalConsoleMessage>(() => {});
    }
    const message: LocalConsoleMessage = {
      id: this.nextId,
      sessionId: input.sessionId,
      speaker: "user",
      role: null,
      body: input.body,
      status: "pending",
      runId: null,
      runDir: null,
      error: null,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.nextId += 1;
    this.sessions.set(input.sessionId, this.sessions.get(input.sessionId) ?? input.body);
    this.messages.push(message);
    return Promise.resolve(message);
  }

  async listMessages(): Promise<LocalConsoleMessage[]> {
    return this.messages.map((message) => ({ ...message }));
  }

  async hasRunningMessage(): Promise<boolean> {
    return this.messages.some((message) => message.status === "running");
  }

  async claimNextPendingMessage(input: { sessionId: string; runId: string; now: string }): Promise<LocalConsoleMessage | null> {
    const message = this.messages.find((entry) => entry.sessionId === input.sessionId && entry.status === "pending");
    if (message === undefined) {
      return null;
    }
    message.status = "running";
    message.runId = input.runId;
    message.updatedAt = input.now;
    return { ...message };
  }

  async setRunDir(input: { id: number; runDir: string; now: string }): Promise<void> {
    const message = this.messages.find((entry) => entry.id === input.id);
    if (message !== undefined) {
      message.runDir = input.runDir;
      message.updatedAt = input.now;
    }
  }

  async recordAgentResponse(input: {
    userMessageId: number;
    sessionId: string;
    role: string;
    body: string;
    runId: string;
    runDir: string;
    now: string;
  }): Promise<void> {
    const user = this.messages.find((entry) => entry.id === input.userMessageId);
    if (user !== undefined) {
      user.status = "completed";
      user.updatedAt = input.now;
    }
    this.messages.push({
      id: this.nextId,
      sessionId: input.sessionId,
      speaker: "agent",
      role: input.role,
      body: input.body,
      status: "displayed",
      runId: input.runId,
      runDir: input.runDir,
      error: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
    this.nextId += 1;
  }

  async recordSystemAndComplete(): Promise<void> {}

  async recordFailure(input: { userMessageId: number; error: string; now: string }): Promise<void> {
    const message = this.messages.find((entry) => entry.id === input.userMessageId);
    if (message !== undefined) {
      message.status = "failed";
      message.error = input.error;
      message.updatedAt = input.now;
    }
  }

  async recordInterrupted(input: { userMessageId: number; reason: string; now: string }): Promise<void> {
    const message = this.messages.find((entry) => entry.id === input.userMessageId);
    if (message !== undefined) {
      message.status = "interrupted";
      message.error = input.reason;
      message.updatedAt = input.now;
    }
  }

  async recordStuck(input: { userMessageId: number; reason: string; now: string }): Promise<void> {
    const message = this.messages.find((entry) => entry.id === input.userMessageId);
    if (message !== undefined) {
      message.status = "stuck";
      message.error = input.reason;
      message.updatedAt = input.now;
    }
  }

  async markStaleRunning(): Promise<number> {
    return 0;
  }
}
