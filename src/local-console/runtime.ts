import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { LOCAL_CONSOLE_FAILURE_RETRY_LIMIT } from "../config.js";
import { parseAgentManifest } from "../agent-manifest.js";
import { loadCeoScripts } from "../ceo-scripts.js";
import {
  CEO_ORCHESTRATION_STAGE,
  parseCeoOrchestrationOutput,
  type CeoChildIssueDescriptor,
  type CeoOrchestrationGroup,
} from "../ceo-orchestration.js";
import { parseAgentMentions } from "../conversation.js";
import {
  type CodexRunOptions,
  type CodexRunResult,
  codexTimeoutKind,
  isInterruptedCodexRunResult,
} from "../codex.js";
import { log } from "../log.js";
import { parseTrailingStageMarker } from "../stages.js";
import { resolveTrigger } from "../triggers/index.js";
import { readLocalConsoleOutputTail } from "./output-tail.js";
import { listLocalChildSessionSummaries } from "./child-session-summary.js";
import { maybeRouteLocalNoMentionMessage, type LocalRouteJudgment } from "./route-bus.js";
import { buildLocalAgentPrompt } from "./prompt.js";
import type { LocalAttachmentManager } from "./attachments.js";
import { buildLocalConsoleTimeline } from "./timeline.js";
import { deriveSessionTitle } from "./title.js";
import {
  LOCAL_CONSOLE_DEFAULT_SESSION_ID,
  LocalConsoleBusyError,
  LocalConsoleProjectFolderError,
  LocalConsoleStoreTimeoutError,
  type LocalConsoleMessage,
  type LocalConsoleProjectSummary,
  type LocalConsoleProjectRemovalResult,
  LocalConsoleProjectRunningError,
  type LocalConsoleSessionArchiveResult,
  LocalConsoleSessionRunningError,
  LocalConsoleSessionWorkspaceLockedError,
  type LocalConsoleRunSnapshot,
  type LocalConsoleSessionSummary,
  type LocalConsoleSessionWorkspaceSource,
  type LocalConsoleWorkspaceMode,
  type LocalConsoleAgentTeamOwnership,
  type LocalConsoleAgentTeamSnapshot,
  type LocalConsoleSnapshot,
  type LocalConsoleStateSnapshot,
  type LocalConsoleSessionView,
  type LocalConsoleStore,
} from "./types.js";
import {
  generateLocalWorkspaceDiff,
  invalidateLocalWorkspaceFacts,
  localSessionWorktreePath,
  readCachedLocalWorkspaceFacts,
  readLocalGitStatus,
  resolveLocalWorkspaceSource,
  type ResolvedLocalWorkspace,
} from "./workspace-source.js";
import { resolveSessionWorkspaceContext } from "./workspace-resolution.js";
import { nonContinuableSystemMessage, resolveLocalSessionContinuation } from "./session-status.js";

export interface LocalConsoleAgentFile {
  name: string;
  path?: string;
  agentMarkdown?: string;
}

export interface LocalConsoleRuntimeOptions {
  store: LocalConsoleStore;
  listAgentFiles: (sessionId: string) => Promise<LocalConsoleAgentFile[]>;
  loadAgentTeamSnapshot?: (
    binding: { ownership: LocalConsoleAgentTeamOwnership; id: string },
  ) => Promise<LocalConsoleAgentTeamSnapshot>;
  resolveAgentTeamHealth?: (
    session: LocalConsoleSessionSummary,
  ) => Promise<{ health: "usable" | "deleted" | "needs-repair"; reason: string | null }>;
  runCodex: (options: CodexRunOptions) => Promise<CodexRunResult>;
  makeRunDir: (count: number, now?: Date) => string;
  projectRoot: string;
  workdirRoot: string;
  sessionId?: string;
  storeTimeoutMs?: number;
  codexIdleTimeoutMs?: number;
  codexMaxDurationMs?: number;
  workspaceGitTimeoutMs?: number;
  staleRunningGraceMs?: number;
  routeJudgment?: LocalRouteJudgment;
  routeTimeoutMs?: number;
  failureRetryLimit?: number;
  attachmentManager?: LocalAttachmentManager;
  now?: () => Date;
}

interface SessionFactWritingStore extends LocalConsoleStore {
  getSessionFactLogPath(sessionId: string): string;
  recordProgressEvent(input: {
    sessionId: string;
    runId: string;
    role: string;
    body: string;
    now: string;
  }): Promise<void>;
  createChildSession(input: {
    parentSessionId: string;
    childSessionId: string;
    projectId: string;
    title: string;
    relation: string;
    hiddenKey: string;
    initialBody: string;
    initialRole: string | null;
    now: string;
  }): Promise<LocalConsoleSessionSummary>;
  recordChildSessionCard(input: {
    parentSessionId: string;
    sourceId: string;
    childSessionIds: string[];
    runId: string;
    runDir: string;
    now: string;
  }): Promise<void>;
  recordWorkspaceDiff(input: {
    sessionId: string;
    runId: string;
    originalRepoRoot: string | null;
    baseRef: string;
    branchName: string;
    worktreePath: string;
    patchPath: string;
    affectedFiles: string[];
    status: "generated" | "applied" | "failed" | "abandoned" | "rolled_back";
    error: string | null;
    now: string;
  }): Promise<void>;
}

interface ActiveLocalRun {
  sessionId: string;
  runId: string;
  userMessageId: number;
  role: string | null;
  runDir: string | null;
  cwd: string | null;
  workspaceMode: "direct" | "worktree" | null;
  worktreeUnavailableReason: string | null;
  branchName: string | null;
  baseRef: string | null;
  originalRepoRoot: string | null;
  liveMarkdown: string | null;
  startedAt: string;
  controller: AbortController;
}

export class LocalConsoleRuntime {
  private readonly sessionId: string;
  private readonly storeTimeoutMs: number;
  private readonly codexIdleTimeoutMs?: number;
  private readonly codexMaxDurationMs?: number;
  private readonly routeTimeoutMs?: number;
  private readonly failureRetryLimit: number;
  private readonly staleRunningGraceMs: number;
  private readonly now: () => Date;
  private readonly processingSessions = new Set<string>();
  private readonly pendingProcessSessions = new Set<string>();
  private readonly activeRuns = new Map<string, ActiveLocalRun>();
  private readonly inactiveSessions = new Set<string>();
  private closing = false;
  private lastError: string | null = null;

  constructor(private readonly options: LocalConsoleRuntimeOptions) {
    this.sessionId = options.sessionId ?? LOCAL_CONSOLE_DEFAULT_SESSION_ID;
    this.storeTimeoutMs = options.storeTimeoutMs ?? 2_000;
    this.codexIdleTimeoutMs = options.codexIdleTimeoutMs;
    this.codexMaxDurationMs = options.codexMaxDurationMs;
    this.routeTimeoutMs = options.routeTimeoutMs;
    this.failureRetryLimit = options.failureRetryLimit ?? LOCAL_CONSOLE_FAILURE_RETRY_LIMIT;
    this.staleRunningGraceMs = options.staleRunningGraceMs ?? 5_000;
    this.now = options.now ?? (() => new Date());
  }

  get sqlitePath(): string {
    return this.options.store.sqlitePath;
  }

  async init(): Promise<void> {
    await this.storeCall("local-console-store-init", () => this.options.store.init());
    const sessions = await this.storeCall("local-console-store-list-sessions", () => this.options.store.listSessions());
    const sessionIds = sessions.length === 0 ? [this.sessionId] : sessions.map((session) => session.sessionId);
    await Promise.all(sessionIds.map(async (sessionId) => {
      try {
        await this.repairStaleRunning(sessionId);
      } catch (error) {
        this.lastError = formatLocalError(error);
        log({ event: "local-console-repair-stale-failed", sessionId, error: this.lastError });
      }
    }));
  }

