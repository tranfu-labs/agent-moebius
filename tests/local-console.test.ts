import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTrigger } from "../src/triggers/index.js";
import { buildLocalConsoleTimeline } from "../src/local-console/timeline.js";
import { createSqliteLocalConsoleStore } from "../src/local-console/store.js";
import { startLocalConsoleServer } from "../src/local-console/server.js";
import type { LocalConsoleAgentFile } from "../src/local-console/runtime.js";
import { readLocalConsoleOutputTail } from "../src/local-console/output-tail.js";
import { parseLocalAcceptanceWalkthrough } from "../src/local-console/acceptance-loop.js";
import {
  createLocalChildSession,
  listLocalT5Facts,
  recordLocalAcceptanceFact,
  recordLocalDeadLetter,
  recordLocalIntegrationEvent,
  recordLocalRouteDecision,
} from "../src/local-console/t5-store.js";
import {
  LOCAL_CONSOLE_DEFAULT_SESSION_ID,
  LOCAL_CONSOLE_PROJECT_ID,
  type LocalConsoleMessage,
  type LocalConsoleProjectSummary,
  type LocalConsoleSessionSummary,
  type LocalConsoleSessionWorkspaceSource,
  type LocalConsoleStore,
} from "../src/local-console/types.js";
import type { CodexRunOptions, CodexRunResult } from "../src/codex.js";

const originalPath = process.env.PATH;
const STANDARD_STORE_TIMEOUT_MS = 2_000;

afterEach(() => {
  process.env.PATH = originalPath;
});

