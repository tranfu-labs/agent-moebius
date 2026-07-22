import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startLocalConsoleServer } from "../src/local-console/server.js";
import { createSqliteLocalConsoleStore } from "../src/local-console/store.js";
import { localSessionWorktreePath } from "../src/local-console/workspace-source.js";
import type { CodexRunOptions, CodexRunResult } from "../src/codex.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 50,
  })));
});

describe("pending session context switches", () => {
  it("drives workspace and team switches through the loopback server without interrupting or replaying the active step", async () => {
    const root = await makeGitRoot();
    const agentPath = path.join(root, "dev.md");
    await fs.writeFile(agentPath, "# dev\n", "utf8");
    let finishRun!: (result: CodexRunResult) => void;
    const runCodex = vi.fn((options: CodexRunOptions) => new Promise<CodexRunResult>((resolve) => {
      finishRun = resolve;
      expect(options.signal?.aborted).toBe(false);
    }));
    const started = await startLocalConsoleServer({
      host: "127.0.0.1",
      port: 0,
      projectRoot: root,
      workdirRoot: path.join(root, "workdir"),
      sqlitePath: path.join(root, "local-console.sqlite"),
      listAgentFiles: async () => [{ name: "dev", path: agentPath }],
      runCodex,
      makeRunDir: () => path.join(root, "run"),
    });

    try {
      const created = await requestJson(started.url, "/api/local-console/sessions", {
        method: "POST",
        body: {
          projectId: "local",
          initialMessage: "@dev continue",
          agentTeamOwnership: "system",
          agentTeamId: "development",
        },
      });
      const sessionId = (created.session as { sessionId: string }).sessionId;
      await waitFor(async () => runCodex.mock.calls.length === 1);

      await requestJson(started.url, `/api/local-console/sessions/${encodeURIComponent(sessionId)}/workspace`, {
        method: "PATCH",
        body: { workspaceMode: "worktree" },
      });
      await requestJson(started.url, `/api/local-console/sessions/${encodeURIComponent(sessionId)}/team`, {
        method: "PATCH",
        body: { agentTeamOwnership: "user", agentTeamId: "marketing" },
      });

      const pending = await readState(started.url, sessionId);
      expect(pending.selectedSession).toMatchObject({
        workspaceMode: "direct",
        workspacePendingMode: "worktree",
        branchName: "main",
        agentTeamOwnership: "system",
        agentTeamId: "development",
        agentTeamPendingOwnership: "user",
        agentTeamPendingId: "marketing",
      });

      finishRun({
        ok: true,
        finalText: "done\n\n<!-- agent-stage: code-verified -->",
        threadId: null,
        cachedInputTokens: null,
        runDir: path.join(root, "run"),
        stdoutPath: path.join(root, "run", "stdout.jsonl"),
        stderrPath: path.join(root, "run", "stderr.log"),
      });
      await waitFor(async () => {
        const state = await readState(started.url, sessionId);
        return state.selectedSession?.workspacePendingMode === null
          && state.selectedSession.agentTeamPendingId === null;
      });

      const settled = await readState(started.url, sessionId);
      expect(settled.selectedSession).toMatchObject({
        workspaceMode: "worktree",
        workspacePendingMode: null,
        agentTeamOwnership: "user",
        agentTeamId: "marketing",
        agentTeamPendingOwnership: null,
        agentTeamPendingId: null,
      });
      expect(settled.messages).toEqual([
        expect.objectContaining({ speaker: "user", body: "@dev continue" }),
        expect.objectContaining({ speaker: "agent", body: expect.stringContaining("done") }),
      ]);
      expect(runCodex).toHaveBeenCalledTimes(1);
    } finally {
      await started.close();
    }
  }, 15_000);

  it("persists a pending workspace choice across store restart", async () => {
    const root = await makeGitRoot();
    const sqlitePath = path.join(root, "restart.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    await store.createSession({ sessionId: "restart-session", projectId: "local", title: "restart", now: "2026-07-22T00:00:00.000Z" });
    const message = await store.appendUserMessage({ sessionId: "restart-session", body: "@dev run", now: "2026-07-22T00:00:01.000Z" });
    await store.claimNextPendingMessage({ sessionId: "restart-session", runId: "run", now: "2026-07-22T00:00:02.000Z" });
    await store.switchSessionWorkspace({ sessionId: "restart-session", workspaceMode: "worktree", now: "2026-07-22T00:00:03.000Z" });
    expect(message.status).toBe("pending");
    await store.close();

    const restarted = await createSqliteLocalConsoleStore({ sqlitePath });
    await restarted.init();
    try {
      expect((await restarted.listSessions()).find((session) => session.sessionId === "restart-session"))
        .toMatchObject({ workspaceMode: "direct", workspacePendingMode: "worktree" });
    } finally {
      await restarted.close();
    }
  });

  it("freezes the selected team content through the server boundary and promotes its pending snapshot", async () => {
    const root = await makeGitRoot();
    let selectedMarketingMarkdown = "# dev\n\nselected marketing version\n";
    let finishFirstRun!: (result: CodexRunResult) => void;
    const prompts: string[] = [];
    const runCodex = vi.fn((options: CodexRunOptions): Promise<CodexRunResult> => {
      prompts.push(options.prompt);
      if (prompts.length === 1) {
        return new Promise((resolve) => {
          finishFirstRun = resolve;
        });
      }
      return Promise.resolve(successfulRun(root, "second"));
    });
    const fallbackAgentFiles = vi.fn(async () => {
      throw new Error("live team files must not be read once a session snapshot exists");
    });
    const started = await startLocalConsoleServer({
      host: "127.0.0.1",
      port: 0,
      projectRoot: root,
      workdirRoot: path.join(root, "workdir"),
      sqlitePath: path.join(root, "team-snapshot.sqlite"),
      listAgentFiles: fallbackAgentFiles,
      loadAgentTeamSnapshot: async (binding) => ({
        members: [{
          name: "dev",
          agentMarkdown: binding.id === "marketing"
            ? selectedMarketingMarkdown
            : "# dev\n\noriginal development version\n",
        }],
      }),
      runCodex,
      makeRunDir: () => path.join(root, "run"),
    });

    try {
      const created = await requestJson(started.url, "/api/local-console/sessions", {
        method: "POST",
        body: {
          projectId: "local",
          initialMessage: "@dev first",
          agentTeamOwnership: "system",
          agentTeamId: "development",
        },
      });
      const sessionId = (created.session as { sessionId: string }).sessionId;
      await waitFor(() => runCodex.mock.calls.length === 1);
      expect(prompts[0]).toContain("original development version");

      await requestJson(started.url, `/api/local-console/sessions/${encodeURIComponent(sessionId)}/team`, {
        method: "PATCH",
        body: { agentTeamOwnership: "user", agentTeamId: "marketing" },
      });
      selectedMarketingMarkdown = "# dev\n\nedited after selection\n";
      finishFirstRun(successfulRun(root, "first"));
      await waitFor(async () => {
        const state = await readState(started.url, sessionId);
        return state.selectedSession?.agentTeamId === "marketing"
          && state.selectedSession.agentTeamPendingId === null;
      });

      await requestJson(started.url, `/api/local-console/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: "POST",
        body: { body: "@dev second" },
      });
      await waitFor(() => runCodex.mock.calls.length === 2);
      expect(prompts[1]).toContain("selected marketing version");
      expect(prompts[1]).not.toContain("edited after selection");
      expect(fallbackAgentFiles).not.toHaveBeenCalled();
    } finally {
      await started.close();
    }
  }, 15_000);

  it("runs two sessions in the same project with independent workspace modes from the server entry", async () => {
    const root = await makeGitRoot();
    const agentPath = path.join(root, "dev.md");
    await fs.writeFile(agentPath, "# dev\n", "utf8");
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => ({
      ok: true,
      finalText: `finished ${options.cwd}\n\n<!-- agent-stage: code-verified -->`,
      threadId: null,
      cachedInputTokens: null,
      runDir: path.join(root, "run"),
      stdoutPath: path.join(root, "run", "stdout.jsonl"),
      stderrPath: path.join(root, "run", "stderr.log"),
    }));
    const started = await startLocalConsoleServer({
      host: "127.0.0.1",
      port: 0,
      projectRoot: root,
      workdirRoot: path.join(root, "workdir"),
      sqlitePath: path.join(root, "two-sessions.sqlite"),
      listAgentFiles: async () => [{ name: "dev", path: agentPath }],
      runCodex,
      makeRunDir: () => path.join(root, "run"),
    });

    try {
      const direct = await requestJson(started.url, "/api/local-console/sessions", {
        method: "POST",
        body: { projectId: "local", title: "direct" },
      });
      const isolated = await requestJson(started.url, "/api/local-console/sessions", {
        method: "POST",
        body: { projectId: "local", title: "isolated" },
      });
      const directId = (direct.session as { sessionId: string }).sessionId;
      const isolatedId = (isolated.session as { sessionId: string }).sessionId;
      await requestJson(started.url, `/api/local-console/sessions/${encodeURIComponent(isolatedId)}/workspace`, {
        method: "PATCH",
        body: { workspaceMode: "worktree" },
      });

      await Promise.all([
        requestJson(started.url, `/api/local-console/sessions/${encodeURIComponent(directId)}/messages`, {
          method: "POST",
          body: { body: "@dev direct-session" },
        }),
        requestJson(started.url, `/api/local-console/sessions/${encodeURIComponent(isolatedId)}/messages`, {
          method: "POST",
          body: { body: "@dev isolated-session" },
        }),
      ]);
      await waitFor(() => runCodex.mock.calls.length === 2);
      await waitFor(async () => {
        const [directState, isolatedState] = await Promise.all([
          readState(started.url, directId),
          readState(started.url, isolatedId),
        ]);
        return directState.messages.some((message) => message.speaker === "agent")
          && isolatedState.messages.some((message) => message.speaker === "agent");
      });

      const directCall = runCodex.mock.calls.find(([options]) => options.prompt.includes("direct-session"));
      const isolatedCall = runCodex.mock.calls.find(([options]) => options.prompt.includes("isolated-session"));
      expect(directCall?.[0].cwd).toBe(root);
      expect(isolatedCall?.[0].cwd).toBe(localSessionWorktreePath(
        path.join(root, "workdir"),
        "local",
        isolatedId,
      ));
      expect(isolatedCall?.[0].cwd).not.toBe(directCall?.[0].cwd);
      await expect(fs.readFile(path.join(root, "README.md"), "utf8")).resolves.toBe("fixture\n");

      const directState = await readState(started.url, directId);
      const isolatedState = await readState(started.url, isolatedId);
      expect(directState.selectedSession).toMatchObject({ workspaceMode: "direct", branchName: "main" });
      expect(isolatedState.selectedSession).toMatchObject({
        workspaceMode: "worktree",
        branchName: `agent/local-local-${isolatedId.replace(/[^A-Za-z0-9._-]/gu, "_")}`,
      });
    } finally {
      await started.close();
    }
  }, 15_000);

  it("reports a stable non-git reason and rejects independent mode at the server boundary", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "moebius-non-git-"));
    roots.push(root);
    const started = await startLocalConsoleServer({
      host: "127.0.0.1",
      port: 0,
      projectRoot: root,
      workdirRoot: path.join(root, "workdir"),
      sqlitePath: path.join(root, "non-git.sqlite"),
      listAgentFiles: async () => [],
      runCodex: vi.fn(),
      makeRunDir: () => path.join(root, "run"),
    });

    try {
      const created = await requestJson(started.url, "/api/local-console/sessions", {
        method: "POST",
        body: { projectId: "local", title: "non-git" },
      });
      const sessionId = (created.session as { sessionId: string }).sessionId;
      const state = await readState(started.url, sessionId);
      expect(state.selectedSession).toMatchObject({
        workspaceMode: "direct",
        workspaceUnavailableReason: "not-git-repository",
        branchName: null,
      });

      const response = await fetch(new URL(
        `/api/local-console/sessions/${encodeURIComponent(sessionId)}/workspace`,
        started.url,
      ), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceMode: "worktree" }),
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: "NOT_GIT_REPOSITORY",
        error: "这个项目文件夹不是 git 仓库，无法隔离改动",
      });
    } finally {
      await started.close();
    }
  });
});

async function makeGitRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "moebius-pending-switch-"));
  roots.push(root);
  await execFileAsync("git", ["init", "-b", "main", root]);
  await fs.writeFile(path.join(root, "README.md"), "fixture\n", "utf8");
  await execFileAsync("git", ["-C", root, "add", "README.md"]);
  await execFileAsync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture"]);
  return root;
}

function successfulRun(root: string, suffix: string): CodexRunResult {
  return {
    ok: true,
    finalText: `done ${suffix}\n\n<!-- agent-stage: code-verified -->`,
    threadId: null,
    cachedInputTokens: null,
    runDir: path.join(root, `run-${suffix}`),
    stdoutPath: path.join(root, `run-${suffix}`, "stdout.jsonl"),
    stderrPath: path.join(root, `run-${suffix}`, "stderr.log"),
  };
}

async function requestJson(base: string, route: string, input: { method: string; body: unknown }): Promise<Record<string, unknown>> {
  const response = await fetch(new URL(route, base), {
    method: input.method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input.body),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body.error ?? response.status));
  }
  return body;
}

async function readState(base: string, sessionId: string): Promise<{
  selectedSession: Record<string, unknown> | null;
  messages: Array<Record<string, unknown>>;
}> {
  const url = new URL("/api/local-console/state", base);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("projectId", "local");
  const response = await fetch(url);
  return await response.json() as {
    selectedSession: Record<string, unknown> | null;
    messages: Array<Record<string, unknown>>;
  };
}

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for condition");
}