  async close(): Promise<void> {
    if (this.closing) {
      return;
    }
    this.closing = true;
    this.pendingProcessSessions.clear();
    for (const active of this.activeRuns.values()) {
      active.controller.abort("runtime-closing");
    }
    const processingDeadline = Date.now() + this.storeTimeoutMs;
    while (this.processingSessions.size > 0 && Date.now() < processingDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await this.options.store.close();
  }

  async createProject(input: { folderPath: string; worktreeMode: boolean }): Promise<LocalConsoleProjectSummary> {
    return await this.storeCall("local-console-store-create-project", () =>
      this.options.store.createProject({
        folderPath: input.folderPath,
        worktreeMode: input.worktreeMode,
        now: this.nowIso(),
      }),
    );
  }

  async updateProject(input: { projectId: string; worktreeMode: boolean }): Promise<LocalConsoleProjectSummary> {
    await this.assertProjectDirectoryAvailable(input.projectId);
    return await this.storeCall("local-console-store-update-project", () =>
      this.options.store.updateProject({
        projectId: input.projectId,
        worktreeMode: input.worktreeMode,
        now: this.nowIso(),
      }),
    );
  }

  async repairProjectFolder(input: { projectId: string; folderPath: string }): Promise<LocalConsoleProjectSummary> {
    if (this.options.store.repairProjectFolder === undefined) {
      throw new Error("local console project folder repair unavailable");
    }
    const folderPath = path.resolve(input.folderPath);
    if (!(await directoryAvailable(folderPath))) {
      throw new LocalConsoleProjectFolderError(
        "PROJECT_DIRECTORY_UNAVAILABLE",
        "所选文件夹不可访问，请重新选择",
      );
    }
    try {
      const repaired = await this.storeCall("local-console-store-repair-project-folder", () =>
        this.options.store.repairProjectFolder!({
          projectId: input.projectId,
          folderPath,
          now: this.nowIso(),
        }),
      );
      for (const session of repaired.sessions) {
        void this.processPending(session.sessionId);
      }
      return this.withDirectoryAvailability(repaired, true);
    } catch (error) {
      const message = formatLocalError(error);
      if (message.includes("PROJECT_FOLDER_ALREADY_BOUND")) {
        throw new LocalConsoleProjectFolderError(
          "PROJECT_FOLDER_ALREADY_BOUND",
          "该文件夹已绑定其他项目，不能合并项目记录；请转到已有项目或重新选择",
        );
      }
      if (message.includes("LOCAL_PROJECT_NOT_FOUND")) {
        throw new LocalConsoleProjectFolderError("LOCAL_PROJECT_NOT_FOUND", "项目不存在或已移除");
      }
      throw error;
    }
  }

  async renameProject(input: { projectId: string; title: string }): Promise<LocalConsoleProjectSummary> {
    if (this.options.store.renameProject === undefined) {
      throw new Error("local console project rename unavailable");
    }
    return await this.storeCall("local-console-store-rename-project", () =>
      this.options.store.renameProject!({
        projectId: input.projectId,
        title: input.title,
        now: this.nowIso(),
      }),
    );
  }

  async removeProject(input: { projectId: string; force: boolean }): Promise<LocalConsoleProjectRemovalResult> {
    if (this.options.store.removeProject === undefined) {
      throw new Error("local console project removal unavailable");
    }
    const project = (await this.storeCall("local-console-store-list-projects", () => this.options.store.listProjects()))
      .find((candidate) => candidate.projectId === input.projectId);
    if (project === undefined) {
      throw new Error(`local console project not found: ${input.projectId}`);
    }
    if (project.runningCount > 0 && !input.force) {
      throw new LocalConsoleProjectRunningError();
    }

    const sessionIds = project.sessions.map((session) => session.sessionId);
    for (const sessionId of sessionIds) {
      this.inactiveSessions.add(sessionId);
      if (input.force) {
        this.activeRuns.get(sessionId)?.controller.abort("project-removed");
      }
    }
    try {
      return await this.storeCall("local-console-store-remove-project", () =>
        this.options.store.removeProject!({
          projectId: input.projectId,
          force: input.force,
          now: this.nowIso(),
        }),
      );
    } catch (error) {
      for (const sessionId of sessionIds) {
        this.inactiveSessions.delete(sessionId);
      }
      if (error instanceof Error && error.message.includes("PROJECT_HAS_RUNNING_AGENTS")) {
        throw new LocalConsoleProjectRunningError();
      }
      throw error;
    }
  }

  async reorderProjects(projectIds: string[]): Promise<LocalConsoleProjectSummary[]> {
    return await this.storeCall("local-console-store-reorder-projects", () =>
      this.options.store.reorderProjects(projectIds),
    );
  }

  async createSession(
    title?: string,
    projectId?: string,
    agentTeam?: { ownership: "system" | "user"; id: string },
    initialMessage?: string,
    workspaceMode?: LocalConsoleWorkspaceMode,
    attachmentIds: string[] = [],
  ): Promise<LocalConsoleSessionSummary> {
    const sessionId = `local:${this.now().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
    const resolvedProjectId = projectId ?? (await this.defaultProjectId());
    const normalizedInitialMessage = initialMessage?.trim();
    if (initialMessage !== undefined && normalizedInitialMessage === "" && attachmentIds.length === 0) {
      throw new Error("Message body must not be empty");
    }
    if (new Set(attachmentIds).size !== attachmentIds.length) {
      throw new Error("Attachment ids must be unique");
    }
    await this.assertProjectDirectoryAvailable(resolvedProjectId);
    if (workspaceMode === "worktree") {
      const project = (await this.storeCall("local-console-store-list-projects", () => this.options.store.listProjects()))
        .find((candidate) => candidate.projectId === resolvedProjectId);
      if (project === undefined) {
        throw new Error(`local console project not found: ${resolvedProjectId}`);
      }
      const facts = await readCachedLocalWorkspaceFacts({
        folderPath: project.folderPath,
        gitTimeoutMs: this.options.workspaceGitTimeoutMs,
      });
      if (!facts.isGitRepository) {
        throw new Error("not-git-repository");
      }
    }
    const agentTeamSnapshot = agentTeam === undefined || this.options.loadAgentTeamSnapshot === undefined
      ? undefined
      : await this.options.loadAgentTeamSnapshot(agentTeam);
    const firstAttachment = attachmentIds.length === 0
      ? undefined
      : (await this.options.attachmentManager?.listDraft("draft:new"))
        ?.find((attachment) => attachment.attachmentId === attachmentIds[0]);
    const session = await this.storeCall("local-console-store-create-session", () =>
      this.options.store.createSession({
        sessionId,
        projectId: resolvedProjectId,
        title: normalizedInitialMessage
          ? deriveSessionTitle(normalizedInitialMessage)
          : firstAttachment === undefined
            ? normalizeTitle(title)
            : deriveSessionTitle(firstAttachment.displayName),
        agentTeamOwnership: agentTeam?.ownership,
        agentTeamId: agentTeam?.id,
        agentTeamSnapshot,
        workspaceMode,
        initialMessage: normalizedInitialMessage,
        initialAttachmentIds: attachmentIds,
        attachmentDraftKey: "draft:new",
        now: this.nowIso(),
      }),
    );
    if (normalizedInitialMessage !== undefined || attachmentIds.length > 0) {
      void this.processPending(sessionId);
    }
    return session;
  }

  async moveEmptySessionToProject(input: {
    sessionId: string;
    projectId: string;
  }): Promise<LocalConsoleSessionSummary> {
    return await this.storeCall("local-console-store-move-empty-session", () =>
      this.options.store.moveEmptySessionToProject({
        ...input,
        now: this.nowIso(),
      }),
    );
  }

  async switchSessionWorkspace(input: {
    sessionId: string;
    workspaceMode: LocalConsoleWorkspaceMode;
  }): Promise<LocalConsoleSessionSummary> {
    const messages = await this.storeCall("local-console-store-list-session-messages", () =>
      this.options.store.listMessages(input.sessionId),
    );
    if (messages.length > 0) {
      throw new LocalConsoleSessionWorkspaceLockedError();
    }
    const source = await this.storeCall("local-console-store-session-workspace", () =>
      this.options.store.getSessionWorkspace(input.sessionId),
    );
    if (input.workspaceMode === "worktree") {
      const facts = await readCachedLocalWorkspaceFacts({
        folderPath: source.folderPath,
        gitTimeoutMs: this.options.workspaceGitTimeoutMs,
      });
      if (!facts.isGitRepository) {
        throw new Error("not-git-repository");
      }
    }
    let session: LocalConsoleSessionSummary;
    try {
      session = await this.storeCall("local-console-store-switch-session-workspace", () =>
        this.options.store.switchSessionWorkspace({
          sessionId: input.sessionId,
          workspaceMode: input.workspaceMode,
          now: this.nowIso(),
        }),
      );
    } catch (error) {
      if (formatLocalError(error) === "SESSION_WORKSPACE_LOCKED") {
        throw new LocalConsoleSessionWorkspaceLockedError();
      }
      throw error;
    }
    invalidateLocalWorkspaceFacts();
    return session;
  }

  async switchSessionTeam(input: {
    sessionId: string;
    agentTeamOwnership: LocalConsoleAgentTeamOwnership;
    agentTeamId: string;
  }): Promise<LocalConsoleSessionSummary> {
    const agentTeamSnapshot = this.options.loadAgentTeamSnapshot === undefined
      ? undefined
      : await this.options.loadAgentTeamSnapshot({
          ownership: input.agentTeamOwnership,
          id: input.agentTeamId,
        });
    return await this.storeCall("local-console-store-switch-session-team", () =>
      this.options.store.switchSessionTeam({ ...input, agentTeamSnapshot, now: this.nowIso() }),
    );
  }

  async archiveSession(sessionId: string): Promise<LocalConsoleSessionArchiveResult> {
    if (this.options.store.archiveSession === undefined) {
      throw new Error("local console session archive unavailable");
    }
    if (this.activeRuns.has(sessionId)) {
      throw new LocalConsoleSessionRunningError();
    }
    this.inactiveSessions.add(sessionId);
    try {
      return await this.storeCall("local-console-store-archive-session", () =>
        this.options.store.archiveSession!({ sessionId, now: this.nowIso() }),
      );
    } catch (error) {
      this.inactiveSessions.delete(sessionId);
      throw error;
    }
  }

  async restoreSession(sessionId: string): Promise<LocalConsoleSessionSummary> {
    if (this.options.store.restoreSession === undefined) {
      throw new Error("local console session restore unavailable");
    }
    const session = await this.storeCall("local-console-store-restore-session", () =>
      this.options.store.restoreSession!({ sessionId, now: this.nowIso() }),
    );
    this.inactiveSessions.delete(sessionId);
    void this.processPending(sessionId);
    return session;
  }

  async createChildSession(input: {
    parentSessionId: string;
    childSessionId: string;
    projectId: string;
    title: string;
    relation?: string;
    hiddenKey: string;
    initialBody: string;
    initialRole?: string | null;
  }): Promise<LocalConsoleSessionSummary> {
    await this.assertProjectDirectoryAvailable(input.projectId);
    try {
      return await this.storeCall("local-console-store-create-child-session", () =>
        this.sessionFactStore().createChildSession({
          parentSessionId: input.parentSessionId,
          childSessionId: input.childSessionId,
          projectId: input.projectId,
          title: input.title,
          relation: input.relation ?? "task",
          hiddenKey: input.hiddenKey,
          initialBody: input.initialBody,
          initialRole: input.initialRole ?? null,
          now: this.nowIso(),
        }),
      );
    } catch (error) {
      const message = formatLocalError(error);
      this.lastError = message;
      await this.recordVisibleChildSessionFailureBestEffort(input.parentSessionId, message);
      throw error;
    }
  }

  getSessionFactLogPath(sessionId: string): string {
    return this.sessionFactStore().getSessionFactLogPath(sessionId);
  }

  async submitUserMessage(
    body: string,
    sessionId = this.sessionId,
    attachmentIds: string[] = [],
  ): Promise<LocalConsoleMessage> {
    const trimmed = body.trim();
    if (trimmed === "" && attachmentIds.length === 0) {
      throw new Error("Message body must not be empty");
    }
    if (new Set(attachmentIds).size !== attachmentIds.length) {
      throw new Error("Attachment ids must be unique");
    }
    await this.assertSessionCanContinue(sessionId);

    const activeRun = this.activeRuns.get(sessionId);
    if (activeRun !== undefined && activeRun.role !== null && parseAgentMentions(trimmed).some((mention) => mention.name === activeRun.role)) {
      activeRun.controller.abort("user-redirected-active-agent");
    } else if (
      activeRun === undefined &&
      (await this.storeCall("local-console-store-has-running", () => this.options.store.hasRunningMessage(sessionId)))
    ) {
      throw new LocalConsoleBusyError();
    }

    const message = await this.storeCall("local-console-store-append-user", () =>
      this.options.store.appendUserMessage({
        sessionId,
        body: trimmed,
        attachmentIds,
        attachmentDraftKey: `draft:${sessionId}`,
        now: this.nowIso(),
      }),
    );
    void this.processPending(sessionId);
    return message;
  }

  async interruptRun(input: { sessionId: string; runId: string }): Promise<boolean> {
    const active = this.activeRuns.get(input.sessionId);
    if (active === undefined || active.runId !== input.runId) {
      return false;
    }
    active.controller.abort("user-interrupted");
    return true;
  }

  async markSessionResultRead(input: { sessionId: string; unreadSince: string }): Promise<boolean> {
    return await this.storeCall("local-console-store-mark-session-result-read", () =>
      this.options.store.markSessionResultRead({
        sessionId: input.sessionId,
        unreadSince: input.unreadSince,
        now: this.nowIso(),
      }),
    );
  }

  async snapshot(sessionId = this.sessionId): Promise<LocalConsoleSnapshot> {
    const messages = await this.storeCall("local-console-store-list", () => this.options.store.listMessages(sessionId));
    return {
      sessionId,
      status: messages.some((message) => message.status === "running")
        ? "running"
        : messages.some((message) => message.status === "stuck")
          ? "stuck"
          : messages.some((message) => message.status === "failed")
            ? "failed"
            : "idle",
      messages,
      sqlitePath: this.options.store.sqlitePath,
      lastError: this.lastError,
      activeRun: await this.activeRunSnapshot(sessionId),
    };
  }

  async state(selected: string | { sessionId?: string; projectId?: string } = this.sessionId): Promise<LocalConsoleStateSnapshot> {
    const selectedSessionId = typeof selected === "string" ? selected : (selected.sessionId ?? this.sessionId);
    const requestedProjectId = typeof selected === "string" ? undefined : selected.projectId;
    const storedProjects = await this.storeCall("local-console-store-list-projects", () => this.options.store.listProjects());
    const availableProjects = await Promise.all(storedProjects.map((project) => this.withDirectoryAvailability(project)));
    const projects = await Promise.all(availableProjects.map((project) => this.withSessionWorkspaceContext(project)));
    await this.synchronizeNonContinuableRecords(projects);
    await this.stopUnsafeRunsWithUnavailableContext(projects);
    const sessions = projects.flatMap((project) => project.sessions);
    const firstRootSession = sessions.find((session) => session.parentSessionId == null);
    const requestedProject = requestedProjectId === undefined ? undefined : projects.find((project) => project.projectId === requestedProjectId);
    const requestedSession = (requestedProject?.sessions ?? sessions).find((session) => session.sessionId === selectedSessionId);
    const selectedProject =
      requestedProject ??
      (requestedSession === undefined ? undefined : projects.find((project) => project.projectId === requestedSession.projectId)) ??
      (firstRootSession === undefined ? undefined : projects.find((project) => project.projectId === firstRootSession.projectId)) ??
      projects[0] ??
      buildFallbackProjectSummary(this.options.projectRoot);
    const storedSelectedSession =
      (requestedSession?.projectId === selectedProject.projectId ? requestedSession : undefined) ??
      selectedProject.sessions.find((session) => session.parentSessionId == null) ??
      (requestedProject === undefined ? firstRootSession : undefined) ??
      null;
    const selectedSession = storedSelectedSession;
    const sessionId = selectedSession?.sessionId ?? selectedSessionId;
    const messages = selectedSession === null
      ? []
      : await this.storeCall("local-console-store-list", () => this.options.store.listMessages(sessionId));
    const childSessions = selectedSession === null
      ? []
      : await this.storeCall("local-console-store-list-child-sessions", () =>
          listLocalChildSessionSummaries({
            sqlitePath: this.options.store.sqlitePath,
            timeoutMs: this.storeTimeoutMs,
          }, selectedSession.sessionId));
    return {
      projects,
      project: selectedProject,
      selectedProjectId: selectedProject.projectId,
      selectedSessionId: sessionId,
      selectedSession,
      messages,
      childSessions,
      activeRun: await this.activeRunSnapshot(sessionId),
      sqlitePath: this.options.store.sqlitePath,
      lastError: this.lastError,
    };
  }

  async sessionView(sessionId: string): Promise<LocalConsoleSessionView> {
    const sessions = await this.storeCall("local-console-store-list-sessions", () => this.options.store.listSessions());
    const session = sessions.find((candidate) => candidate.sessionId === sessionId);
    if (session === undefined) {
      throw new Error(`local console session not found: ${sessionId}`);
    }
    const messages = await this.storeCall("local-console-store-list", () => this.options.store.listMessages(sessionId));
    return {
      session,
      messages,
      activeRun: await this.activeRunSnapshot(sessionId),
    };
  }

  async childSessionSummaries(parentSessionId: string) {
    return await this.storeCall("local-console-store-list-child-sessions", () =>
      listLocalChildSessionSummaries({
        sqlitePath: this.options.store.sqlitePath,
        timeoutMs: this.storeTimeoutMs,
      }, parentSessionId));
  }

  async processPending(sessionId = this.sessionId): Promise<void> {
    if (this.closing || this.inactiveSessions.has(sessionId)) {
      return;
    }
    if (this.processingSessions.has(sessionId)) {
      this.pendingProcessSessions.add(sessionId);
      return;
    }

    this.processingSessions.add(sessionId);

    try {
      await this.repairStaleRunning(sessionId);
      while (true) {
        if (this.closing || this.inactiveSessions.has(sessionId)) {
          return;
        }
        const workspaceSource = await this.continuableSessionWorkspace(sessionId);
        if (workspaceSource === null) {
          return;
        }
        if (await this.storeCall("local-console-store-has-running", () => this.options.store.hasRunningMessage(sessionId))) {
          return;
        }

        let activeMessage: LocalConsoleMessage | null = null;
        let activeRunId: string | null = null;
        let activeRunDir: string | null = null;

        try {
          const nextRunId = `local-${this.now().toISOString()}-${Math.random().toString(36).slice(2, 10)}`;
          activeRunId = nextRunId;
          activeMessage = await this.storeCall("local-console-store-claim", () =>
            this.options.store.claimNextPendingMessage({
              sessionId,
              runId: nextRunId,
              now: this.nowIso(),
            }),
          );
          if (activeMessage === null) {
            return;
          }
          if (this.inactiveSessions.has(sessionId)) {
            return;
          }
          const claimedMessage = activeMessage;
          if (this.inactiveSessions.has(sessionId)) {
            return;
          }

          const persistedSnapshot = await this.options.store.listSessionAgentTeamSnapshot?.(sessionId) ?? null;
          const agentFiles: LocalConsoleAgentFile[] = persistedSnapshot === null
            ? await this.options.listAgentFiles(sessionId)
            : persistedSnapshot.members.map((member) => ({
                name: member.name,
                agentMarkdown: member.agentMarkdown,
              }));
          if (this.inactiveSessions.has(sessionId)) {
            return;
          }
          const messages = await this.storeCall("local-console-store-list", () => this.options.store.listMessages(sessionId));
          const timelineMessages = messages.filter((message) => message.id <= claimedMessage.id);
          const timeline = buildLocalConsoleTimeline(
            timelineMessages,
            agentFiles.map((agent) => agent.name),
          );
          const explicitTrigger = resolveTrigger({
            timeline,
            availableAgentNames: agentFiles.map((agent) => agent.name),
          });
          const primaryAgent = agentFiles[0]?.name ?? null;
          const trigger = explicitTrigger.kind === "skip" && primaryAgent !== null
            ? claimedMessage.speaker === "user" || (claimedMessage.speaker === "agent" && claimedMessage.role !== primaryAgent)
              ? { kind: "run-agent" as const, role: primaryAgent, reason: "mention" as const }
              : explicitTrigger
            : explicitTrigger;

          if (trigger.kind !== "run-agent") {
            if (claimedMessage.speaker === "agent") {
              await this.storeCall("local-console-store-primary-closeout-complete", () =>
                this.options.store.recordMessageProcessed({
                  userMessageId: claimedMessage.id,
                  sessionId,
                  runId: nextRunId,
                  runDir: null,
                  now: this.nowIso(),
                }),
              );
              continue;
            }
            let route: Awaited<ReturnType<typeof maybeRouteLocalNoMentionMessage>>;
            try {
              route = await maybeRouteLocalNoMentionMessage({
                store: this.options.store,
                message: claimedMessage,
                sessionId,
                timeline,
                availableAgentNames: agentFiles.map((agent) => agent.name),
                runId: nextRunId,
                runDir: activeRunDir,
                agentsDir: path.join(this.options.projectRoot, "agents"),
                now: this.nowIso(),
                routeJudgment: this.options.routeJudgment,
                timeoutMs: this.routeTimeoutMs,
                runCodex: this.options.runCodex,
              });
            } catch (error) {
              await this.recordFailureOrDeadLetterBestEffort(
                claimedMessage,
                sessionId,
                nextRunId,
                activeRunDir,
                formatLocalError(error),
              );
              activeMessage = null;
              activeRunId = null;
              activeRunDir = null;
              throw error;
            }
            if (route.kind === "retry") {
              this.lastError = `local-route-retry:${route.reason}`;
              await this.recordFailureOrDeadLetterBestEffort(claimedMessage, sessionId, nextRunId, activeRunDir, this.lastError);
              return;
            }
            continue;
          }

          const selectedAgent = agentFiles.find((agent) => agent.name === trigger.role);
          if (selectedAgent === undefined) {
            await this.recordFailureOrDeadLetterBestEffort(claimedMessage, sessionId, nextRunId, null, `Agent not found: ${trigger.role}`);
            return;
          }

          const agentMarkdown = selectedAgent.agentMarkdown
            ?? await fs.readFile(requireAgentFilePath(selectedAgent), "utf8");
          const agentManifest = parseAgentManifest(agentMarkdown);
          let prompt = buildLocalAgentPrompt({
            role: trigger.role,
            agentMarkdown: agentManifest.body,
            timeline,
            primaryAgent: primaryAgent ?? trigger.role,
            availableAgentNames: agentFiles.map((agent) => agent.name),
          });

          activeRunDir = this.options.makeRunDir(messages.length, this.now());
          const resolvedRunDir = path.resolve(activeRunDir);
          await this.storeCall("local-console-store-set-rundir", () =>
            this.options.store.setRunDir({
              id: claimedMessage.id,
              sessionId,
              runDir: resolvedRunDir,
              now: this.nowIso(),
            }),
          );

          const preparedAttachments = this.options.attachmentManager === undefined
            ? { promptSuffix: "", imagePaths: [] as string[] }
            : await this.options.attachmentManager.prepareRunAttachments({
                messages: timelineMessages,
                runDir: resolvedRunDir,
              });
          prompt += preparedAttachments.promptSuffix;

          const controller = new AbortController();
          const workspace = await this.resolveWorkspace(sessionId, workspaceSource, controller.signal);
          if (this.inactiveSessions.has(sessionId)) {
            return;
          }
          this.activeRuns.set(sessionId, {
            sessionId,
            runId: nextRunId,
            userMessageId: claimedMessage.id,
            role: trigger.role,
            runDir: resolvedRunDir,
            cwd: workspace.cwd,
            workspaceMode: workspace.mode,
            worktreeUnavailableReason: workspace.worktreeUnavailableReason,
            branchName: workspace.branchName,
            baseRef: workspace.baseRef,
            originalRepoRoot: workspace.originalRepoRoot,
            liveMarkdown: null,
            startedAt: this.nowIso(),
            controller,
          });

          let progressFactTail = Promise.resolve();
          const result = await (async () => {
            try {
              return await this.options.runCodex({
                prompt,
                runDir: activeRunDir,
                cwd: workspace.cwd,
                mode: { kind: "full" },
                signal: controller.signal,
                ...(this.codexIdleTimeoutMs === undefined ? {} : { idleTimeoutMs: this.codexIdleTimeoutMs }),
                ...(this.codexMaxDurationMs === undefined ? {} : { maxDurationMs: this.codexMaxDurationMs }),
                ...(preparedAttachments.imagePaths.length === 0 ? {} : { imagePaths: preparedAttachments.imagePaths }),
                onVisibleAgentMarkdown: (text) => {
                  const active = this.activeRuns.get(sessionId);
                  if (active?.runId === nextRunId) {
                    active.liveMarkdown = text;
                    const recordedAt = this.nowIso();
                    progressFactTail = progressFactTail.then(() =>
                      this.storeCall("local-console-store-record-progress", () =>
                        this.sessionFactStore().recordProgressEvent({
                          sessionId,
                          runId: nextRunId,
                          role: trigger.role,
                          body: text,
                          now: recordedAt,
                        })));
                  }
                },
              });
            } finally {
              await progressFactTail;
            }
          })();

          if (!result.ok) {
            await this.recordFailedCodexResult(claimedMessage, sessionId, nextRunId, result);
            return;
          }

          const sourceDirectoryAvailable = await this.sessionProjectDirectoryAvailable(sessionId);

          const childSessionCard = sourceDirectoryAvailable && trigger.role === "ceo"
            ? await this.executeLocalCeoChildSessionOrchestrationIfNeeded({
              sessionId,
              runId: nextRunId,
              runDir: result.runDir,
              finalText: result.finalText,
              availableAgentNames: agentFiles.map((agent) => agent.name),
            })
            : null;

          if (sourceDirectoryAvailable) {
            await this.recordWorkspaceDiffIfNeeded(sessionId, nextRunId, resolvedRunDir, workspace, result.finalText, controller.signal);
          }

          try {
            await this.storeCall("local-console-store-record-agent-response", () =>
              this.options.store.recordAgentResponse({
                userMessageId: claimedMessage.id,
                sessionId,
                role: trigger.role,
                body: result.finalText,
                runId: nextRunId,
                runDir: result.runDir,
                now: this.nowIso(),
              }),
            );
          } catch (error) {
            await this.recordFailureOrDeadLetterBestEffort(
              claimedMessage,
              sessionId,
              nextRunId,
              result.runDir,
              formatLocalError(error),
            );
            activeMessage = null;
            activeRunId = null;
            activeRunDir = null;
            throw error;
          }
          if (childSessionCard !== null) {
            try {
              await this.storeCall("local-console-store-child-session-card", () =>
                this.sessionFactStore().recordChildSessionCard({
                  parentSessionId: sessionId,
                  sourceId: childSessionCard.sourceId,
                  childSessionIds: childSessionCard.childSessionIds,
                  runId: nextRunId,
                  runDir: result.runDir,
                  now: this.nowIso(),
                }));
            } catch (error) {
              const reason = formatLocalError(error);
              this.lastError = reason;
              await this.recordVisibleChildSessionFailureBestEffort(sessionId, reason);
              throw error;
            }
          }
          this.lastError = null;
          if (!sourceDirectoryAvailable) {
            await this.storeCall("local-console-store-directory-unavailable", () =>
              this.options.store.recordSystemMessage({
                sessionId,
                body: "项目文件夹不可用；隔离工作区已完成当前步骤，修复项目文件夹后才能继续。",
                systemEventKind: "other",
                runId: nextRunId,
                runDir: result.runDir,
                error: "PROJECT_DIRECTORY_UNAVAILABLE",
                status: "failed",
                now: this.nowIso(),
              }),
            );
            return;
          }
        } catch (error) {
          this.lastError = formatLocalError(error);
          if (activeMessage !== null && activeRunId !== null) {
            await this.recordFailureOrDeadLetterBestEffort(activeMessage, sessionId, activeRunId, activeRunDir, this.lastError);
          }
          log({ event: "local-console-processing-failed", error: this.lastError });
          return;
        } finally {
          const completedWorkspace = this.activeRuns.get(sessionId)?.cwd ?? null;
          this.activeRuns.delete(sessionId);
          await this.storeCall("local-console-store-apply-pending-session-context", () =>
            this.options.store.applyPendingSessionContext({ sessionId, now: this.nowIso() }),
          );
          if (completedWorkspace !== null) {
            invalidateLocalWorkspaceFacts(completedWorkspace);
          }
        }
      }
    } catch (error) {
      this.lastError = formatLocalError(error);
      log({ event: "local-console-processing-failed", error: this.lastError });
    } finally {
      this.processingSessions.delete(sessionId);
      if (!this.closing && this.pendingProcessSessions.delete(sessionId)) {
        void this.processPending(sessionId);
      } else if (this.closing) {
        this.pendingProcessSessions.delete(sessionId);
      }
    }
  }

  async processAllPending(): Promise<void> {
    const sessions = await this.storeCall("local-console-store-list-sessions", () => this.options.store.listSessions());
    const sessionIds = sessions.length === 0 ? [this.sessionId] : sessions.map((session) => session.sessionId);
    for (const sessionId of sessionIds) {
      await this.processPending(sessionId);
    }
  }

  async repairStaleRunning(sessionId = this.sessionId): Promise<number> {
    const maxDurationMs = this.codexMaxDurationMs ?? 120 * 60 * 1000;
    const cutoffIso = new Date(this.now().getTime() - maxDurationMs - this.staleRunningGraceMs).toISOString();
    return await this.storeCall("local-console-store-mark-stale", () =>
      this.options.store.markStaleRunning({
        sessionId,
        cutoffIso,
        now: this.nowIso(),
        reason: `stale-running>${String(maxDurationMs + this.staleRunningGraceMs)}ms`,
      }),
    );
  }

  private async defaultProjectId(): Promise<string> {
    const projects = await this.storeCall("local-console-store-list-projects", () => this.options.store.listProjects());
    const firstProject = projects[0];
    if (firstProject === undefined) {
      throw new Error("local console project list is empty");
    }
    return firstProject.projectId;
  }

  private async assertProjectDirectoryAvailable(projectId: string): Promise<void> {
    const project = (await this.storeCall("local-console-store-list-projects", () => this.options.store.listProjects()))
      .find((candidate) => candidate.projectId === projectId);
    if (project === undefined) {
      throw new LocalConsoleProjectFolderError("LOCAL_PROJECT_NOT_FOUND", "项目不存在或已移除");
    }
    if (!(await directoryAvailable(project.folderPath))) {
      throw new LocalConsoleProjectFolderError(
        "PROJECT_DIRECTORY_UNAVAILABLE",
        "当前项目本地文件夹不可用，请先使用红色扳手修复",
      );
    }
  }

  private async assertSessionProjectDirectoryAvailable(sessionId: string): Promise<void> {
    if (!(await this.sessionProjectDirectoryAvailable(sessionId))) {
      throw new LocalConsoleProjectFolderError(
        "PROJECT_DIRECTORY_UNAVAILABLE",
        "当前项目本地文件夹不可用，请先使用红色扳手修复",
      );
    }
  }

  private async assertSessionCanContinue(sessionId: string): Promise<void> {
    await this.assertSessionProjectDirectoryAvailable(sessionId);
    const session = (await this.storeCall("local-console-store-list-sessions", () => this.options.store.listSessions()))
      .find((candidate) => candidate.sessionId === sessionId);
    if (session === undefined) {
      throw new Error(`local console session not found: ${sessionId}`);
    }
    const healthy = await this.withAgentTeamHealth(session);
    const continuation = resolveLocalSessionContinuation({
      projectDirectoryAvailable: true,
      agentTeamHealth: healthy.agentTeamHealth,
      agentTeamHealthReason: healthy.agentTeamHealthReason,
    });
    if (!continuation.canContinue) {
      throw new Error(continuation.reason);
    }
  }

  private async continuableSessionWorkspace(sessionId: string): Promise<LocalConsoleSessionWorkspaceSource | null> {
    const source = await this.storeCall("local-console-store-session-workspace", () =>
      this.options.store.getSessionWorkspace(sessionId),
    );
    if (!(await directoryAvailable(source.folderPath))) {
      return null;
    }
    const session = source.session ?? (await this.storeCall(
      "local-console-store-list-sessions",
      () => this.options.store.listSessions(),
    )).find((candidate) => candidate.sessionId === sessionId);
    if (session === undefined) {
      return null;
    }
    const healthy = await this.withAgentTeamHealth(session);
    return healthy.agentTeamHealth === "deleted" || healthy.agentTeamHealth === "needs-repair" ? null : source;
  }

  private async sessionProjectDirectoryAvailable(sessionId: string): Promise<boolean> {
    const source = await this.storeCall("local-console-store-session-workspace", () =>
      this.options.store.getSessionWorkspace(sessionId),
    );
    return directoryAvailable(source.folderPath);
  }

  private async withDirectoryAvailability(
    project: LocalConsoleProjectSummary,
    knownAvailable?: boolean,
  ): Promise<LocalConsoleProjectSummary> {
    const available = knownAvailable ?? await directoryAvailable(project.folderPath);
    return {
      ...project,
      directoryAvailable: available,
      directoryUnavailableReason: available ? null : "当前项目本地文件夹未找到，可以指定新的文件夹",
      newConversationDisabledReason: available ? null : "当前项目本地文件夹不可用，无法新建对话",
    };
  }

  private async withAgentTeamHealth(session: LocalConsoleSessionSummary): Promise<LocalConsoleSessionSummary> {
    if (session.agentTeamOwnership == null || session.agentTeamId == null) {
      return { ...session, agentTeamHealth: null, agentTeamHealthReason: null };
    }
    if (this.options.resolveAgentTeamHealth === undefined) {
      return session;
    }
    try {
      const result = await this.options.resolveAgentTeamHealth(session);
      return { ...session, agentTeamHealth: result.health, agentTeamHealthReason: result.reason };
    } catch (error) {
      return {
        ...session,
        agentTeamHealth: "needs-repair",
        agentTeamHealthReason: formatLocalError(error),
      };
    }
  }

  private async withSessionWorkspaceContext(project: LocalConsoleProjectSummary): Promise<LocalConsoleProjectSummary> {
    const projectFacts = project.directoryAvailable === false
      ? { isGitRepository: false, branchName: null }
      : await readCachedLocalWorkspaceFacts({
          folderPath: project.folderPath,
          gitTimeoutMs: this.options.workspaceGitTimeoutMs,
        });
    const sessions = await Promise.all(project.sessions.map(async (session) => {
      const healthySession = await this.withAgentTeamHealth(session);
      const context = resolveSessionWorkspaceContext(session, projectFacts);
      let branchName = context.workspaceMode === "direct" ? projectFacts.branchName : null;
      if (context.workspaceMode === "worktree") {
        const worktreePath = localSessionWorktreePath(
          this.options.workdirRoot,
          project.projectId,
          session.sessionId,
        );
        if (await directoryAvailable(worktreePath)) {
          branchName = (await readCachedLocalWorkspaceFacts({
            folderPath: worktreePath,
            gitTimeoutMs: this.options.workspaceGitTimeoutMs,
          })).branchName;
        }
      }
      return {
        ...healthySession,
        workspaceUnavailableReason: context.independentWorkspaceUnavailableReason,
        branchName,
        continuation: resolveLocalSessionContinuation({
          projectDirectoryAvailable: project.directoryAvailable !== false,
          agentTeamHealth: healthySession.agentTeamHealth,
          agentTeamHealthReason: healthySession.agentTeamHealthReason,
        }),
      };
    }));
    return {
      ...project,
      branchName: projectFacts.branchName,
      isGitRepository: projectFacts.isGitRepository,
      sessions,
    };
  }

  private async synchronizeNonContinuableRecords(projects: LocalConsoleProjectSummary[]): Promise<void> {
    for (const session of projects.flatMap((project) => project.sessions)) {
      if (session.continuation === undefined || session.continuation.canContinue) {
        continue;
      }
      const continuation = session.continuation;
      const body = nonContinuableSystemMessage(continuation);
      if (body === null) {
        continue;
      }
      const messages = await this.storeCall("local-console-store-list", () => this.options.store.listMessages(session.sessionId));
      if (messages.some((message) => message.speaker === "system" && message.body === body)) {
        continue;
      }
      await this.storeCall("local-console-store-record-non-continuable", () => this.options.store.recordSystemMessage({
        sessionId: session.sessionId,
        body,
        systemEventKind: "other",
        runId: null,
        runDir: null,
        error: continuation.kind,
        status: "displayed",
        now: this.nowIso(),
      }));
    }
  }

  private async stopUnsafeRunsWithUnavailableContext(projects: LocalConsoleProjectSummary[]): Promise<void> {
    const unavailableProjectIds = new Set(
      projects.filter((project) => project.directoryAvailable === false).map((project) => project.projectId),
    );
    const sessions = new Map(projects.flatMap((project) => project.sessions.map((session) => [session.sessionId, session] as const)));
    for (const active of this.activeRuns.values()) {
      const source = await this.storeCall("local-console-store-session-workspace", () =>
        this.options.store.getSessionWorkspace(active.sessionId),
      );
      if (active.workspaceMode === "direct" && unavailableProjectIds.has(source.projectId)) {
        active.controller.abort("project-directory-unavailable");
        continue;
      }
      const session = sessions.get(active.sessionId);
      if (session?.agentTeamHealth === "deleted" || session?.agentTeamHealth === "needs-repair") {
        const snapshot = await this.options.store.listSessionAgentTeamSnapshot?.(active.sessionId) ?? null;
        if (snapshot === null) {
          active.controller.abort("agent-team-unavailable");
        }
      }
    }
  }

  private async resolveWorkspace(
    sessionId: string,
    source: LocalConsoleSessionWorkspaceSource,
    signal: AbortSignal,
  ): Promise<ResolvedLocalWorkspace> {
    const workspace = await resolveLocalWorkspaceSource({
      projectId: source.projectId,
      sessionId,
      folderPath: source.folderPath,
      worktreeMode: source.workspaceMode === "worktree",
      workdirRoot: this.options.workdirRoot,
      gitTimeoutMs: this.options.workspaceGitTimeoutMs,
      signal,
    });
    await this.storeCall("local-console-store-record-workspace", () =>
      this.options.store.recordProjectWorkspaceStatus({
        projectId: source.projectId,
        cwd: workspace.cwd,
        mode: workspace.mode,
        worktreePath: workspace.worktreePath,
        worktreeUnavailableReason: workspace.worktreeUnavailableReason,
        now: this.nowIso(),
      }),
    );
    return workspace;
  }

  private async recordFailedCodexResult(
    message: LocalConsoleMessage,
    sessionId: string,
    runId: string,
    result: Extract<CodexRunResult, { ok: false }>,
  ): Promise<void> {
    const timeoutKind = codexTimeoutKind(result.reason);
    if (timeoutKind !== null) {
      log({
        event: timeoutKind === "idle" ? "local-console-codex-idle-timeout" : "local-console-codex-watchdog-timeout",
        runDir: result.runDir,
        reason: result.reason,
      });
      await this.recordStuckBestEffort(message, sessionId, runId, result.runDir, result.reason);
      return;
    }
    if (isInterruptedCodexRunResult(result)) {
      await this.recordInterruptedBestEffort(
        message,
        sessionId,
        runId,
        result.runDir,
        result.reason,
        result.reason.includes("project-directory-unavailable") || result.reason.includes("agent-team-unavailable")
          ? "context-unavailable"
          : result.reason.includes("user-redirected-active-agent")
            ? "redirect"
            : "user",
      );
      return;
    }
    await this.recordFailureOrDeadLetterBestEffort(message, sessionId, runId, result.runDir, result.reason);
  }

  private async recordNoTrigger(message: LocalConsoleMessage, sessionId: string, runId: string): Promise<void> {
    if (message.speaker === "agent") {
      await this.storeCall("local-console-store-no-trigger-agent", () =>
        this.options.store.recordMessageProcessed({
          userMessageId: message.id,
          sessionId,
          runId,
          runDir: null,
          now: this.nowIso(),
        }),
      );
      return;
    }
    await this.storeCall("local-console-store-no-trigger", () =>
      this.options.store.recordSystemAndComplete({
        userMessageId: message.id,
        sessionId,
        body: "没有找到可以接手这条消息的团队成员。请改选一支可用团队后再试。",
        systemEventKind: "other",
        runId,
        runDir: null,
        now: this.nowIso(),
      }),
    );
  }

  private async releaseForRetryBestEffort(message: LocalConsoleMessage, sessionId: string): Promise<void> {
    try {
      await this.storeCall("local-console-store-release-retry", () =>
        this.options.store.releaseMessageForRetry({
          userMessageId: message.id,
          sessionId,
          now: this.nowIso(),
        }),
      );
    } catch (error) {
      this.lastError = formatLocalError(error);
      log({ event: "local-console-release-retry-failed", error: this.lastError });
    }
  }

  private async activeRunSnapshot(sessionId: string): Promise<LocalConsoleRunSnapshot | null> {
    const active = this.activeRuns.get(sessionId);
    if (active === undefined) {
      return null;
    }
    const tail = await readLocalConsoleOutputTail(active.runDir);
    return {
      sessionId,
      runId: active.runId,
      role: active.role,
      status: "running",
      startedAt: active.startedAt,
      elapsedMs: Math.max(0, this.now().getTime() - Date.parse(active.startedAt)),
      runDir: active.runDir,
      cwd: active.cwd,
      workspaceMode: active.workspaceMode,
      worktreeUnavailableReason: active.worktreeUnavailableReason,
      branchName: active.branchName,
      baseRef: active.baseRef,
      stdoutTail: tail.stdoutTail,
      stderrTail: tail.stderrTail,
      liveMarkdown: active.liveMarkdown,
      lastOutputSummary: tail.lastOutputSummary,
      tailDiagnostic: tail.tailDiagnostic,
      interruptible: true,
    };
  }

  private async recordFailureOrDeadLetterBestEffort(
    message: LocalConsoleMessage,
    sessionId: string,
    runId: string | null,
    runDir: string | null,
    error: string,
  ): Promise<void> {
    try {
      const nextFailureCount = message.failureCount + 1;
      if (nextFailureCount >= this.failureRetryLimit) {
        await this.storeCall("local-console-store-record-dead-letter", () =>
          this.options.store.recordDeadLetter({
            userMessageId: message.id,
            sessionId,
            error,
            runId,
            runDir,
            failureCount: nextFailureCount,
            now: this.nowIso(),
          }),
        );
        return;
      }
      await this.storeCall("local-console-store-record-retryable-failure", () =>
        this.options.store.recordRetryableFailure({
          userMessageId: message.id,
          sessionId,
          error,
          runId,
          runDir,
          now: this.nowIso(),
        }),
      );
    } catch (recordError) {
      this.lastError = formatLocalError(recordError);
      log({ event: "local-console-record-retryable-failure-failed", error: this.lastError, originalError: error });
      await this.releaseForRetryBestEffort(message, sessionId);
    }
  }

  private async recordInterruptedBestEffort(
    message: LocalConsoleMessage,
    sessionId: string,
    runId: string | null,
    runDir: string | null,
    reason: string,
    interruptionKind: "user" | "redirect" | "context-unavailable" = "user",
  ): Promise<void> {
    try {
      await this.storeCall("local-console-store-record-interrupted", () =>
        this.options.store.recordInterrupted({
          userMessageId: message.id,
          sessionId,
          reason,
          interruptionKind,
          runId,
          runDir,
          now: this.nowIso(),
        }),
      );
    } catch (recordError) {
      this.lastError = formatLocalError(recordError);
      log({ event: "local-console-record-interrupted-failed", error: this.lastError, originalError: reason });
    }
  }

  private async recordStuckBestEffort(
    message: LocalConsoleMessage,
    sessionId: string,
    runId: string | null,
    runDir: string | null,
    reason: string,
  ): Promise<void> {
    try {
      await this.storeCall("local-console-store-record-stuck", () =>
        this.options.store.recordStuck({
          userMessageId: message.id,
          sessionId,
          reason,
          runId,
          runDir,
          now: this.nowIso(),
        }),
      );
    } catch (recordError) {
      this.lastError = formatLocalError(recordError);
      log({ event: "local-console-record-stuck-failed", error: this.lastError, originalError: reason });
    }
  }

  private async recordVisibleChildSessionFailureBestEffort(parentSessionId: string, reason: string): Promise<void> {
    try {
      await this.storeCall("local-console-store-child-session-failure", () =>
        this.options.store.recordSystemMessage({
          sessionId: parentSessionId,
          body: "子任务没有创建成功。你可以继续说话，或换一个成员接手。",
          systemEventKind: "run-not-started",
          runId: `local-child-session-${this.now().toISOString()}`,
          runDir: null,
          error: reason,
          status: "failed",
          now: this.nowIso(),
        }),
      );
    } catch (error) {
      this.lastError = formatLocalError(error);
      log({ event: "local-console-child-session-failure-record-failed", error: this.lastError, originalError: reason });
    }
  }

  private async executeLocalCeoChildSessionOrchestrationIfNeeded(input: {
    sessionId: string;
    runId: string;
    runDir: string;
    finalText: string;
    availableAgentNames: string[];
  }): Promise<{ sourceId: string; childSessionIds: string[] } | null> {
    const visibleTaskIds = collectLocalCeoLedgerTaskIds(input.finalText);
    if (visibleTaskIds.length === 0) {
      return null;
    }
    const scripts = await loadCeoScripts({ agentsDir: path.join(this.options.projectRoot, "agents"), required: false });
    const parsed = parseCeoOrchestrationOutput({
      output: input.finalText,
      scripts,
      availableAgentNames: input.availableAgentNames,
      visibleTaskIds,
      childTaskCheckPolicy: "local-optional",
    });
    if (!parsed.ok) {
      return null;
    }
    const descriptors =
      parsed.value.action === "spawn_child_issues"
        ? { workflowId: parsed.value.workflowId, groups: parsed.value.groups, issues: parsed.value.issues }
        : parsed.value.action === "goal_intake" && parsed.value.mode === "confirm"
          ? { workflowId: parsed.value.workflowId, groups: parsed.value.groups, issues: parsed.value.issues }
          : null;
    if (descriptors === null || descriptors.issues.length === 0) {
      return null;
    }

    const workspace = await this.storeCall("local-console-store-session-workspace", () => this.options.store.getSessionWorkspace(input.sessionId));
    const created: LocalConsoleSessionSummary[] = [];
    for (const descriptor of descriptors.issues) {
      const group = descriptors.groups.find((entry) => entry.id === descriptor.groupId);
      if (group === undefined) {
        throw new Error(`local child orchestration missing group: ${descriptor.groupId}`);
      }
      const hiddenKey = localOrchestrationKey({
        parentSessionId: input.sessionId,
        workflowId: descriptors.workflowId,
        ledgerTaskId: descriptor.ledgerTaskId,
      });
      created.push(
        await this.createChildSession({
          parentSessionId: input.sessionId,
          childSessionId: localChildSessionId(input.sessionId, descriptor.ledgerTaskId),
          projectId: workspace.projectId,
          title: descriptor.title,
          relation: "task",
          hiddenKey,
          initialRole: descriptor.initialRole,
          initialBody: renderLocalChildSessionInitialBody({
            parentSessionId: input.sessionId,
            workflowId: descriptors.workflowId,
            group,
            descriptor,
            orchestrationKey: hiddenKey,
          }),
        }),
      );
    }
    for (const child of created) {
      void this.processPending(child.sessionId);
    }
    return {
      sourceId: `workflow:${descriptors.workflowId}`,
      childSessionIds: created.map((child) => child.sessionId),
    };
  }

  private async recordWorkspaceDiffIfNeeded(
    sessionId: string,
    runId: string,
    runDir: string,
    workspace: ResolvedLocalWorkspace,
    finalText: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (workspace.mode !== "worktree" || workspace.worktreePath === null) {
      return;
    }
    if (parseTrailingStageMarker(finalText) !== "code-verified") {
      return;
    }
    try {
      const originalStatus = workspace.originalRepoRoot === null
        ? ""
        : await readLocalGitStatus({
          folderPath: workspace.originalRepoRoot,
          gitTimeoutMs: this.options.workspaceGitTimeoutMs,
          signal,
        });
      if (originalStatus !== "") {
        throw new Error(`original-repo-dirty-before-diff:${originalStatus}`);
      }
      const diff = await generateLocalWorkspaceDiff({
        worktreePath: workspace.worktreePath,
        runDir,
        baseRef: workspace.baseRef,
        branchName: workspace.branchName,
        originalRepoRoot: workspace.originalRepoRoot,
        gitTimeoutMs: this.options.workspaceGitTimeoutMs,
        signal,
      });
      await this.storeCall("local-console-store-record-workspace-diff", () =>
        this.sessionFactStore().recordWorkspaceDiff({
          sessionId,
          runId,
          originalRepoRoot: workspace.originalRepoRoot,
          baseRef: diff.baseRef,
          branchName: diff.branchName,
          worktreePath: diff.worktreePath,
          patchPath: diff.patchPath,
          affectedFiles: diff.affectedFiles,
          status: "generated",
          error: null,
          now: this.nowIso(),
        }),
      );
    } catch (error) {
      const message = formatLocalError(error);
      log({ event: "local-console-workspace-diff-failed", error: message, sessionId, runId });
      await this.sessionFactStore().recordWorkspaceDiff({
        sessionId,
        runId,
        originalRepoRoot: workspace.originalRepoRoot,
        baseRef: workspace.baseRef ?? "unknown",
        branchName: workspace.branchName ?? "unknown",
        worktreePath: workspace.worktreePath,
        patchPath: path.join(runDir, "workspace.patch"),
        affectedFiles: [],
        status: "failed",
        error: message,
        now: this.nowIso(),
      });
    }
  }

  private async storeCall<T>(label: string, operation: () => Promise<T>): Promise<T> {
    return await withLocalConsoleTimeout(Promise.resolve().then(operation), this.storeTimeoutMs, label);
  }

  private sessionFactStore(): SessionFactWritingStore {
    const store = this.options.store as Partial<SessionFactWritingStore> & LocalConsoleStore;
    if (
      typeof store.createChildSession !== "function" ||
      typeof store.recordChildSessionCard !== "function" ||
      typeof store.recordWorkspaceDiff !== "function" ||
      typeof store.recordProgressEvent !== "function" ||
      typeof store.getSessionFactLogPath !== "function"
    ) {
      throw new Error("local console store does not provide the session fact write funnel");
    }
    return store as SessionFactWritingStore;
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
}

function buildFallbackProjectSummary(projectRoot: string): LocalConsoleProjectSummary {
  return {
    projectId: "local",
    sourceType: "local-folder",
    title: path.basename(projectRoot) || projectRoot,
    folderPath: projectRoot,
    worktreeMode: false,
    workspaceCwd: projectRoot,
    workspaceMode: "direct",
    worktreePath: null,
    worktreeUnavailableReason: null,
    workspaceUpdatedAt: null,
    sessions: [],
    runningCount: 0,
    waitingCount: 0,
    stuckCount: 0,
    errorCount: 0,
  };
}

function normalizeTitle(title: string | undefined): string {
  const trimmed = title?.trim();
  if (trimmed === undefined || trimmed === "") {
    return "新会话";
  }
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}...` : trimmed;
}

export async function withLocalConsoleTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new LocalConsoleStoreTimeoutError(label, timeoutMs)), timeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
  }
}