describe("local console", () => {
  it("parses local acceptance walkthroughs strictly", () => {
    expect(
      parseLocalAcceptanceWalkthrough(
        ["1. 通过 — evidence one", "2. 不通过 — evidence two", "验收结论：不通过"].join("\n"),
        ["a", "b"],
      ),
    ).toMatchObject({
      kind: "parsed",
      verdict: "failed",
      statementResults: [
        { index: 1, status: "passed", evidence: "evidence one" },
        { index: 2, status: "failed", evidence: "evidence two" },
      ],
    });

    expect(
      parseLocalAcceptanceWalkthrough(
        ["1. 通过 — evidence one", "验收结论：通过", "@dev continue"].join("\n"),
        ["a", "b"],
      ),
    ).toMatchObject({
      kind: "unparsed",
      attemptedAcceptance: true,
      diagnostics: expect.arrayContaining(["statement-count-mismatch:1/2", "missing-index:2"]),
    });

    expect(
      parseLocalAcceptanceWalkthrough(
        ["1. 不通过 — failed", "验收结论：通过"].join("\n"),
        ["a"],
      ),
    ).toMatchObject({
      kind: "unparsed",
      diagnostics: expect.arrayContaining(["conclusion-mismatch"]),
    });
  });

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

  it("persists an Agent team binding atomically with session creation and leaves legacy sessions unbound", async () => {
    const root = await makeFixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    const projectId = (await store.listProjects())[0]!.projectId;
    await store.createSession({
      sessionId: "local:bound-team",
      projectId,
      title: "bound",
      agentTeamOwnership: "user",
      agentTeamId: "my-team",
      now: "2026-07-21T00:00:00.000Z",
    });

    expect((await store.listSessions()).find((session) => session.sessionId === "local:bound-team"))
      .toMatchObject({ agentTeamOwnership: "user", agentTeamId: "my-team" });
    expect((await store.listSessions()).find((session) => session.sessionId === LOCAL_CONSOLE_DEFAULT_SESSION_ID))
      .toMatchObject({ agentTeamOwnership: null, agentTeamId: null });
    await store.close();

    const restarted = await createSqliteLocalConsoleStore({ sqlitePath });
    await restarted.init();
    try {
      expect((await restarted.listSessions()).find((session) => session.sessionId === "local:bound-team"))
        .toMatchObject({ agentTeamOwnership: "user", agentTeamId: "my-team" });
    } finally {
      await restarted.close();
    }
  });

  it("persists human-attention and unread-result state with race-safe read acknowledgement", async () => {
    const root = await makeFixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    try {
      const user = await store.appendUserMessage({
        sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
        body: "@dev implement",
        now: "2026-07-09T00:00:00.000Z",
      });
      await store.claimNextPendingMessage({
        sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
        runId: "run-attention",
        now: "2026-07-09T00:00:01.000Z",
      });
      await store.recordAgentResponse({
        userMessageId: user.id,
        sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
        role: "dev",
        body: "结果已生成\n\n等待真人：请验收结果",
        runId: "run-attention",
        runDir: "/tmp/run-attention",
        now: "2026-07-09T00:00:02.000Z",
      });

      expect((await store.listSessions()).find((session) => session.sessionId === LOCAL_CONSOLE_DEFAULT_SESSION_ID)).toMatchObject({
        awaitsHumanReason: "acceptance",
        unreadSince: "2026-07-09T00:00:02.000Z",
        waitingCount: 1,
      });
      await expect(store.markSessionResultRead({
        sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
        unreadSince: "2026-07-09T00:00:01.000Z",
        now: "2026-07-09T00:00:03.000Z",
      })).resolves.toBe(false);
      await expect(store.markSessionResultRead({
        sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
        unreadSince: "2026-07-09T00:00:02.000Z",
        now: "2026-07-09T00:00:04.000Z",
      })).resolves.toBe(true);
      expect((await store.listSessions()).find((session) => session.sessionId === LOCAL_CONSOLE_DEFAULT_SESSION_ID)).toMatchObject({
        awaitsHumanReason: "acceptance",
        unreadSince: null,
      });

      await store.appendUserMessage({
        sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
        body: "验收反馈",
        now: "2026-07-09T00:00:05.000Z",
      });
      expect((await store.listSessions()).find((session) => session.sessionId === LOCAL_CONSOLE_DEFAULT_SESSION_ID)).toMatchObject({
        awaitsHumanReason: null,
        unreadSince: null,
      });
    } finally {
      await store.close();
    }

    const database = new DatabaseSync(sqlitePath);
    try {
      expect(() => database.prepare("UPDATE sessions SET awaits_human_reason = 'invalid' WHERE session_id = ?")
        .run(LOCAL_CONSOLE_DEFAULT_SESSION_ID)).toThrow();
    } finally {
      database.close();
    }
  });

  it("archives without consuming the handoff cursor, preserves attention state, and restores from the same position", async () => {
    const root = await makeFixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    try {
      const projectId = (await store.listProjects())[0]!.projectId;
      const target = await store.createSession({
        sessionId: "local:archive-target",
        projectId,
        title: "archive target",
        now: "2030-01-02T00:00:00.000Z",
      });
      const neighbor = await store.createSession({
        sessionId: "local:archive-neighbor",
        projectId,
        title: "archive neighbor",
        now: "2030-01-01T00:00:00.000Z",
      });
      const user = await store.appendUserMessage({
        sessionId: target.sessionId,
        body: "@dev prepare a handoff",
        now: "2030-01-02T00:00:01.000Z",
      });
      await store.claimNextPendingMessage({
        sessionId: target.sessionId,
        runId: "run-archive-user",
        now: "2030-01-02T00:00:02.000Z",
      });
      await store.recordAgentResponse({
        userMessageId: user.id,
        sessionId: target.sessionId,
        role: "dev",
        body: "@qa 请继续验收\n等待真人：请确认后续安排",
        runId: "run-archive-user",
        runDir: "/tmp/run-archive-user",
        now: "2030-01-02T00:00:03.000Z",
      });
      const handoff = await store.claimNextPendingMessage({
        sessionId: target.sessionId,
        runId: "run-archive-handoff",
        now: "2030-01-02T00:00:04.000Z",
      });
      expect(handoff).toMatchObject({ speaker: "agent", role: "dev", status: "displayed" });

      await expect(store.archiveSession!({
        sessionId: target.sessionId,
        now: "2030-01-02T00:00:05.000Z",
      })).resolves.toEqual({
        sessionId: target.sessionId,
        projectId,
        selectedSessionId: neighbor.sessionId,
      });
      expect((await store.listSessions()).map((session) => session.sessionId)).not.toContain(target.sessionId);

      const database = new DatabaseSync(sqlitePath, { readOnly: true });
      try {
        expect(database.prepare(
          `SELECT s.archived_at, s.awaits_human_reason, s.unread_since,
                  c.processed_through_message_id, c.active_message_id, c.active_run_id
           FROM sessions s JOIN local_message_cursors c ON c.session_id = s.session_id
           WHERE s.session_id = ?`,
        ).get(target.sessionId)).toMatchObject({
          archived_at: "2030-01-02T00:00:05.000Z",
          awaits_human_reason: "confirmation",
          unread_since: "2030-01-02T00:00:03.000Z",
          processed_through_message_id: user.id,
          active_message_id: null,
          active_run_id: null,
        });
      } finally {
        database.close();
      }

      await expect(store.claimNextPendingMessage({
        sessionId: target.sessionId,
        runId: "run-while-archived",
        now: "2030-01-02T00:00:06.000Z",
      })).resolves.toBeNull();
      await expect(store.restoreSession!({
        sessionId: target.sessionId,
        now: "2030-01-02T00:00:07.000Z",
      })).resolves.toMatchObject({
        sessionId: target.sessionId,
        awaitsHumanReason: "confirmation",
        unreadSince: "2030-01-02T00:00:03.000Z",
      });
      await expect(store.claimNextPendingMessage({
        sessionId: target.sessionId,
        runId: "run-restored-handoff",
        now: "2030-01-02T00:00:08.000Z",
      })).resolves.toMatchObject({ id: handoff!.id, speaker: "agent", role: "dev" });

      const running = await store.createSession({
        sessionId: "local:archive-running",
        projectId,
        title: "running",
        now: "2030-01-03T00:00:00.000Z",
      });
      await store.appendUserMessage({
        sessionId: running.sessionId,
        body: "@dev still running",
        now: "2030-01-03T00:00:01.000Z",
      });
      await store.claimNextPendingMessage({
        sessionId: running.sessionId,
        runId: "run-still-running",
        now: "2030-01-03T00:00:02.000Z",
      });
      await expect(store.archiveSession!({
        sessionId: running.sessionId,
        now: "2030-01-03T00:00:03.000Z",
      })).rejects.toMatchObject({ code: "SESSION_HAS_RUNNING_AGENT" });
    } finally {
      await store.close();
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

  it("persists local projects and rejects orphan local sessions atomically", async () => {
    const root = await makeFixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const folderPath = path.join(root, "workspace-a");
    await fs.mkdir(folderPath, { recursive: true });
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    try {
      const project = await store.createProject({
        folderPath,
        worktreeMode: true,
        now: "2026-07-09T00:00:00.000Z",
      });
      const session = await store.createSession({
        sessionId: "local:project-session",
        projectId: project.projectId,
        title: "project session",
        now: "2026-07-09T00:00:01.000Z",
      });
      await store.appendUserMessage({
        sessionId: session.sessionId,
        body: "@dev project message",
        now: "2026-07-09T00:00:02.000Z",
      });

      expect((await store.listProjects()).find((entry) => entry.projectId === project.projectId)).toMatchObject({
        title: "workspace-a",
        folderPath,
        worktreeMode: true,
        sessions: [expect.objectContaining({ sessionId: session.sessionId, projectId: project.projectId })],
      });
      await expect(
        store.createSession({
          sessionId: "local:missing-project",
          projectId: "missing-project",
          title: "bad",
          now: "2026-07-09T00:00:03.000Z",
        }),
      ).rejects.toThrow();
    } finally {
      await store.close();
    }

    const database = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      const good = database.prepare("SELECT session_id, project_id FROM sessions WHERE session_id = 'local:project-session'").get();
      expect(good).toMatchObject({ session_id: "local:project-session" });
      const orphan = database.prepare("SELECT session_id FROM sessions WHERE session_id = 'local:missing-project'").get();
      expect(orphan).toBeUndefined();
      const message = database.prepare("SELECT body FROM session_messages WHERE session_id = 'local:project-session'").get();
      expect(message).toMatchObject({ body: "@dev project message" });
    } finally {
      database.close();
    }
  });

  it("renames and removes a project without deleting its history, then re-adds the same path as a new project", async () => {
    const root = await makeFixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const folderPath = path.join(root, "removable-project");
    await fs.mkdir(folderPath, { recursive: true });
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    let removedProjectId = "";
    await store.init();
    try {
      const project = await store.createProject({
        folderPath,
        worktreeMode: false,
        now: "2026-07-20T00:00:00.000Z",
      });
      removedProjectId = project.projectId;
      const session = await store.createSession({
        sessionId: "local:removable-session",
        projectId: project.projectId,
        title: "kept history",
        now: "2026-07-20T00:00:01.000Z",
      });
      await store.appendUserMessage({
        sessionId: session.sessionId,
        body: "history survives removal",
        now: "2026-07-20T00:00:02.000Z",
      });

      await expect(store.renameProject!({
        projectId: project.projectId,
        title: "  显示名称  ",
        now: "2026-07-20T00:00:03.000Z",
      })).resolves.toMatchObject({ title: "显示名称", folderPath });
      await expect(store.renameProject!({
        projectId: project.projectId,
        title: "   ",
        now: "2026-07-20T00:00:04.000Z",
      })).resolves.toMatchObject({ title: "removable-project" });

      const claimed = await store.claimNextPendingMessage({
        sessionId: session.sessionId,
        runId: "run-removal",
        now: "2026-07-20T00:00:05.000Z",
      });
      expect(claimed).not.toBeNull();
      await expect(store.removeProject!({
        projectId: project.projectId,
        force: false,
        now: "2026-07-20T00:00:06.000Z",
      })).rejects.toThrow("PROJECT_HAS_RUNNING_AGENTS");
      expect((await store.listProjects()).some((candidate) => candidate.projectId === project.projectId)).toBe(true);

      await expect(store.removeProject!({
        projectId: project.projectId,
        force: true,
        now: "2026-07-20T00:00:07.000Z",
      })).resolves.toEqual({ projectId: project.projectId, archivedSessionIds: [session.sessionId] });
      expect((await store.listProjects()).some((candidate) => candidate.projectId === project.projectId)).toBe(false);
      expect((await store.listSessions()).some((candidate) => candidate.sessionId === session.sessionId)).toBe(false);
      expect(await store.listMessages(session.sessionId)).toEqual([
        expect.objectContaining({ body: "history survives removal" }),
      ]);
      const activeProjectIds = (await store.listProjects()).map((candidate) => candidate.projectId);
      await expect(store.reorderProjects([...activeProjectIds].reverse())).resolves.toHaveLength(activeProjectIds.length);

      const readded = await store.createProject({
        folderPath,
        worktreeMode: true,
        now: "2026-07-20T00:00:08.000Z",
      });
      expect(readded).toMatchObject({ folderPath, title: "removable-project", sessions: [] });
      expect(readded.projectId).not.toBe(project.projectId);
      expect((await store.listProjects())[0]?.projectId).toBe(readded.projectId);
    } finally {
      await store.close();
    }

    const database = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      expect(database.prepare("SELECT original_folder_path, removed_at FROM projects WHERE project_id = ?").get(
        removedProjectId,
      )).toMatchObject({ original_folder_path: folderPath, removed_at: "2026-07-20T00:00:07.000Z" });
      expect(database.prepare("SELECT archived_at FROM sessions WHERE session_id = ?").get("local:removable-session"))
        .toMatchObject({ archived_at: "2026-07-20T00:00:07.000Z" });
    } finally {
      database.close();
    }
  });

  it("persists explicit project order, keeps state updates stable, and places new projects first", async () => {
    const root = await makeFixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const folderA = path.join(root, "workspace-a");
    const folderB = path.join(root, "workspace-b");
    const folderC = path.join(root, "workspace-c");
    await Promise.all([folderA, folderB, folderC].map((folderPath) => fs.mkdir(folderPath, { recursive: true })));
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    const defaultProjectId = (await store.listProjects())[0]!.projectId;
    const projectA = await store.createProject({ folderPath: folderA, worktreeMode: false, now: "2026-07-09T00:00:01.000Z" });
    const projectB = await store.createProject({ folderPath: folderB, worktreeMode: false, now: "2026-07-09T00:00:02.000Z" });
    expect((await store.listProjects()).map((project) => project.projectId)).toEqual([
      projectB.projectId,
      projectA.projectId,
      defaultProjectId,
    ]);

    const explicitOrder = [projectA.projectId, defaultProjectId, projectB.projectId];
    await store.reorderProjects(explicitOrder);
    await store.updateProject({ projectId: projectB.projectId, worktreeMode: true, now: "2026-07-09T00:00:03.000Z" });
    expect((await store.listProjects()).map((project) => project.projectId)).toEqual(explicitOrder);
    await expect(store.reorderProjects([projectA.projectId, projectB.projectId])).rejects.toThrow(
      "project order must contain every active project exactly once",
    );
    await store.close();

    const reopened = await createSqliteLocalConsoleStore({ sqlitePath });
    await reopened.init();
    expect((await reopened.listProjects()).map((project) => project.projectId)).toEqual(explicitOrder);
    const projectC = await reopened.createProject({ folderPath: folderC, worktreeMode: false, now: "2026-07-09T00:00:04.000Z" });
    expect((await reopened.listProjects()).map((project) => project.projectId)).toEqual([
      projectC.projectId,
      ...explicitOrder,
    ]);
    await reopened.close();
  });

  it("repairs an unavailable project folder in place and rejects an active folder binding conflict", async () => {
    const root = await makeFixtureRoot();
    const oldFolder = path.join(root, "repair-old");
    const movedFolder = path.join(root, "repair-moved");
    const occupiedFolder = path.join(root, "repair-occupied");
    await fs.mkdir(oldFolder, { recursive: true });
    await fs.mkdir(occupiedFolder, { recursive: true });
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex: vi.fn(async (options: CodexRunOptions) => codexOk(options, "unused")),
      makeRunDir: (count) => path.join(root, "runs", `repair-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const project = await createProject(started.url, oldFolder, false);
      const session = await createProjectSession(started.url, "repair history", project.projectId);
      await createProject(started.url, occupiedFolder, false);
      await fs.rename(oldFolder, movedFolder);

      const unavailable = await getState(started.url, session.sessionId);
      expect(unavailable.project).toMatchObject({
        projectId: project.projectId,
        folderPath: oldFolder,
        directoryAvailable: false,
        directoryUnavailableReason: "当前项目本地文件夹未找到，可以指定新的文件夹",
      });

      const blockedSession = await fetch(new URL("/api/local-console/sessions", started.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "blocked", projectId: project.projectId }),
      });
      expect(blockedSession.status).toBe(409);
      await expect(blockedSession.json()).resolves.toMatchObject({ code: "PROJECT_DIRECTORY_UNAVAILABLE" });

      const blockedSend = await postSessionMessage(started.url, session.sessionId, "@dev blocked");
      expect(blockedSend.status).toBe(409);
      await expect(blockedSend.json()).resolves.toMatchObject({ code: "PROJECT_DIRECTORY_UNAVAILABLE" });

      const conflict = await repairProjectFolder(started.url, project.projectId, occupiedFolder);
      expect(conflict.status).toBe(409);
      await expect(conflict.json()).resolves.toMatchObject({ code: "PROJECT_FOLDER_ALREADY_BOUND" });
      expect((await getState(started.url, session.sessionId)).project.folderPath).toBe(oldFolder);

      const repaired = await repairProjectFolder(started.url, project.projectId, movedFolder);
      expect(repaired.status).toBe(200);
      await expect(repaired.json()).resolves.toMatchObject({
        project: {
          projectId: project.projectId,
          folderPath: movedFolder,
          directoryAvailable: true,
          sessions: [expect.objectContaining({ sessionId: session.sessionId })],
        },
      });
      const restored = await getState(started.url, session.sessionId);
      expect(restored.project).toMatchObject({
        projectId: project.projectId,
        folderPath: movedFolder,
        directoryAvailable: true,
      });
      expect(restored.project.sessions.map((entry) => entry.sessionId)).toContain(session.sessionId);
      await expect(createProjectSession(started.url, "restored", project.projectId)).resolves.toMatchObject({
        projectId: project.projectId,
      });
    } finally {
      await started.close();
    }
  });

  it("interrupts an in-place run when its project folder disappears", async () => {
    const root = await makeFixtureRoot();
    const folderPath = path.join(root, "direct-disappears");
    await fs.mkdir(folderPath, { recursive: true });
    await writeAgent(root, "dev", "# Dev\n\nROLE:dev");
    const runCodex = vi.fn(waitForAbortResult);
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `direct-disappears-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const project = await createProject(started.url, folderPath, false);
      const session = await createProjectSession(started.url, "direct disappears", project.projectId);
      await postSessionMessage(started.url, session.sessionId, "@dev keep running");
      await waitForState(started.url, session.sessionId, (state) => state.activeRun?.workspaceMode === "direct");

      await fs.rm(folderPath, { recursive: true });
      const unavailable = await getState(started.url, session.sessionId);
      expect(unavailable.project.directoryAvailable).toBe(false);
      const interrupted = await waitForState(started.url, session.sessionId, (state) =>
        state.messages.some((message) => message.status === "interrupted"),
      );
      expect(interrupted.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ status: "interrupted", error: "interrupted:project-directory-unavailable" }),
      ]));
      expect(runCodex).toHaveBeenCalledTimes(1);
    } finally {
      await started.close();
    }
  });

  it("lets a worktree finish its current step after source loss, then stops the handoff", async () => {
    const root = await makeFixtureRoot();
    const folderPath = path.join(root, "worktree-disappears");
    const movedFolder = path.join(root, "worktree-moved");
    await createGitRepo(folderPath);
    await writeAgent(root, "dev", "# Dev\n\nROLE:dev");
    await writeAgent(root, "qa", "# QA\n\nROLE:qa");
    const roles: string[] = [];
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => {
      roles.push(roleFromPrompt(options.prompt));
      await fs.rename(folderPath, movedFolder);
      return codexOk(options, "@qa verify next");
    });
    const started = await startLocalConsoleServer({
      projectRoot: root,
      workdirRoot: path.join(root, "workdir"),
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `worktree-disappears-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const project = await createProject(started.url, folderPath, true);
      const session = await createProjectSession(started.url, "worktree disappears", project.projectId);
      await postSessionMessage(started.url, session.sessionId, "@dev run once");
      const stopped = await waitForState(started.url, session.sessionId, (state) =>
        state.messages.some((message) => message.speaker === "system" && message.error === "PROJECT_DIRECTORY_UNAVAILABLE"),
      );
      expect(roles).toEqual(["dev"]);
      expect(stopped.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ speaker: "agent", role: "dev", body: "@qa verify next" }),
        expect.objectContaining({ speaker: "system", status: "failed", error: "PROJECT_DIRECTORY_UNAVAILABLE" }),
      ]));
      expect(stopped.project.directoryAvailable).toBe(false);
    } finally {
      await started.close();
    }
  });

  it("keeps sessions ordered by creation time when an older session is updated", async () => {
    const root = await makeFixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    try {
      await store.createSession({
        sessionId: "local:older",
        title: "older",
        now: "2099-07-09T00:00:00.000Z",
      });
      await store.createSession({
        sessionId: "local:newer",
        title: "newer",
        now: "2099-07-09T00:01:00.000Z",
      });
      await store.appendUserMessage({
        sessionId: "local:older",
        body: "updating an old session must not move it",
        now: "2099-07-09T00:02:00.000Z",
      });

      const orderedSessionIds = (await store.listSessions())
        .filter((session) => session.sessionId === "local:older" || session.sessionId === "local:newer")
        .map((session) => session.sessionId);
      expect(orderedSessionIds).toEqual(["local:newer", "local:older"]);

      const localProject = (await store.listProjects()).find((project) => project.projectId === LOCAL_CONSOLE_PROJECT_ID);
      expect(
        localProject?.sessions
          .filter((session) => session.sessionId === "local:older" || session.sessionId === "local:newer")
          .map((session) => session.sessionId),
      ).toEqual(["local:newer", "local:older"]);
    } finally {
      await store.close();
    }
  });

  it("backfills a missing session createdAt from its earliest message id", async () => {
    const root = await makeFixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    await fs.mkdir(path.dirname(sqlitePath), { recursive: true });
    const database = new DatabaseSync(sqlitePath);
    try {
      database.exec(`
        CREATE TABLE sessions (
          session_id TEXT PRIMARY KEY,
          project_id TEXT,
          source_type TEXT NOT NULL,
          source_owner TEXT,
          source_repo TEXT,
          source_issue_number INTEGER,
          parent_session_id TEXT,
          title TEXT,
          status TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE local_messages (
          id INTEGER PRIMARY KEY,
          session_id TEXT NOT NULL,
          speaker TEXT NOT NULL,
          role TEXT,
          body TEXT NOT NULL,
          status TEXT NOT NULL,
          run_id TEXT,
          run_dir TEXT,
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO sessions
          (session_id, project_id, source_type, title, status, updated_at)
        VALUES
          ('local:legacy', 'local', 'local', 'legacy', 'active', '2099-07-09T00:03:00.000Z');
        INSERT INTO local_messages
          (id, session_id, speaker, role, body, status, run_id, run_dir, error, created_at, updated_at)
        VALUES
          (20, 'local:legacy', 'user', NULL, 'later id', 'completed', NULL, NULL, NULL, '2099-07-09T00:01:00.000Z', '2099-07-09T00:01:00.000Z'),
          (10, 'local:legacy', 'user', NULL, 'earliest id', 'completed', NULL, NULL, NULL, '2099-07-09T00:02:00.000Z', '2099-07-09T00:02:00.000Z');
      `);
    } finally {
      database.close();
    }

    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    try {
      expect((await store.listSessions()).find((session) => session.sessionId === "local:legacy")?.createdAt)
        .toBe("2099-07-09T00:02:00.000Z");
    } finally {
      await store.close();
    }
  });

  it("uses the earliest legacy message id when migration synthesizes the default session", async () => {
    const root = await makeFixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    await fs.mkdir(path.dirname(sqlitePath), { recursive: true });
    const database = new DatabaseSync(sqlitePath);
    try {
      database.exec(`
        CREATE TABLE local_messages (
          id INTEGER PRIMARY KEY,
          session_id TEXT NOT NULL,
          speaker TEXT NOT NULL,
          role TEXT,
          body TEXT NOT NULL,
          status TEXT NOT NULL,
          run_id TEXT,
          run_dir TEXT,
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO local_messages
          (id, session_id, speaker, role, body, status, run_id, run_dir, error, created_at, updated_at)
        VALUES
          (20, 'default', 'user', NULL, 'later id', 'completed', NULL, NULL, NULL, '2099-07-09T00:01:00.000Z', '2099-07-09T00:01:00.000Z'),
          (10, 'default', 'user', NULL, 'earliest id', 'completed', NULL, NULL, NULL, '2099-07-09T00:02:00.000Z', '2099-07-09T00:02:00.000Z');
      `);
    } finally {
      database.close();
    }

    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    try {
      expect((await store.listSessions()).find((session) => session.sessionId === LOCAL_CONSOLE_DEFAULT_SESSION_ID)?.createdAt)
        .toBe("2099-07-09T00:02:00.000Z");
    } finally {
      await store.close();
    }
  });

  it("moves only empty unlinked local sessions and fails closed on either lineage source", async () => {
    const root = await makeFixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const targetFolder = path.join(root, "workspace-target");
    await fs.mkdir(targetFolder, { recursive: true });
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    const target = await store.createProject({
      folderPath: targetFolder,
      worktreeMode: false,
      now: "2026-07-09T01:00:00.000Z",
    });
    const sessionIds = ["movable", "with-message", "parent-column", "reverse-child", "edge-parent", "edge-child"];
    for (const sessionId of sessionIds) {
      await store.createSession({
        sessionId: `local:${sessionId}`,
        title: sessionId,
        now: "2026-07-09T01:00:01.000Z",
      });
    }
    await store.appendUserMessage({
      sessionId: "local:with-message",
      body: "history locks project",
      now: "2026-07-09T01:00:02.000Z",
    });

    const database = new DatabaseSync(sqlitePath);
    try {
      database.prepare("UPDATE sessions SET parent_session_id = ? WHERE session_id = ?")
        .run("local:missing-parent", "local:parent-column");
      database.prepare(
        `INSERT INTO sessions
          (session_id, project_id, source_type, parent_session_id, title, status, created_at, updated_at)
         VALUES (?, ?, 'local', ?, 'column-only-child', 'idle', ?, ?)`,
      ).run(
        "local:column-only-child",
        LOCAL_CONSOLE_PROJECT_ID,
        "local:reverse-child",
        "2026-07-09T01:00:03.000Z",
        "2026-07-09T01:00:03.000Z",
      );
      database.prepare(
        `INSERT INTO session_edges (parent_session_id, child_session_id, relation, hidden_key, created_at)
         VALUES (?, ?, 'task', 'edge-only', ?)`,
      ).run("local:edge-parent", "local:edge-child", "2026-07-09T01:00:04.000Z");
      database.prepare(
        `INSERT INTO sessions
          (session_id, project_id, source_type, title, status, created_at, updated_at)
         VALUES ('github:foreign', NULL, 'github', 'foreign', 'idle', ?, ?)`,
      ).run("2026-07-09T01:00:04.000Z", "2026-07-09T01:00:04.000Z");
    } finally {
      database.close();
    }

    await expect(store.moveEmptySessionToProject({
      sessionId: "local:movable",
      projectId: target.projectId,
      now: "2026-07-09T01:00:05.000Z",
    })).resolves.toMatchObject({ sessionId: "local:movable", projectId: target.projectId });

    for (const sessionId of ["with-message", "parent-column", "reverse-child", "edge-parent", "edge-child"]) {
      await expect(store.moveEmptySessionToProject({
        sessionId: `local:${sessionId}`,
        projectId: target.projectId,
        now: "2026-07-09T01:00:06.000Z",
      })).rejects.toMatchObject({ code: "SESSION_PROJECT_LOCKED" });
    }
    await expect(store.moveEmptySessionToProject({
      sessionId: "local:missing",
      projectId: target.projectId,
      now: "2026-07-09T01:00:06.000Z",
    })).rejects.toMatchObject({ code: "LOCAL_SESSION_NOT_FOUND" });
    await expect(store.moveEmptySessionToProject({
      sessionId: "github:foreign",
      projectId: target.projectId,
      now: "2026-07-09T01:00:06.000Z",
    })).rejects.toMatchObject({ code: "LOCAL_SESSION_NOT_FOUND" });
    await expect(store.moveEmptySessionToProject({
      sessionId: "local:parent-column",
      projectId: "missing-project",
      now: "2026-07-09T01:00:06.000Z",
    })).rejects.toMatchObject({ code: "LOCAL_PROJECT_NOT_FOUND" });

    const unchanged = (await store.listSessions()).filter((session) =>
      ["local:with-message", "local:parent-column", "local:reverse-child", "local:edge-parent", "local:edge-child"].includes(session.sessionId),
    );
    expect(unchanged.every((session) => session.projectId === LOCAL_CONSOLE_PROJECT_ID)).toBe(true);
    expect(await store.listMessages("local:with-message")).toHaveLength(1);
    await store.close();
  });

  it("maps session project rebinding API validation and domain failures to stable status codes", async () => {
    const root = await makeFixtureRoot();
    const store = await createSqliteLocalConsoleStore({ sqlitePath: path.join(root, ".state", "local-console.sqlite") });
    await store.init();
    const targetFolder = path.join(root, "api-target");
    await fs.mkdir(targetFolder, { recursive: true });
    const target = await store.createProject({ folderPath: targetFolder, worktreeMode: false, now: "2026-07-09T02:00:00.000Z" });
    await store.createSession({ sessionId: "local:api-empty", title: "api empty", now: "2026-07-09T02:00:01.000Z" });
    await store.createSession({ sessionId: "local:api-locked", title: "api locked", now: "2026-07-09T02:00:01.000Z" });
    await store.appendUserMessage({ sessionId: "local:api-locked", body: "locked", now: "2026-07-09T02:00:02.000Z" });

    const started = await startLocalConsoleServer({ projectRoot: root, port: 0, store, storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS });
    try {
      const invalidJson = await fetch(new URL("/api/local-console/sessions/local%3Aapi-empty/project", started.url), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      expect(invalidJson.status).toBe(400);
      await expect(invalidJson.json()).resolves.toMatchObject({ code: "INVALID_SESSION_PROJECT_REQUEST" });

      const invalidField = await fetch(new URL("/api/local-console/sessions/local%3Aapi-empty/project", started.url), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "" }),
      });
      expect(invalidField.status).toBe(400);
      await expect(invalidField.json()).resolves.toMatchObject({ code: "INVALID_SESSION_PROJECT_REQUEST" });

      const missingProject = await patchSessionProject(started.url, "local:api-empty", "missing-project");
      expect(missingProject.status).toBe(404);
      await expect(missingProject.json()).resolves.toMatchObject({ code: "LOCAL_PROJECT_NOT_FOUND" });

      const missingSession = await patchSessionProject(started.url, "local:missing", target.projectId);
      expect(missingSession.status).toBe(404);
      await expect(missingSession.json()).resolves.toMatchObject({ code: "LOCAL_SESSION_NOT_FOUND" });

      const locked = await patchSessionProject(started.url, "local:api-locked", target.projectId);
      expect(locked.status).toBe(409);
      await expect(locked.json()).resolves.toMatchObject({ code: "SESSION_PROJECT_LOCKED" });

      const moved = await patchSessionProject(started.url, "local:api-empty", target.projectId);
      expect(moved.status).toBe(200);
      await expect(moved.json()).resolves.toMatchObject({
        session: { sessionId: "local:api-empty", projectId: target.projectId },
      });
    } finally {
      await started.close();
    }
  });

  it("persists T5 child session and local fact records idempotently", async () => {
    const root = await makeFixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    try {
      await store.createSession({ sessionId: "local:parent", title: "parent", now: "2026-07-09T00:00:00.000Z" });
      const child = await createLocalChildSession(
        { sqlitePath },
        {
          parentSessionId: "local:parent",
          childSessionId: "local:child",
          projectId: LOCAL_CONSOLE_PROJECT_ID,
          title: "child task",
          relation: "task",
          hiddenKey: "child-key-1",
          initialRole: "dev",
          initialBody: "Initial handoff",
          now: "2026-07-09T00:00:01.000Z",
        },
      );
      const duplicate = await createLocalChildSession(
        { sqlitePath },
        {
          parentSessionId: "local:parent",
          childSessionId: "local:child-duplicate",
          projectId: LOCAL_CONSOLE_PROJECT_ID,
          title: "duplicate",
          relation: "task",
          hiddenKey: "child-key-1",
          initialRole: "dev",
          initialBody: "Should recover existing",
          now: "2026-07-09T00:00:02.000Z",
        },
      );
      expect(duplicate.sessionId).toBe(child.sessionId);

      await recordLocalRouteDecision(
        { sqlitePath },
        {
          sessionId: "local:parent",
          messageId: 1,
          routeKey: "route:1",
          outcome: "append",
          targetRole: "dev",
          reason: "goal-shape",
          now: "2026-07-09T00:00:03.000Z",
        },
      );
      await recordLocalAcceptanceFact(
        { sqlitePath },
        {
          sessionId: "local:child",
          taskId: "task-1",
          role: "product-manager",
          verdict: "passed",
          evidence: { lines: [1, 2] },
          now: "2026-07-09T00:00:04.000Z",
        },
      );
      await recordLocalIntegrationEvent(
        { sqlitePath },
        {
          sessionId: "local:parent",
          eventKey: "integration:1",
          status: "requested",
          detail: { child: "local:child" },
          now: "2026-07-09T00:00:05.000Z",
        },
      );
      await recordLocalDeadLetter(
        { sqlitePath },
        {
          sessionId: "local:parent",
          sourceMessageId: 1,
          failureCount: 5,
          reason: "exit-code-1",
          recovered: false,
          now: "2026-07-09T00:00:06.000Z",
        },
      );

      const sessions = await store.listSessions();
      expect(sessions.find((entry) => entry.sessionId === "local:parent")).toMatchObject({ childCount: 1 });
      expect(sessions.find((entry) => entry.sessionId === "local:child")).toMatchObject({
        parentSessionId: "local:parent",
      });
      const facts = await listLocalT5Facts({ sqlitePath });
      expect(facts.sessionEdges).toHaveLength(1);
      expect(facts.routeDecisions).toHaveLength(1);
      expect(facts.acceptanceFacts).toHaveLength(1);
      expect(facts.integrationEvents).toHaveLength(1);
      expect(facts.deadLetters).toHaveLength(1);
    } finally {
      await store.close();
    }
  });

  it("records local acceptance pass facts and parent integration before trigger handling", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# dev\n\nROLE:dev");
    await writeAgent(root, "product-manager", "# product-manager\n\nROLE:product-manager");
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    await store.createSession({ sessionId: "local:parent-accept", title: "parent", now: "2026-07-10T00:00:00.000Z" });
    await createLocalChildSession(
      { sqlitePath },
      {
        parentSessionId: "local:parent-accept",
        childSessionId: "local:child-accept",
        projectId: LOCAL_CONSOLE_PROJECT_ID,
        title: "child accept",
        relation: "task",
        hiddenKey: "accept-child-key",
        initialRole: "dev",
        initialBody: acceptanceChildBody(["跑 one → 应退出码 0", "跑 two → 应退出码 0"], "task-accept"),
        now: "2026-07-10T00:00:01.000Z",
      },
    );
    await appendDisplayedAgent(store, "local:child-accept", "product-manager", [
      "1. 通过 — one ok",
      "2. 通过 — two ok",
      "验收结论：通过",
      "@dev should-not-run",
    ].join("\n"), 2);
    await store.close();

    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "unexpected"));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      sqlitePath,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `accept-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      await started.runtime.processPending("local:child-accept");
      const facts = await listLocalT5Facts({ sqlitePath }, "local:child-accept");
      const parentFacts = await listLocalT5Facts({ sqlitePath }, "local:parent-accept");
      expect(facts.acceptanceFacts).toHaveLength(1);
      expect(facts.acceptanceFacts[0]).toMatchObject({ verdict: "passed", task_id: "task-accept", role: "product-manager" });
      expect(parentFacts.integrationEvents).toHaveLength(1);
      expect(runCodex).not.toHaveBeenCalled();
      const state = await getState(started.url, "local:child-accept");
      expect(state.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ speaker: "system", body: expect.stringContaining("本地验收事实已记录：通过") }),
      ]));
    } finally {
      await started.close();
    }
  });

  it("keeps failed acceptance history and routes latest repair recheck", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# dev\n\nROLE:dev");
    await writeAgent(root, "product-manager", "# product-manager\n\nROLE:product-manager");
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    await store.createSession({ sessionId: "local:parent-recheck", title: "parent", now: "2026-07-10T00:00:00.000Z" });
    await createLocalChildSession(
      { sqlitePath },
      {
        parentSessionId: "local:parent-recheck",
        childSessionId: "local:child-recheck",
        projectId: LOCAL_CONSOLE_PROJECT_ID,
        title: "child recheck",
        relation: "task",
        hiddenKey: "recheck-child-key",
        initialRole: "dev",
        initialBody: acceptanceChildBody(["跑 one → 应退出码 0"], "task-recheck"),
        now: "2026-07-10T00:00:01.000Z",
      },
    );
    const source = await appendDisplayedAgent(store, "local:child-recheck", "product-manager", [
      "1. 不通过 — one failed",
      "验收结论：不通过",
    ].join("\n"), 2);
    await store.close();

    const started = await startLocalConsoleServer({
      projectRoot: root,
      sqlitePath,
      port: 0,
      runCodex: vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "unexpected")),
      makeRunDir: (count) => path.join(root, "runs", `recheck-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      await started.runtime.processPending("local:child-recheck");
      let facts = await listLocalT5Facts({ sqlitePath }, "local:child-recheck");
      let parentFacts = await listLocalT5Facts({ sqlitePath }, "local:parent-recheck");
      expect(facts.acceptanceFacts).toHaveLength(1);
      expect(facts.acceptanceFacts[0]).toMatchObject({ verdict: "failed", superseded_at: null });
      expect(parentFacts.sessionEdges).toEqual(expect.arrayContaining([expect.objectContaining({ relation: "repair" })]));

      await started.runtime.close();
    } finally {
      await started.close().catch(() => {});
    }

    const store2 = await createSqliteLocalConsoleStore({ sqlitePath });
    await store2.init();
    await appendDisplayedAgent(store2, "local:child-recheck", "product-manager", [
      "1. 通过 — repair verified",
      "验收结论：通过",
    ].join("\n"), source.id + 10);
    await store2.close();

    const restarted = await startLocalConsoleServer({
      projectRoot: root,
      sqlitePath,
      port: 0,
      runCodex: vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "unexpected")),
      makeRunDir: (count) => path.join(root, "runs", `recheck-pass-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      await restarted.runtime.processPending("local:child-recheck");
      const facts = await listLocalT5Facts({ sqlitePath }, "local:child-recheck");
      const parentFacts = await listLocalT5Facts({ sqlitePath }, "local:parent-recheck");
      expect(facts.acceptanceFacts).toHaveLength(2);
      expect(facts.acceptanceFacts).toEqual(expect.arrayContaining([
        expect.objectContaining({ verdict: "failed", superseded_at: expect.any(String) }),
        expect.objectContaining({ verdict: "passed", superseded_at: null }),
      ]));
      expect(parentFacts.integrationEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({ status: "requested" }),
      ]));
    } finally {
      await restarted.close();
    }
  });

  it("diagnoses malformed acceptance without consuming same-message handoff", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# dev\n\nROLE:dev");
    await writeAgent(root, "qa", "# qa\n\nROLE:qa");
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    await store.createSession({ sessionId: "local:parent-format", title: "parent", now: "2026-07-10T00:00:00.000Z" });
    await createLocalChildSession(
      { sqlitePath },
      {
        parentSessionId: "local:parent-format",
        childSessionId: "local:child-format",
        projectId: LOCAL_CONSOLE_PROJECT_ID,
        title: "child format",
        relation: "task",
        hiddenKey: "format-child-key",
        initialRole: "dev",
        initialBody: acceptanceChildBody(["跑 one → 应退出码 0", "跑 two → 应退出码 0"], "task-format"),
        now: "2026-07-10T00:00:01.000Z",
      },
    );
    await appendDisplayedAgent(store, "local:child-format", "qa", [
      "1. 通过 — one ok",
      "验收结论：通过",
      "@dev should-not-run",
    ].join("\n"), 2);
    await store.close();

    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "unexpected"));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      sqlitePath,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `format-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      await started.runtime.processPending("local:child-format");
      const facts = await listLocalT5Facts({ sqlitePath }, "local:child-format");
      expect(facts.acceptanceFacts).toHaveLength(0);
      expect(runCodex).not.toHaveBeenCalled();
      const state = await getState(started.url, "local:child-format");
      expect(state.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ speaker: "system", body: expect.stringContaining("本地验收走查格式无法解析") }),
      ]));
    } finally {
      await started.close();
    }
  });

  it("blocks acceptance when formal statements are missing", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "qa", "# qa\n\nROLE:qa");
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    await store.createSession({ sessionId: "local:no-projection", title: "no projection", now: "2026-07-10T00:00:00.000Z" });
    await appendDisplayedAgent(store, "local:no-projection", "qa", [
      "1. 通过 — ok",
      "验收结论：通过",
    ].join("\n"), 1);
    await store.close();

    const started = await startLocalConsoleServer({
      projectRoot: root,
      sqlitePath,
      port: 0,
      runCodex: vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "unexpected")),
      makeRunDir: (count) => path.join(root, "runs", `blocked-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      await started.runtime.processPending("local:no-projection");
      const facts = await listLocalT5Facts({ sqlitePath }, "local:no-projection");
      expect(facts.acceptanceFacts).toHaveLength(0);
      const state = await getState(started.url, "local:no-projection");
      expect(state.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ speaker: "system", body: expect.stringContaining("未找到 formal acceptance statements") }),
      ]));
    } finally {
      await started.close();
    }
  });
  it("rejects cross-project local child sessions and hidden key collisions", async () => {
    const root = await makeFixtureRoot();
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const otherFolder = path.join(root, "other-project");
    await fs.mkdir(otherFolder, { recursive: true });
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    try {
      const otherProject = await store.createProject({
        folderPath: otherFolder,
        worktreeMode: false,
        now: "2026-07-09T00:00:00.000Z",
      });
      await store.createSession({ sessionId: "local:parent", title: "parent", now: "2026-07-09T00:00:01.000Z" });

      await expect(
        createLocalChildSession(
          { sqlitePath },
          {
            parentSessionId: "local:parent",
            childSessionId: "local:cross-project",
            projectId: otherProject.projectId,
            title: "bad child",
            relation: "task",
            hiddenKey: "hidden:cross-project",
            initialRole: "dev",
            initialBody: "bad",
            now: "2026-07-09T00:00:02.000Z",
          },
        ),
      ).rejects.toThrow(/project mismatch/u);

      const childA = await createLocalChildSession(
        { sqlitePath },
        {
          parentSessionId: "local:parent",
          childSessionId: "local:child-a",
          projectId: LOCAL_CONSOLE_PROJECT_ID,
          title: "child A",
          relation: "task",
          hiddenKey: "hidden:collision",
          initialRole: "dev",
          initialBody: "child A",
          now: "2026-07-09T00:00:03.000Z",
        },
      );

      const database = new DatabaseSync(sqlitePath);
      try {
        database
          .prepare(
            `INSERT INTO sessions
              (session_id, project_id, source_type, source_owner, source_repo, source_issue_number, parent_session_id, title, status, created_at, updated_at)
             VALUES ('local:child-b', ?, 'local', NULL, NULL, NULL, 'local:parent', 'child B', 'active', ?, ?)`,
          )
          .run(LOCAL_CONSOLE_PROJECT_ID, "2026-07-09T00:00:04.000Z", "2026-07-09T00:00:04.000Z");
        database
          .prepare(
            `INSERT INTO session_edges (parent_session_id, child_session_id, relation, hidden_key, created_at)
             VALUES ('local:parent', 'local:child-b', 'task', 'hidden:collision', ?)`,
          )
          .run("2026-07-09T00:00:04.000Z");
      } finally {
        database.close();
      }

      await expect(
        createLocalChildSession(
          { sqlitePath },
          {
            parentSessionId: "local:parent",
            childSessionId: "local:child-c",
            projectId: LOCAL_CONSOLE_PROJECT_ID,
            title: "child C",
            relation: "task",
            hiddenKey: "hidden:collision",
            initialRole: "dev",
            initialBody: "child C",
            now: "2026-07-09T00:00:05.000Z",
          },
        ),
      ).rejects.toThrow(/hidden key collision/u);

      expect((await store.listSessions()).find((entry) => entry.sessionId === "local:cross-project")).toBeUndefined();
      expect(childA).toMatchObject({ parentSessionId: "local:parent", projectId: LOCAL_CONSOLE_PROJECT_ID });
    } finally {
      await store.close();
    }
  });

  it("maps a local CEO child orchestration result to child sessions", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "ceo", "# CEO\n\nROLE:ceo");
    await writeAgent(root, "dev", "# Dev\n\nROLE:dev");
    await writeCeoScript(root, "milestone-spawn-child-issues", "spawn_child_issues");
    const ceoOutput = `${JSON.stringify({
      action: "spawn_child_issues",
      workflowId: "milestone-spawn-child-issues",
      summary: "spawn local children",
      groups: [{ id: "g-runtime-sqlite-serial", reason: "runtime sqlite serial" }],
      issues: [
        {
          ledgerTaskId: "task-a",
          groupId: "g-runtime-sqlite-serial",
          title: "Task A",
          description: "Implement task A",
          initialRole: "dev",
          qualityBaseline: "production",
          acceptanceStatements: ["跑 A → 应通过"],
          dependencies: [],
          provenance: "local test",
        },
        {
          ledgerTaskId: "task-b",
          groupId: "g-runtime-sqlite-serial",
          title: "Task B",
          description: "Implement task B",
          initialRole: "dev",
          qualityBaseline: "production",
          acceptanceStatements: ["跑 B → 应通过"],
          dependencies: ["task-a"],
          provenance: "local test",
        },
      ],
    })}\n\n<!-- agent-moebius:stage=in-progress -->`;
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, ceoOutput));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `child-orchestration-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const parent = await createSession(started.url, "parent goal");
      await postSessionMessage(started.url, parent.sessionId, "@ceo spawn child sessions");
      const state = await waitForState(started.url, parent.sessionId, (data) => {
        const sessions = data.projects.flatMap((project) => project.sessions);
        return sessions.filter((session) => session.parentSessionId === parent.sessionId).length === 2 &&
          data.messages.some((entry) => entry.body.includes("Local child session orchestration completed"));
      });
      const childSessions = state.projects.flatMap((project) => project.sessions).filter((session) => session.parentSessionId === parent.sessionId);
      expect(childSessions.map((session) => session.title).sort()).toEqual(["Task A", "Task B"]);
      expect(state.messages.some((entry) => entry.body.includes("Local child session orchestration completed"))).toBe(true);
      const facts = await listLocalT5Facts({ sqlitePath: started.sqlitePath }, parent.sessionId);
      expect(facts.sessionEdges).toHaveLength(2);
    } finally {
      await started.close();
    }
  }, 10_000);

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
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
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

  it("runs a non-git project in place and records worktree unavailable reason", async () => {
    const root = await makeFixtureRoot();
    const folderPath = path.join(root, "plain-folder");
    await fs.mkdir(folderPath, { recursive: true });
    await writeAgent(root, "dev", "# Dev\n\nROLE:dev");
    const cwdCalls: string[] = [];
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => {
      if (options.cwd === undefined) {
        throw new Error("codex cwd is required");
      }
      const cwd = options.cwd;
      cwdCalls.push(cwd);
      await fs.writeFile(path.join(cwd, "local-output.txt"), "changed", "utf8");
      return codexOk(options, "done in non git");
    });
    const started = await startLocalConsoleServer({
      projectRoot: root,
      workdirRoot: path.join(root, "workdir"),
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `non-git-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const project = await createProject(started.url, folderPath, true);
      const session = await createProjectSession(started.url, "plain", project.projectId);
      await postSessionMessage(started.url, session.sessionId, "@dev write in cwd");
      const state = await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.body === "done in non git"),
      );
      expect(cwdCalls).toEqual([folderPath]);
      expect(state.project).toMatchObject({
        projectId: project.projectId,
        folderPath,
        worktreeMode: true,
        worktreeUnavailableReason: "not-git-repository",
      });
      await expect(fs.readFile(path.join(folderPath, "local-output.txt"), "utf8")).resolves.toBe("changed");
      await expect(fs.stat(path.join(folderPath, ".git"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await started.close();
    }
  });

  it("generates a workspace diff fact after a successful git worktree run", async () => {
    const root = await makeFixtureRoot();
    const folderPath = path.join(root, "git-project");
    await createGitRepo(folderPath);
    await writeAgent(root, "dev", "# Dev\n\nROLE:dev");
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => {
      if (options.cwd === undefined) {
        throw new Error("codex cwd is required");
      }
      await fs.writeFile(path.join(options.cwd, "local-output.txt"), "changed", "utf8");
      return codexOk(options, "done in worktree\n\n<!-- agent-moebius:stage=code-verified -->");
    });
    const started = await startLocalConsoleServer({
      projectRoot: root,
      workdirRoot: path.join(root, "workdir"),
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `git-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const project = await createProject(started.url, folderPath, true);
      const session = await createProjectSession(started.url, "git", project.projectId);
      await postSessionMessage(started.url, session.sessionId, "@dev write in worktree");
      await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.body.includes("done in worktree")),
      );
      const facts = await listLocalT5Facts({ sqlitePath: started.sqlitePath }, session.sessionId);
      expect(facts.workspaceDiffs).toHaveLength(1);
      const [diff] = facts.workspaceDiffs as Array<{
        affected_files_json: string;
        original_repo_root: string;
        patch_path: string;
        status: string;
        worktree_path: string;
      }>;
      await expect(fs.realpath(diff.original_repo_root)).resolves.toBe(await fs.realpath(folderPath));
      expect(diff).toMatchObject({ status: "generated" });
      expect(JSON.parse(diff.affected_files_json) as string[]).toContain("local-output.txt");
      await expect(fs.readFile(diff.patch_path, "utf8")).resolves.toContain("local-output.txt");
      await expect(fs.stat(path.join(diff.worktree_path, "local-output.txt"))).resolves.toBeDefined();
      expect(await gitStatus(folderPath)).toBe("");
    } finally {
      await started.close();
    }
  });

  it("does not generate a returnable workspace diff for plan-written worktree runs", async () => {
    const root = await makeFixtureRoot();
    const folderPath = path.join(root, "git-project-plan");
    await createGitRepo(folderPath);
    await writeAgent(root, "dev", "# Dev\n\nROLE:dev");
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => {
      if (options.cwd === undefined) {
        throw new Error("codex cwd is required");
      }
      await fs.writeFile(path.join(options.cwd, "plan-output.txt"), "draft", "utf8");
      return codexOk(options, "plan only\n\n<!-- agent-moebius:stage=plan-written -->");
    });
    const started = await startLocalConsoleServer({
      projectRoot: root,
      workdirRoot: path.join(root, "workdir"),
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `git-plan-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const project = await createProject(started.url, folderPath, true);
      const session = await createProjectSession(started.url, "git plan", project.projectId);
      await postSessionMessage(started.url, session.sessionId, "@dev write plan in worktree");
      await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.body.includes("plan only")),
      );
      const facts = await listLocalT5Facts({ sqlitePath: started.sqlitePath }, session.sessionId);
      expect(facts.workspaceDiffs).toHaveLength(0);
      expect(await gitStatus(folderPath)).toBe("");
    } finally {
      await started.close();
    }
  });

  it("drains local agent handoffs without waiting for the fixed poll interval", async () => {
    const root = await makeFixtureRoot();
    for (const role of ["ceo", "dev-manager", "dev", "qa"]) {
      await writeAgent(root, role, `# ${role}\n\nROLE:${role}`);
    }
    const calls: Array<{ role: string; at: number }> = [];
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => {
      const role = roleFromPrompt(options.prompt);
      calls.push({ role, at: Date.now() });
      const next: Record<string, string> = {
        ceo: "@dev-manager please review",
        "dev-manager": "@dev please implement",
        dev: "@qa please test",
        qa: "QA done",
      };
      return codexOk(options, next[role] ?? "done");
    });
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const session = await createSession(started.url, "handoff");
      await postSessionMessage(started.url, session.sessionId, "@ceo 我想做 X");
      const state = await waitForState(started.url, session.sessionId, (data) =>
        data.messages.filter((entry) => entry.speaker === "agent").length === 4,
      );
      expect(state.messages.filter((entry) => entry.speaker === "agent").map((entry) => entry.role)).toEqual([
        "ceo",
        "dev-manager",
        "dev",
        "qa",
      ]);
      expect(calls.map((entry) => entry.role)).toEqual(["ceo", "dev-manager", "dev", "qa"]);
      for (let index = 1; index < calls.length; index += 1) {
        expect(calls[index]!.at - calls[index - 1]!.at).toBeLessThan(1_000);
      }
    } finally {
      await started.close();
    }
  }, 10_000);

  it("stops an already-claimed handoff drain on archive and resumes that handoff only after restore", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "qa", "# QA\n\nROLE:qa");
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    const user = await store.appendUserMessage({
      sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
      body: "@dev prepare QA",
      now: "2026-07-20T00:00:00.000Z",
    });
    await store.claimNextPendingMessage({
      sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
      runId: "run-seed",
      now: "2026-07-20T00:00:01.000Z",
    });
    await store.recordAgentResponse({
      userMessageId: user.id,
      sessionId: LOCAL_CONSOLE_DEFAULT_SESSION_ID,
      role: "dev",
      body: "@qa 请继续验收",
      runId: "run-seed",
      runDir: "/tmp/run-seed",
      now: "2026-07-20T00:00:02.000Z",
    });

    const releaseAgentList = deferred<LocalConsoleAgentFile[]>();
    let listCallCount = 0;
    const listAgentFiles = vi.fn(async () => {
      listCallCount += 1;
      if (listCallCount === 1) {
        return await releaseAgentList.promise;
      }
      return [{ name: "qa", path: path.join(root, "agents", "qa.md") }];
    });
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "QA resumed"));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      store,
      listAgentFiles,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `archive-handoff-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      await waitFor(() => listAgentFiles.mock.calls.length === 1);
      const archive = await fetch(
        new URL(`/api/local-console/sessions/${encodeURIComponent(LOCAL_CONSOLE_DEFAULT_SESSION_ID)}/archive`, started.url),
        { method: "POST" },
      );
      expect(archive.status).toBe(200);
      releaseAgentList.resolve([{ name: "qa", path: path.join(root, "agents", "qa.md") }]);
      await waitFor(() => !(started.runtime as unknown as { processingSessions: Set<string> }).processingSessions.has(
        LOCAL_CONSOLE_DEFAULT_SESSION_ID,
      ));
      expect(runCodex).not.toHaveBeenCalled();

      const restore = await fetch(
        new URL(`/api/local-console/sessions/${encodeURIComponent(LOCAL_CONSOLE_DEFAULT_SESSION_ID)}/restore`, started.url),
        { method: "POST" },
      );
      expect(restore.status).toBe(200);
      const state = await waitForState(started.url, LOCAL_CONSOLE_DEFAULT_SESSION_ID, (data) =>
        data.messages.some((message) => message.speaker === "agent" && message.role === "qa" && message.body === "QA resumed"),
      );
      expect(runCodex).toHaveBeenCalledTimes(1);
      expect(state.messages.filter((message) => message.speaker === "agent").map((message) => message.role)).toEqual(["dev", "qa"]);
    } finally {
      await started.close();
    }
  });

  it("routes a clear local handoff without mention through a visible CEO handoff and next-drain trigger", async () => {
    const root = await makeFixtureRoot();
    for (const role of ["ceo", "dev"]) {
      await writeAgent(root, role, `# ${role}\n\nROLE:${role}`);
    }
    const routeJudgment = vi.fn(async () => ({
      action: "APPEND" as const,
      body: "@dev 请继续处理本地交棒。",
      targetRole: "dev",
      reason: "appended" as const,
    }));
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "dev handled local route"));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      routeJudgment,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `route-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const session = await createSession(started.url, "local route");
      await postSessionMessage(started.url, session.sessionId, "交给 dev 继续处理");
      const state = await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.role === "dev"),
      );
      expect(routeJudgment).toHaveBeenCalledTimes(1);
      expect(runCodex).toHaveBeenCalledTimes(1);
      expect(state.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ speaker: "agent", role: "ceo", body: "@dev 请继续处理本地交棒。" }),
          expect.objectContaining({ speaker: "agent", role: "dev", body: "dev handled local route" }),
        ]),
      );
      const facts = await listLocalT5Facts({ sqlitePath: started.sqlitePath }, session.sessionId);
      expect(facts.routeDecisions).toEqual([
        expect.objectContaining({ outcome: "append", target_role: "dev", route_key: expect.stringMatching(/^local-message:/) }),
      ]);
    } finally {
      await started.close();
    }
  }, 10_000);

  it("dedupes repeated local no-mention route processing by local message key", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# dev\n\nROLE:dev");
    const routeJudgment = vi.fn(async () => ({
      action: "APPEND" as const,
      body: "@dev 请继续处理。",
      targetRole: "dev",
      reason: "appended" as const,
    }));
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "dev once"));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      routeJudgment,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `dedupe-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const session = await createSession(started.url, "dedupe route");
      await postSessionMessage(started.url, session.sessionId, "交给 dev");
      await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.role === "dev"),
      );
      await started.runtime.processPending(session.sessionId);
      await started.runtime.processPending(session.sessionId);
      const state = await getState(started.url, session.sessionId);
      expect(routeJudgment).toHaveBeenCalledTimes(1);
      expect(runCodex).toHaveBeenCalledTimes(1);
      expect(state.messages.filter((entry) => entry.speaker === "agent" && entry.role === "ceo")).toHaveLength(1);
      expect(state.messages.filter((entry) => entry.speaker === "agent" && entry.role === "dev")).toHaveLength(1);
      const facts = await listLocalT5Facts({ sqlitePath: started.sqlitePath }, session.sessionId);
      expect(facts.routeDecisions).toHaveLength(1);
    } finally {
      await started.close();
    }
  }, 10_000);

  it("keeps a clear local handoff retryable when route append has multiple legal mentions", async () => {
    const root = await makeFixtureRoot();
    for (const role of ["dev", "qa"]) {
      await writeAgent(root, role, `# ${role}\n\nROLE:${role}`);
    }
    const routeJudgment = vi.fn(async () => ({
      action: "APPEND" as const,
      body: "@dev 和 @qa 都看一下",
      targetRole: "dev",
      reason: "appended" as const,
    }));
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "should not run"));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      routeJudgment,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `invalid-route-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const session = await createSession(started.url, "invalid route");
      await postSessionMessage(started.url, session.sessionId, "交给 dev");
      await waitFor(() => routeJudgment.mock.calls.length === 1);
      await started.runtime.processPending(session.sessionId);
      await waitFor(() => routeJudgment.mock.calls.length === 2);
      const state = await getState(started.url, session.sessionId);
      expect(routeJudgment).toHaveBeenCalledTimes(2);
      expect(runCodex).not.toHaveBeenCalled();
      expect(state.messages.filter((entry) => entry.speaker === "agent")).toHaveLength(0);
      expect(state.messages.filter((entry) => entry.speaker === "user" && entry.status === "pending")).toHaveLength(1);
      const facts = await listLocalT5Facts({ sqlitePath: started.sqlitePath }, session.sessionId);
      expect(facts.routeDecisions).toHaveLength(0);
    } finally {
      await started.close();
    }
  }, 10_000);

  it("keeps a clear local handoff retryable when route append has no legal mention", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# dev\n\nROLE:dev");
    const routeJudgment = vi.fn(async () => ({
      action: "APPEND" as const,
      body: "请 dev 看一下",
      targetRole: "dev",
      reason: "appended" as const,
    }));
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "should not run"));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      routeJudgment,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `missing-mention-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const session = await createSession(started.url, "missing mention route");
      await postSessionMessage(started.url, session.sessionId, "请交给 dev");
      await waitFor(() => routeJudgment.mock.calls.length === 1);
      const state = await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "user" && entry.status === "pending"),
      );
      expect(routeJudgment).toHaveBeenCalledTimes(1);
      expect(runCodex).not.toHaveBeenCalled();
      expect(state.messages.filter((entry) => entry.speaker === "agent")).toHaveLength(0);
      expect(state.messages.filter((entry) => entry.speaker === "user" && entry.status === "pending")).toHaveLength(1);
      const facts = await listLocalT5Facts({ sqlitePath: started.sqlitePath }, session.sessionId);
      expect(facts.routeDecisions).toHaveLength(0);
    } finally {
      await started.close();
    }
  }, 10_000);

  it("retries a local route append when the visible handoff transaction fails before commit", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# dev\n\nROLE:dev");
    const inner = await createSqliteLocalConsoleStore({ sqlitePath: path.join(root, ".state", "local-console.sqlite") });
    const store = new FailOnceRecordRouteAppendStore(inner);
    const routeJudgment = vi.fn(async () => ({
      action: "APPEND" as const,
      body: "@dev 请继续处理。",
      targetRole: "dev",
      reason: "appended" as const,
    }));
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "dev after retry"));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      store,
      routeJudgment,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `route-write-fail-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const session = await createSession(started.url, "route write retry");
      await postSessionMessage(started.url, session.sessionId, "交给 dev");
      await waitFor(() => routeJudgment.mock.calls.length === 1);
      let state = await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "user" && entry.status === "pending"),
      );
      expect(state.messages.filter((entry) => entry.speaker === "agent")).toHaveLength(0);
      expect(state.messages.filter((entry) => entry.speaker === "user" && entry.status === "pending")).toHaveLength(1);
      expect(await listLocalT5Facts({ sqlitePath: started.sqlitePath }, session.sessionId)).toMatchObject({ routeDecisions: [] });

      await started.runtime.processPending(session.sessionId);
      state = await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.role === "dev"),
      );
      expect(routeJudgment).toHaveBeenCalledTimes(2);
      expect(runCodex).toHaveBeenCalledTimes(1);
      expect(state.messages.filter((entry) => entry.speaker === "agent" && entry.role === "ceo")).toHaveLength(1);
      expect(state.messages.filter((entry) => entry.speaker === "agent" && entry.role === "dev")).toHaveLength(1);
      const facts = await listLocalT5Facts({ sqlitePath: started.sqlitePath }, session.sessionId);
      expect(facts.routeDecisions).toEqual([
        expect.objectContaining({ outcome: "append", target_role: "dev", route_key: expect.stringMatching(/^local-message:/) }),
      ]);
    } finally {
      await started.close();
    }
  }, 10_000);

  it("rejects an invalid route append body from the default local CEO adapter before saving a route decision", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "ceo", "# CEO\n\nRoute local messages.");
    for (const role of ["dev", "qa"]) {
      await writeAgent(root, role, `# ${role}\n\nROLE:${role}`);
    }
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => {
      if (options.prompt.includes("local-console no-trigger")) {
        return codexOk(options, JSON.stringify({ action: "append", body: "@dev 和 @qa 都看一下" }));
      }
      return codexOk(options, "should not run");
    });
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `default-invalid-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const session = await createSession(started.url, "default invalid route");
      await postSessionMessage(started.url, session.sessionId, "交给 dev");
      await waitFor(() => runCodex.mock.calls.length === 1);
      const state = await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "user" && entry.status === "pending"),
      );
      expect(runCodex).toHaveBeenCalledTimes(1);
      expect(state.messages.filter((entry) => entry.speaker === "agent")).toHaveLength(0);
      const facts = await listLocalT5Facts({ sqlitePath: started.sqlitePath }, session.sessionId);
      expect(facts.routeDecisions).toHaveLength(0);
    } finally {
      await started.close();
    }
  }, 10_000);

  it("silently advances an agent reply with no valid trigger once", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "ceo", "# ceo\n\nROLE:ceo");
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "no handoff"));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const session = await createSession(started.url, "no trigger agent");
      await postSessionMessage(started.url, session.sessionId, "@ceo stop here");
      await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.role === "ceo"),
      );
      await started.runtime.processPending(session.sessionId);
      await started.runtime.processPending(session.sessionId);
      const state = await getState(started.url, session.sessionId);
      expect(runCodex).toHaveBeenCalledTimes(1);
      expect(state.messages.filter((entry) => entry.speaker === "system" && entry.body.includes("No valid agent mention"))).toHaveLength(0);
    } finally {
      await started.close();
    }
  });

  it("resumes from a committed agent reply after restart without repeating the completed role", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# dev\n\nROLE:dev");
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    const session = await store.createSession({
      sessionId: "local:committed-agent",
      title: "committed agent",
      now: "2026-07-09T00:00:00.000Z",
    });
    const user = await store.appendUserMessage({
      sessionId: session.sessionId,
      body: "@ceo first",
      now: "2026-07-09T00:00:01.000Z",
    });
    await store.claimNextPendingMessage({
      sessionId: session.sessionId,
      runId: "run-ceo",
      now: "2026-07-09T00:00:02.000Z",
    });
    await store.recordAgentResponse({
      userMessageId: user.id,
      sessionId: session.sessionId,
      role: "ceo",
      body: "@dev continue",
      runId: "run-ceo",
      runDir: path.join(root, "runs", "ceo"),
      now: "2026-07-09T00:00:03.000Z",
    });
    await store.close();

    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "dev done"));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      sqlitePath,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `restart-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const state = await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.role === "dev"),
      );
      expect(state.messages.filter((entry) => entry.speaker === "agent").map((entry) => entry.role)).toEqual(["ceo", "dev"]);
      expect(runCodex).toHaveBeenCalledTimes(1);
    } finally {
      await started.close();
    }
  });

  it("releases the trigger for retry when recording an agent response fails before commit", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# dev\n\nROLE:dev");
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const innerStore = await createSqliteLocalConsoleStore({ sqlitePath });
    const store = new FailOnceRecordAgentResponseStore(innerStore);
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => codexOk(options, "dev done"));
    const started = await startLocalConsoleServer({
      projectRoot: root,
      sqlitePath,
      port: 0,
      store,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const session = await createSession(started.url, "record failure");
      await postSessionMessage(started.url, session.sessionId, "@dev retry me");
      await waitFor(() => runCodex.mock.calls.length === 1);
      await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "user" && entry.status === "pending"),
      );
      expect((await getState(started.url, session.sessionId)).messages.filter((entry) => entry.speaker === "agent")).toHaveLength(0);

      await started.runtime.processPending(session.sessionId);
      const state = await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.role === "dev"),
      );
      expect(runCodex).toHaveBeenCalledTimes(2);
      expect(state.messages.filter((entry) => entry.speaker === "agent")).toHaveLength(1);
    } finally {
      await started.close();
    }
  });

  it("records a stuck handoff run and lets later local messages continue", async () => {
    const root = await makeFixtureRoot();
    for (const role of ["ceo", "dev", "qa"]) {
      await writeAgent(root, role, `# ${role}\n\nROLE:${role}`);
    }
    const runCodex = vi.fn(async (options: CodexRunOptions): Promise<CodexRunResult> => {
      const role = roleFromPrompt(options.prompt);
      if (role === "ceo") {
        return codexOk(options, "@dev continue");
      }
      if (role === "dev") {
        return {
          ok: false,
          reason: "max-duration-timeout:20ms",
          runDir: options.runDir,
          stdoutPath: path.join(options.runDir, "stdout.jsonl"),
          stderrPath: path.join(options.runDir, "stderr.log"),
        };
      }
      return codexOk(options, "qa after stuck");
    });
    const started = await startLocalConsoleServer({
      projectRoot: root,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
      codexMaxDurationMs: 20,
    });
    try {
      const session = await createSession(started.url, "stuck handoff");
      await postSessionMessage(started.url, session.sessionId, "@ceo start");
      await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.status === "stuck" && entry.error === "max-duration-timeout:20ms"),
      );

      const next = await postSessionMessage(started.url, session.sessionId, "@qa after stuck");
      expect(next.status).toBe(202);
      const state = await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.role === "qa"),
      );
      expect(state.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ speaker: "system", body: "Codex stuck: max-duration-timeout:20ms" }),
          expect.objectContaining({ speaker: "agent", role: "qa", body: "qa after stuck" }),
        ]),
      );
    } finally {
      await started.close();
    }
  }, 10_000);

  it("runs startup catch-up for another session while one session is slow", async () => {
    const root = await makeFixtureRoot();
    await writeAgent(root, "dev", "# dev\n\nROLE:dev");
    const sqlitePath = path.join(root, ".state", "local-console.sqlite");
    const store = await createSqliteLocalConsoleStore({ sqlitePath });
    await store.init();
    const sessionA = await store.createSession({
      sessionId: "local:slow-a",
      title: "slow A",
      now: "2026-07-09T00:00:00.000Z",
    });
    const sessionB = await store.createSession({
      sessionId: "local:fast-b",
      title: "fast B",
      now: "2026-07-09T00:00:00.000Z",
    });
    await store.appendUserMessage({
      sessionId: sessionA.sessionId,
      body: "@dev slow startup",
      now: "2026-07-09T00:00:01.000Z",
    });
    await store.appendUserMessage({
      sessionId: sessionB.sessionId,
      body: "@dev fast startup",
      now: "2026-07-09T00:00:02.000Z",
    });
    await store.close();

    const runCodex = vi.fn((options: CodexRunOptions): Promise<CodexRunResult> => {
      if (options.prompt.includes("slow startup")) {
        return waitForAbortResult(options);
      }
      return Promise.resolve(codexOk(options, "fast done"));
    });
    const started = await startLocalConsoleServer({
      projectRoot: root,
      sqlitePath,
      port: 0,
      runCodex,
      makeRunDir: (count) => path.join(root, "runs", `startup-${String(count)}`),
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      const fastState = await waitForState(started.url, sessionB.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "agent" && entry.body === "fast done"),
      );
      const slowState = await waitForState(started.url, sessionA.sessionId, (data) => data.activeRun !== null);
      expect(fastState.messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ speaker: "agent", role: "dev", body: "fast done" })]),
      );
      expect(slowState.activeRun).toMatchObject({ sessionId: sessionA.sessionId, interruptible: true });
      await interruptRun(started.url, sessionA.sessionId, slowState.activeRun?.runId ?? "");
      await waitForState(started.url, sessionA.sessionId, (data) =>
        data.messages.some((entry) => entry.status === "interrupted"),
      );
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
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
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
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
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
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
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

  it("dead-letters repeated Codex failures with run metadata and restores them after restart", async () => {
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
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
      failureRetryLimit: 2,
    });
    const session = await createSession(started.url, "failure");
    try {
      await postSessionMessage(started.url, session.sessionId, "@dev fail");
      await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "user" && entry.status === "pending" && entry.error === "exit:42"),
      );
      await started.runtime.processPending(session.sessionId);
      await waitForState(started.url, session.sessionId, (data) =>
        data.messages.some((entry) => entry.speaker === "system" && entry.body.includes("Local dead-letter")),
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
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
      failureRetryLimit: 2,
    });
    try {
      const state = await getState(restarted.url, session.sessionId);
      expect(state.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: "failed", error: "exit:42", runDir: path.join(root, "runs", "run-1") }),
          expect.objectContaining({ speaker: "system", body: expect.stringContaining("Local dead-letter"), error: "exit:42" }),
        ]),
      );
      expect(state.messages.filter((entry) => entry.speaker === "system" && entry.body.includes("Local dead-letter"))).toHaveLength(1);
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
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
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
      storeTimeoutMs: STANDARD_STORE_TIMEOUT_MS,
    });
    try {
      await postMessage(started.url, "@dev slow");
      await waitForSnapshot(started.url, (data) => data.status === "running");
      await waitFor(() => runCodex.mock.calls.length === 1);

      const archive = await fetch(
        new URL(`/api/local-console/sessions/${encodeURIComponent(LOCAL_CONSOLE_DEFAULT_SESSION_ID)}/archive`, started.url),
        { method: "POST" },
      );
      expect(archive.status).toBe(409);
      await expect(archive.json()).resolves.toMatchObject({ code: "SESSION_HAS_RUNNING_AGENT" });

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

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function makeFixtureRoot(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-local-console-"));
}

async function createGitRepo(folderPath: string): Promise<void> {
  await fs.mkdir(folderPath, { recursive: true });
  await runGit(folderPath, ["init"]);
  await runGit(folderPath, ["config", "user.email", "local-console@example.test"]);
  await runGit(folderPath, ["config", "user.name", "Local Console"]);
  await fs.writeFile(path.join(folderPath, "README.md"), "initial\n", "utf8");
  await runGit(folderPath, ["add", "README.md"]);
  await runGit(folderPath, ["commit", "-m", "initial"]);
}

async function gitStatus(folderPath: string): Promise<string> {
  return (await runGit(folderPath, ["status", "--short"])).stdout.trim();
}

async function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`git timeout: ${args.join(" ")}`));
    }, 5_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
    });
  });
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

async function writeCeoScript(root: string, id: string, action: string): Promise<void> {
  const scriptsDir = path.join(root, "agents", "ceo-scripts");
  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.writeFile(
    path.join(scriptsDir, `${id}.md`),
    `---\nid: ${id}\naction: ${action}\ntitle: ${id}\n---\nLocal test script.\n`,
    "utf8",
  );
}

async function appendDisplayedAgent(
  store: LocalConsoleStore,
  sessionId: string,
  role: string,
  body: string,
  offsetSeconds: number,
): Promise<LocalConsoleMessage> {
  const existingMessages = await store.listMessages(sessionId);
  const hasPendingInitialHandoff = existingMessages.some(
    (message) => message.speaker === "user" && message.status === "pending" && message.body.includes("Acceptance statements:"),
  );
  if (hasPendingInitialHandoff) {
    const initial = await store.claimNextPendingMessage({
      sessionId,
      runId: `run-initial-${String(offsetSeconds)}`,
      now: localTestNow(offsetSeconds),
    });
    expect(initial).not.toBeNull();
    await store.recordSystemAndComplete({
      userMessageId: initial!.id,
      sessionId,
      body: "Initial handoff completed in fixture",
      runId: `run-initial-${String(offsetSeconds)}`,
      runDir: `/tmp/run-initial-${String(offsetSeconds)}`,
      now: localTestNow(offsetSeconds + 1),
    });
  }
  const user = await store.appendUserMessage({
    sessionId,
    body: `@${role} 请验收`,
    now: localTestNow(offsetSeconds + 2),
  });
  const claimed = await store.claimNextPendingMessage({
    sessionId,
    runId: `run-${String(offsetSeconds)}`,
    now: localTestNow(offsetSeconds + 3),
  });
  expect(claimed?.id).toBe(user.id);
  await store.recordAgentResponse({
    userMessageId: user.id,
    sessionId,
    role,
    body,
    runId: `run-${String(offsetSeconds)}`,
    runDir: `/tmp/run-${String(offsetSeconds)}`,
    now: localTestNow(offsetSeconds + 4),
  });
  const messages = await store.listMessages(sessionId);
  const agent = messages.find((message) => message.speaker === "agent" && message.role === role && message.body === body);
  expect(agent).toBeDefined();
  return agent!;
}