export function formatLocalError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireAgentFilePath(agent: LocalConsoleAgentFile): string {
  if (agent.path === undefined) {
    throw new Error(`Agent snapshot has no content: ${agent.name}`);
  }
  return agent.path;
}

async function directoryAvailable(folderPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) {
      return false;
    }
    await fs.access(folderPath);
    return true;
  } catch {
    return false;
  }
}

function collectLocalCeoLedgerTaskIds(finalText: string): string[] {
  const jsonText = stripLocalCeoJson(finalText);
  if (jsonText === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!isPlainObject(parsed)) {
    return [];
  }
  const issues = parsed["issues"];
  if (!Array.isArray(issues)) {
    return [];
  }
  return issues
    .map((issue) => (isPlainObject(issue) && typeof issue["ledgerTaskId"] === "string" ? issue["ledgerTaskId"] : null))
    .filter((value): value is string => value !== null && value.trim() !== "");
}

function stripLocalCeoJson(finalText: string): string | null {
  const marker = `<!-- agent-moebius:stage=${CEO_ORCHESTRATION_STAGE} -->`;
  const withoutMarker = finalText.includes(marker) ? finalText.slice(0, finalText.lastIndexOf(marker)).trim() : finalText.trim();
  const fenced = withoutMarker.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/u);
  return (fenced?.[1] ?? withoutMarker).trim();
}