function acceptanceChildBody(statements: string[], taskId: string): string {
  return [
    `Ledger task id: ${taskId}`,
    "",
    "Acceptance statements:",
    ...statements.map((statement, index) => `${index + 1}. ${statement}`),
    "",
    "Initial handoff:",
    "@dev 请实现。",
  ].join("\n");
}

function localTestNow(offsetSeconds: number): string {
  return new Date(Date.UTC(2026, 6, 10, 0, 0, offsetSeconds)).toISOString();
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
    failureCount: 0,
    lastFailureReason: null,
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

async function createProjectSession(url: string, title: string, projectId: string): Promise<LocalConsoleSessionSummary> {
  const response = await fetch(new URL("/api/local-console/sessions", url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, projectId }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { session: LocalConsoleSessionSummary };
  return body.session;
}

async function createProject(url: string, folderPath: string, worktreeMode: boolean): Promise<LocalConsoleProjectSummary> {
  const response = await fetch(new URL("/api/local-console/projects", url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ folderPath, worktreeMode }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { project: LocalConsoleProjectSummary };
  return body.project;
}

async function postSessionMessage(url: string, sessionId: string, body: string): Promise<Response> {
  return await fetch(new URL(`/api/local-console/sessions/${encodeURIComponent(sessionId)}/messages`, url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

async function patchSessionProject(url: string, sessionId: string, projectId: string): Promise<Response> {
  return await fetch(new URL(`/api/local-console/sessions/${encodeURIComponent(sessionId)}/project`, url), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
}

async function repairProjectFolder(url: string, projectId: string, folderPath: string): Promise<Response> {
  return await fetch(new URL(`/api/local-console/projects/${encodeURIComponent(projectId)}`, url), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ folderPath }),
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
  projects: Array<{
    projectId: string;
    title: string;
    folderPath: string;
    worktreeMode: boolean;
    worktreeUnavailableReason: string | null;
    directoryAvailable?: boolean;
    directoryUnavailableReason?: string | null;
    sessions: LocalConsoleSessionSummary[];
  }>;
  project: {
    projectId: string;
    title: string;
    folderPath: string;
    worktreeMode: boolean;
    worktreeUnavailableReason: string | null;
    directoryAvailable?: boolean;
    directoryUnavailableReason?: string | null;
    sessions: LocalConsoleSessionSummary[];
  };
  selectedProjectId: string;
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
  cwd: string | null;
  workspaceMode: "direct" | "worktree" | null;
  worktreeUnavailableReason: string | null;
  lastOutputSummary: string;
  interruptible: boolean;
}

function fakeCommandScript(logPath: string, name: string): string {
  return `#!/bin/sh
printf '%s %s\\n' '${name}' "$*" >> '${logPath}'
exit 0
`;
}

function roleFromPrompt(prompt: string): string {
  for (const role of ["ceo", "dev-manager", "dev", "qa"]) {
    if (prompt.includes(`ROLE:${role}`)) {
      return role;
    }
  }
  throw new Error(`Unable to detect role from prompt: ${prompt.slice(0, 160)}`);
}

function codexOk(options: CodexRunOptions, finalText: string): CodexRunResult {
  return {
    ok: true,
    finalText,
    threadId: null,
    cachedInputTokens: null,
    runDir: options.runDir,
    stdoutPath: path.join(options.runDir, "stdout.jsonl"),
    stderrPath: path.join(options.runDir, "stderr.log"),
  };
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
    projectId: LOCAL_CONSOLE_PROJECT_ID,
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
    awaitsHumanReason: null,
    unreadSince: null,
    runningCount,
    waitingCount: 0,
    stuckCount,
    errorCount,
    interruptedCount,
    workspaceMode: "direct",
    workspacePendingMode: null,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}

function buildProjectSummary(
  sessions: LocalConsoleSessionSummary[] = [buildSessionSummary(LOCAL_CONSOLE_DEFAULT_SESSION_ID)],
  input: { worktreeMode?: boolean; folderPath?: string } = {},
): LocalConsoleProjectSummary {
  return {
    projectId: LOCAL_CONSOLE_PROJECT_ID,
    sourceType: "local-folder",
    title: "agent-moebius",
    folderPath: input.folderPath ?? process.cwd(),
    worktreeMode: input.worktreeMode ?? false,
    workspaceCwd: input.folderPath ?? process.cwd(),
    workspaceMode: "direct",
    worktreePath: null,
    worktreeUnavailableReason: null,
    workspaceUpdatedAt: "2026-07-09T00:00:00.000Z",
    sessions,
    runningCount: sessions.reduce((sum, session) => sum + session.runningCount, 0),
    waitingCount: sessions.reduce((sum, session) => sum + session.waitingCount, 0),
    stuckCount: sessions.reduce((sum, session) => sum + session.stuckCount, 0),
    errorCount: sessions.reduce((sum, session) => sum + session.errorCount, 0),
  };
}

function buildWorkspaceSource(worktreeMode = false): LocalConsoleSessionWorkspaceSource {
  return {
    projectId: LOCAL_CONSOLE_PROJECT_ID,
    title: "agent-moebius",
    folderPath: process.cwd(),
    workspaceMode: worktreeMode ? "worktree" : "direct",
    workspacePendingMode: null,
  };
}

class FastFailAppendStore implements LocalConsoleStore {
  readonly sqlitePath = "/tmp/fast-fail-local-console.sqlite";

  async init(): Promise<void> {}

  async close(): Promise<void> {}

  async createProject(input: { folderPath: string; worktreeMode: boolean; now: string }): Promise<LocalConsoleProjectSummary> {
    void input.now;
    return buildProjectSummary([buildSessionSummary(LOCAL_CONSOLE_DEFAULT_SESSION_ID)], {
      folderPath: input.folderPath,
      worktreeMode: input.worktreeMode,
    });
  }

  async updateProject(input: { projectId: string; worktreeMode: boolean; now: string }): Promise<LocalConsoleProjectSummary> {
    void input.projectId;
    void input.now;
    return buildProjectSummary([buildSessionSummary(LOCAL_CONSOLE_DEFAULT_SESSION_ID)], { worktreeMode: input.worktreeMode });
  }

  async reorderProjects(): Promise<LocalConsoleProjectSummary[]> {
    return await this.listProjects();
  }

  async listProjects(): Promise<LocalConsoleProjectSummary[]> {
    return [buildProjectSummary(await this.listSessions())];
  }

  async getSessionWorkspace(): Promise<LocalConsoleSessionWorkspaceSource> {
    return buildWorkspaceSource();
  }

  async switchSessionWorkspace(input: { sessionId: string }): Promise<LocalConsoleSessionSummary> {
    return buildSessionSummary(input.sessionId);
  }

  async switchSessionTeam(input: { sessionId: string }): Promise<LocalConsoleSessionSummary> {
    return buildSessionSummary(input.sessionId);
  }

  async applyPendingSessionContext(input: { sessionId: string }): Promise<LocalConsoleSessionSummary> {
    return buildSessionSummary(input.sessionId);
  }

  async recordProjectWorkspaceStatus(): Promise<void> {}

  async createSession(input: { sessionId: string; projectId?: string; title: string; now: string }): Promise<LocalConsoleSessionSummary> {
    void input.projectId;
    void input.now;
    return buildSessionSummary(input.sessionId, input.title);
  }

  async moveEmptySessionToProject(input: { sessionId: string; projectId: string; now: string }): Promise<LocalConsoleSessionSummary> {
    void input.projectId;
    void input.now;
    return buildSessionSummary(input.sessionId);
  }

  async listSessions(): Promise<LocalConsoleSessionSummary[]> {
    return [buildSessionSummary(LOCAL_CONSOLE_DEFAULT_SESSION_ID)];
  }

  async markSessionResultRead(): Promise<boolean> {
    return false;
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

  async recordSystemMessage(): Promise<void> {}

  async recordMessageProcessed(): Promise<void> {}

  async findRouteDecision(): Promise<null> {
    return null;
  }

  async recordRouteAppend(): Promise<void> {}

  async recordRouteNoAction(): Promise<void> {}

  async releaseMessageForRetry(): Promise<void> {}

  async recordFailure(): Promise<void> {}

  async recordRetryableFailure(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<LocalConsoleMessage> {
    void input;
    throw new Error("read-only local console store");
  }

  async recordDeadLetter(): Promise<void> {}

  async recordInterrupted(): Promise<void> {}

  async recordStuck(): Promise<void> {}

  async markStaleRunning(): Promise<number> {
    return 0;
  }
}

class FailOnceRecordAgentResponseStore implements LocalConsoleStore {
  readonly sqlitePath: string;
  private failNextRecord = true;

  constructor(private readonly inner: LocalConsoleStore) {
    this.sqlitePath = inner.sqlitePath;
  }

  async init(): Promise<void> {
    await this.inner.init();
  }

  async close(): Promise<void> {
    await this.inner.close();
  }

  async createProject(input: { folderPath: string; worktreeMode: boolean; now: string }): Promise<LocalConsoleProjectSummary> {
    return await this.inner.createProject(input);
  }

  async updateProject(input: { projectId: string; worktreeMode: boolean; now: string }): Promise<LocalConsoleProjectSummary> {
    return await this.inner.updateProject(input);
  }

  async reorderProjects(projectIds: string[]): Promise<LocalConsoleProjectSummary[]> {
    return await this.inner.reorderProjects(projectIds);
  }

  async listProjects(): Promise<LocalConsoleProjectSummary[]> {
    return await this.inner.listProjects();
  }

  async getSessionWorkspace(sessionId: string): Promise<LocalConsoleSessionWorkspaceSource> {
    return await this.inner.getSessionWorkspace(sessionId);
  }

  async switchSessionWorkspace(input: Parameters<LocalConsoleStore["switchSessionWorkspace"]>[0]): Promise<LocalConsoleSessionSummary> {
    return await this.inner.switchSessionWorkspace(input);
  }

  async switchSessionTeam(input: Parameters<LocalConsoleStore["switchSessionTeam"]>[0]): Promise<LocalConsoleSessionSummary> {
    return await this.inner.switchSessionTeam(input);
  }

  async applyPendingSessionContext(input: Parameters<LocalConsoleStore["applyPendingSessionContext"]>[0]): Promise<LocalConsoleSessionSummary> {
    return await this.inner.applyPendingSessionContext(input);
  }

  async recordProjectWorkspaceStatus(input: {
    projectId: string;
    cwd: string;
    mode: "direct" | "worktree";
    worktreePath: string | null;
    worktreeUnavailableReason: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordProjectWorkspaceStatus(input);
  }

  async createSession(input: { sessionId: string; projectId?: string; title: string; now: string }): Promise<LocalConsoleSessionSummary> {
    return await this.inner.createSession(input);
  }

  async moveEmptySessionToProject(input: { sessionId: string; projectId: string; now: string }): Promise<LocalConsoleSessionSummary> {
    return await this.inner.moveEmptySessionToProject(input);
  }

  async listSessions(): Promise<LocalConsoleSessionSummary[]> {
    return await this.inner.listSessions();
  }

  async markSessionResultRead(input: { sessionId: string; unreadSince: string; now: string }): Promise<boolean> {
    return await this.inner.markSessionResultRead(input);
  }

  async appendUserMessage(input: { sessionId: string; body: string; now: string }): Promise<LocalConsoleMessage> {
    return await this.inner.appendUserMessage(input);
  }

  async listMessages(sessionId: string): Promise<LocalConsoleMessage[]> {
    return await this.inner.listMessages(sessionId);
  }

  async hasRunningMessage(sessionId: string): Promise<boolean> {
    return await this.inner.hasRunningMessage(sessionId);
  }

  async claimNextPendingMessage(input: { sessionId: string; runId: string; now: string }): Promise<LocalConsoleMessage | null> {
    return await this.inner.claimNextPendingMessage(input);
  }

  async setRunDir(input: { id: number; runDir: string; now: string }): Promise<void> {
    await this.inner.setRunDir(input);
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
    if (this.failNextRecord) {
      this.failNextRecord = false;
      throw new Error("injected-record-agent-response-before-commit");
    }
    await this.inner.recordAgentResponse(input);
  }

  async recordSystemAndComplete(input: {
    userMessageId: number;
    sessionId: string;
    body: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordSystemAndComplete(input);
  }

  async recordSystemMessage(input: {
    sessionId: string;
    body: string;
    runId: string | null;
    runDir: string | null;
    error: string | null;
    status?: "displayed" | "failed" | "stuck";
    now: string;
  }): Promise<void> {
    await this.inner.recordSystemMessage(input);
  }

  async recordMessageProcessed(input: {
    userMessageId: number;
    sessionId: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordMessageProcessed(input);
  }

  async findRouteDecision(input: { sessionId: string; routeKey: string }) {
    return await this.inner.findRouteDecision(input);
  }

  async recordRouteAppend(input: {
    userMessageId: number;
    sessionId: string;
    routeKey: string;
    body: string;
    targetRole: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordRouteAppend(input);
  }

  async recordRouteNoAction(input: {
    userMessageId: number;
    sessionId: string;
    routeKey: string;
    outcome: "no_action" | "fail_open" | "dead_letter";
    reason: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordRouteNoAction(input);
  }

  async releaseMessageForRetry(input: { userMessageId: number; sessionId: string; now: string }): Promise<void> {
    await this.inner.releaseMessageForRetry(input);
  }

  async recordFailure(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordFailure(input);
  }

  async recordRetryableFailure(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<LocalConsoleMessage> {
    return await this.inner.recordRetryableFailure(input);
  }

  async recordDeadLetter(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    failureCount: number;
    now: string;
  }): Promise<void> {
    await this.inner.recordDeadLetter(input);
  }

  async recordInterrupted(input: {
    userMessageId: number;
    sessionId: string;
    reason: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordInterrupted(input);
  }

  async recordStuck(input: {
    userMessageId: number;
    sessionId: string;
    reason: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordStuck(input);
  }

  async markStaleRunning(input: {
    sessionId: string;
    cutoffIso: string;
    now: string;
    reason: string;
  }): Promise<number> {
    return await this.inner.markStaleRunning(input);
  }
}

class FailOnceRecordRouteAppendStore implements LocalConsoleStore {
  readonly sqlitePath: string;
  private failNextRecord = true;

  constructor(private readonly inner: LocalConsoleStore) {
    this.sqlitePath = inner.sqlitePath;
  }

  async init(): Promise<void> {
    await this.inner.init();
  }

  async close(): Promise<void> {
    await this.inner.close();
  }

  async createProject(input: { folderPath: string; worktreeMode: boolean; now: string }): Promise<LocalConsoleProjectSummary> {
    return await this.inner.createProject(input);
  }

  async updateProject(input: { projectId: string; worktreeMode: boolean; now: string }): Promise<LocalConsoleProjectSummary> {
    return await this.inner.updateProject(input);
  }

  async reorderProjects(projectIds: string[]): Promise<LocalConsoleProjectSummary[]> {
    return await this.inner.reorderProjects(projectIds);
  }

  async listProjects(): Promise<LocalConsoleProjectSummary[]> {
    return await this.inner.listProjects();
  }

  async getSessionWorkspace(sessionId: string): Promise<LocalConsoleSessionWorkspaceSource> {
    return await this.inner.getSessionWorkspace(sessionId);
  }

  async switchSessionWorkspace(input: Parameters<LocalConsoleStore["switchSessionWorkspace"]>[0]): Promise<LocalConsoleSessionSummary> {
    return await this.inner.switchSessionWorkspace(input);
  }

  async switchSessionTeam(input: Parameters<LocalConsoleStore["switchSessionTeam"]>[0]): Promise<LocalConsoleSessionSummary> {
    return await this.inner.switchSessionTeam(input);
  }

  async applyPendingSessionContext(input: Parameters<LocalConsoleStore["applyPendingSessionContext"]>[0]): Promise<LocalConsoleSessionSummary> {
    return await this.inner.applyPendingSessionContext(input);
  }

  async recordProjectWorkspaceStatus(input: {
    projectId: string;
    cwd: string;
    mode: "direct" | "worktree";
    worktreePath: string | null;
    worktreeUnavailableReason: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordProjectWorkspaceStatus(input);
  }

  async createSession(input: { sessionId: string; projectId?: string; title: string; now: string }): Promise<LocalConsoleSessionSummary> {
    return await this.inner.createSession(input);
  }

  async moveEmptySessionToProject(input: { sessionId: string; projectId: string; now: string }): Promise<LocalConsoleSessionSummary> {
    return await this.inner.moveEmptySessionToProject(input);
  }

  async listSessions(): Promise<LocalConsoleSessionSummary[]> {
    return await this.inner.listSessions();
  }

  async markSessionResultRead(input: { sessionId: string; unreadSince: string; now: string }): Promise<boolean> {
    return await this.inner.markSessionResultRead(input);
  }

  async appendUserMessage(input: { sessionId: string; body: string; now: string }): Promise<LocalConsoleMessage> {
    return await this.inner.appendUserMessage(input);
  }

  async listMessages(sessionId: string): Promise<LocalConsoleMessage[]> {
    return await this.inner.listMessages(sessionId);
  }

  async hasRunningMessage(sessionId: string): Promise<boolean> {
    return await this.inner.hasRunningMessage(sessionId);
  }

  async claimNextPendingMessage(input: { sessionId: string; runId: string; now: string }): Promise<LocalConsoleMessage | null> {
    return await this.inner.claimNextPendingMessage(input);
  }

  async setRunDir(input: { id: number; runDir: string; now: string }): Promise<void> {
    await this.inner.setRunDir(input);
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
    await this.inner.recordAgentResponse(input);
  }

  async recordSystemAndComplete(input: {
    userMessageId: number;
    sessionId: string;
    body: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordSystemAndComplete(input);
  }

  async recordSystemMessage(input: {
    sessionId: string;
    body: string;
    runId: string | null;
    runDir: string | null;
    error: string | null;
    status?: "displayed" | "failed" | "stuck";
    now: string;
  }): Promise<void> {
    await this.inner.recordSystemMessage(input);
  }

  async recordMessageProcessed(input: {
    userMessageId: number;
    sessionId: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordMessageProcessed(input);
  }

  async findRouteDecision(input: { sessionId: string; routeKey: string }) {
    return await this.inner.findRouteDecision(input);
  }

  async recordRouteAppend(input: {
    userMessageId: number;
    sessionId: string;
    routeKey: string;
    body: string;
    targetRole: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    if (this.failNextRecord) {
      this.failNextRecord = false;
      throw new Error("injected-record-route-append-before-commit");
    }
    await this.inner.recordRouteAppend(input);
  }

  async recordRouteNoAction(input: {
    userMessageId: number;
    sessionId: string;
    routeKey: string;
    outcome: "no_action" | "fail_open" | "dead_letter";
    reason: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordRouteNoAction(input);
  }

  async releaseMessageForRetry(input: { userMessageId: number; sessionId: string; now: string }): Promise<void> {
    await this.inner.releaseMessageForRetry(input);
  }

  async recordFailure(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordFailure(input);
  }

  async recordRetryableFailure(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<LocalConsoleMessage> {
    return await this.inner.recordRetryableFailure(input);
  }

  async recordDeadLetter(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    failureCount: number;
    now: string;
  }): Promise<void> {
    await this.inner.recordDeadLetter(input);
  }

  async recordInterrupted(input: {
    userMessageId: number;
    sessionId: string;
    reason: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordInterrupted(input);
  }

  async recordStuck(input: {
    userMessageId: number;
    sessionId: string;
    reason: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    await this.inner.recordStuck(input);
  }

  async markStaleRunning(input: {
    sessionId: string;
    cutoffIso: string;
    now: string;
    reason: string;
  }): Promise<number> {
    return await this.inner.markStaleRunning(input);
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

  async createProject(input: { folderPath: string; worktreeMode: boolean; now: string }): Promise<LocalConsoleProjectSummary> {
    void input.now;
    return buildProjectSummary(await this.listSessions(), {
      folderPath: input.folderPath,
      worktreeMode: input.worktreeMode,
    });
  }

  async updateProject(input: { projectId: string; worktreeMode: boolean; now: string }): Promise<LocalConsoleProjectSummary> {
    void input.projectId;
    void input.now;
    return buildProjectSummary(await this.listSessions(), { worktreeMode: input.worktreeMode });
  }

  async reorderProjects(): Promise<LocalConsoleProjectSummary[]> {
    return await this.listProjects();
  }

  async listProjects(): Promise<LocalConsoleProjectSummary[]> {
    return [buildProjectSummary(await this.listSessions())];
  }

  async getSessionWorkspace(): Promise<LocalConsoleSessionWorkspaceSource> {
    return buildWorkspaceSource();
  }

  async switchSessionWorkspace(input: { sessionId: string }): Promise<LocalConsoleSessionSummary> {
    return buildSessionSummary(input.sessionId, this.sessions.get(input.sessionId), this.messages);
  }

  async switchSessionTeam(input: { sessionId: string }): Promise<LocalConsoleSessionSummary> {
    return buildSessionSummary(input.sessionId, this.sessions.get(input.sessionId), this.messages);
  }

  async applyPendingSessionContext(input: { sessionId: string }): Promise<LocalConsoleSessionSummary> {
    return buildSessionSummary(input.sessionId, this.sessions.get(input.sessionId), this.messages);
  }

  async recordProjectWorkspaceStatus(): Promise<void> {}

  async createSession(input: { sessionId: string; projectId?: string; title: string; now: string }): Promise<LocalConsoleSessionSummary> {
    void input.projectId;
    void input.now;
    this.sessions.set(input.sessionId, input.title);
    return buildSessionSummary(input.sessionId, input.title, this.messages);
  }

  async moveEmptySessionToProject(input: { sessionId: string; projectId: string; now: string }): Promise<LocalConsoleSessionSummary> {
    void input.projectId;
    void input.now;
    return buildSessionSummary(input.sessionId, this.sessions.get(input.sessionId), this.messages);
  }

  async listSessions(): Promise<LocalConsoleSessionSummary[]> {
    const ids = new Set([LOCAL_CONSOLE_DEFAULT_SESSION_ID, ...this.sessions.keys(), ...this.messages.map((message) => message.sessionId)]);
    return Array.from(ids).map((sessionId) =>
      buildSessionSummary(sessionId, this.sessions.get(sessionId) ?? sessionId, this.messages),
    );
  }

  async markSessionResultRead(): Promise<boolean> {
    return false;
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
      failureCount: 0,
      lastFailureReason: null,
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
      failureCount: 0,
      lastFailureReason: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
    this.nextId += 1;
  }

  async recordSystemAndComplete(): Promise<void> {}

  async recordSystemMessage(): Promise<void> {}

  async recordMessageProcessed(input: {
    userMessageId: number;
    sessionId: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void> {
    void input.sessionId;
    void input.runId;
    void input.runDir;
    const message = this.messages.find((entry) => entry.id === input.userMessageId);
    if (message !== undefined && message.speaker === "user") {
      message.status = "completed";
      message.updatedAt = input.now;
    }
  }

  async findRouteDecision(): Promise<null> {
    return null;
  }

  async recordRouteAppend(): Promise<void> {}

  async recordRouteNoAction(): Promise<void> {}

  async releaseMessageForRetry(input: { userMessageId: number; sessionId: string; now: string }): Promise<void> {
    void input.sessionId;
    const message = this.messages.find((entry) => entry.id === input.userMessageId);
    if (message !== undefined && message.speaker === "user" && message.status === "running") {
      message.status = "pending";
      message.runId = null;
      message.updatedAt = input.now;
    }
  }

  async recordFailure(input: { userMessageId: number; error: string; now: string }): Promise<void> {
    const message = this.messages.find((entry) => entry.id === input.userMessageId);
    if (message !== undefined) {
      message.status = "failed";
      message.error = input.error;
      message.updatedAt = input.now;
    }
  }

  async recordRetryableFailure(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<LocalConsoleMessage> {
    void input.sessionId;
    const message = this.messages.find((entry) => entry.id === input.userMessageId);
    if (message === undefined) {
      throw new Error("message not found");
    }
    message.status = message.speaker === "user" ? "pending" : message.status;
    message.runId = input.runId;
    message.runDir = input.runDir;
    message.error = input.error;
    message.failureCount += 1;
    message.lastFailureReason = input.error;
    message.updatedAt = input.now;
    return { ...message };
  }

  async recordDeadLetter(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    failureCount: number;
    now: string;
  }): Promise<void> {
    const message = this.messages.find((entry) => entry.id === input.userMessageId);
    if (message !== undefined) {
      message.status = "failed";
      message.runId = input.runId;
      message.runDir = input.runDir;
      message.error = input.error;
      message.failureCount = input.failureCount;
      message.lastFailureReason = input.error;
      message.updatedAt = input.now;
    }
    this.messages.push({
      id: this.nextId,
      sessionId: input.sessionId,
      speaker: "system",
      role: null,
      body: `Local dead-letter: source message ${String(input.userMessageId)} stopped after ${String(input.failureCount)} failed attempts.`,
      status: "displayed",
      runId: input.runId,
      runDir: input.runDir,
      error: input.error,
      failureCount: 0,
      lastFailureReason: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
    this.nextId += 1;
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