function localOrchestrationKey(input: {
  parentSessionId: string;
  workflowId: string;
  ledgerTaskId: string;
}): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${input.parentSessionId}|${input.workflowId}|${input.ledgerTaskId}`)
    .digest("hex")
    .slice(0, 32);
  return `agent-moebius-local-orchestration-key:${digest}`;
}

function localChildSessionId(parentSessionId: string, ledgerTaskId: string): string {
  const digest = crypto.createHash("sha256").update(`${parentSessionId}|${ledgerTaskId}`).digest("hex").slice(0, 12);
  return `local:child:${slugForLocalSessionId(ledgerTaskId)}:${digest}`;
}

function slugForLocalSessionId(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return slug === "" ? "task" : slug.slice(0, 40);
}

function renderLocalChildSessionInitialBody(input: {
  parentSessionId: string;
  workflowId: string;
  group: CeoOrchestrationGroup;
  descriptor: CeoChildIssueDescriptor;
  orchestrationKey: string;
}): string {
  const taskChecks = input.descriptor.acceptanceStatements.map((statement, index) => `${String(index + 1)}. ${statement}`).join("\n");
  const dependencies =
    input.descriptor.dependencies.length === 0
      ? "- none"
      : input.descriptor.dependencies.map((dependency) => `- ${dependency}`).join("\n");

  return `${input.descriptor.description.trimEnd()}

Parent session: ${input.parentSessionId}
Ledger task id: ${input.descriptor.ledgerTaskId}
Workflow id: ${input.workflowId}
Quality baseline: ${input.descriptor.qualityBaseline}

Dependencies:
${dependencies}
${taskChecks === "" ? "" : `\n任务检查参考:\n${taskChecks}\n`}

Initial handoff:
@${input.descriptor.initialRole} 请按任务描述、质量基准和现有上下文推进。

Conflict group: ${input.group.id}
Conflict reason: ${input.group.reason}

Provenance:
${input.descriptor.provenance}

<!-- ${input.orchestrationKey} -->`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
