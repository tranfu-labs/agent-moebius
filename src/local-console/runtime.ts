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
import { buildRolePromptPlan } from "../conversation.js";
import {
  type CodexRunOptions,
  type CodexRunResult,
  codexTimeoutKind,
  isInterruptedCodexRunResult,
} from "../codex.js";
import { log } from "../log.js";
import { resolveTrigger } from "../triggers/index.js";
import {
  buildLocalAcceptanceBlockedMessage,
  buildLocalAcceptanceEvidence,
  buildLocalAcceptancePrePassDecision,
  buildLocalAcceptanceReminder,
  extractLocalAcceptanceStatements,
  extractLocalTaskId,
  isLocalAcceptanceRole,
  parseLocalAcceptanceWalkthrough,
  type LocalAcceptancePrePassDecision,
} from "./acceptance-loop.js";
import { readLocalConsoleOutputTail } from "./output-tail.js";
import { maybeRouteLocalNoMentionMessage, type LocalRouteJudgment } from "./route-bus.js";
import {
  createLocalChildSession,
  listLocalT5Facts,
  recordLocalAcceptancePrePassResult,
  recordLocalWorkspaceDiff,
} from "./t5-store.js";
import { buildLocalConsoleTimeline } from "./timeline.js";
import {
  LOCAL_CONSOLE_DEFAULT_SESSION_ID,
  LocalConsoleBusyError,
  LocalConsoleStoreTimeoutError,
  type LocalConsoleMessage,
  type LocalConsoleProjectSummary,
  type LocalConsoleRunSnapshot,
  type LocalConsoleSessionSummary,
  type LocalConsoleSnapshot,
  type LocalConsoleStateSnapshot,
  type LocalConsoleStore,
} from "./types.js";
import {
  generateLocalWorkspaceDiff,
  resolveLocalWorkspaceSource,
  type ResolvedLocalWorkspace,
} from "./workspace-source.js";

export interface LocalConsoleAgentFile {
  name: string;
  path: string;
}

export interface LocalConsoleRuntimeOptions {
  store: LocalConsoleStore;
  listAgentFiles: () => Promise<LocalConsoleAgentFile[]>;
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
  now?: () => Date;
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
    for (const active of this.activeRuns.values()) {
      active.controller.abort("runtime-closing");
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
    return await this.storeCall("local-console-store-update-project", () =>
      this.options.store.updateProject({
        projectId: input.projectId,
        worktreeMode: input.worktreeMode,
        now: this.nowIso(),
      }),
    );
  }

  async createSession(title?: string, projectId?: string): Promise<LocalConsoleSessionSummary> {
    const sessionId = `local:${this.now().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
    const resolvedProjectId = projectId ?? (await this.defaultProjectId());
    return await this.storeCall("local-console-store-create-session", () =>
      this.options.store.createSession({
        sessionId,
        projectId: resolvedProjectId,
        title: normalizeTitle(title),
        now: this.nowIso(),
      }),
    );
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
    try {
      return await this.storeCall("local-console-store-create-child-session", () =>
        createLocalChildSession(
          {
            sqlitePath: this.options.store.sqlitePath,
            timeoutMs: this.storeTimeoutMs,
          },
          {
            parentSessionId: input.parentSessionId,
            childSessionId: input.childSessionId,
            projectId: input.projectId,
            title: input.title,
            relation: input.relation ?? "task",
            hiddenKey: input.hiddenKey,
            initialBody: input.initialBody,
            initialRole: input.initialRole ?? null,
            now: this.nowIso(),
          },
        ),
      );
    } catch (error) {
      const message = formatLocalError(error);
      this.lastError = message;
      await this.recordVisibleChildSessionFailureBestEffort(input.parentSessionId, message);
      throw error;
    }
  }

  async submitUserMessage(body: string, sessionId = this.sessionId): Promise<LocalConsoleMessage> {
    const trimmed = body.trim();
    if (trimmed === "") {
      throw new Error("Message body must not be empty");
    }

    if (
      this.activeRuns.has(sessionId) ||
      (await this.storeCall("local-console-store-has-running", () => this.options.store.hasRunningMessage(sessionId)))
    ) {
      throw new LocalConsoleBusyError();
    }

    const message = await this.storeCall("local-console-store-append-user", () =>
      this.options.store.appendUserMessage({
        sessionId,
        body: trimmed,
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
    const projects = await this.storeCall("local-console-store-list-projects", () => this.options.store.listProjects());
    const sessions = projects.flatMap((project) => project.sessions);
    const requestedProject = requestedProjectId === undefined ? undefined : projects.find((project) => project.projectId === requestedProjectId);
    const requestedSession = (requestedProject?.sessions ?? sessions).find((session) => session.sessionId === selectedSessionId);
    const selectedProject =
      requestedProject ??
      (requestedSession === undefined ? undefined : projects.find((project) => project.projectId === requestedSession.projectId)) ??
      projects[0] ??
      buildFallbackProjectSummary(this.options.projectRoot);
    const selectedSession =
      (requestedSession?.projectId === selectedProject.projectId ? requestedSession : undefined) ??
      selectedProject.sessions[0] ??
      (requestedProject === undefined ? sessions[0] : undefined) ??
      null;
    const sessionId = selectedSession?.sessionId ?? selectedSessionId;
    const messages = selectedSession === null
      ? []
      : await this.storeCall("local-console-store-list", () => this.options.store.listMessages(sessionId));
    return {
      projects,
      project: selectedProject,
      selectedProjectId: selectedProject.projectId,
      selectedSessionId: sessionId,
      selectedSession,
      messages,
      activeRun: await this.activeRunSnapshot(sessionId),
      sqlitePath: this.options.store.sqlitePath,
      lastError: this.lastError,
    };
  }

  async processPending(sessionId = this.sessionId): Promise<void> {
    if (this.processingSessions.has(sessionId)) {
      this.pendingProcessSessions.add(sessionId);
      return;
    }

    this.processingSessions.add(sessionId);

    try {
      while (true) {
        await this.repairStaleRunning(sessionId);
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
          const claimedMessage = activeMessage;
          let acceptanceHandled = false;
          try {
            acceptanceHandled = await this.maybeProcessAcceptancePrePass(claimedMessage, sessionId, nextRunId);
          } catch (error) {
            activeMessage = null;
            activeRunId = null;
            throw error;
          }
          if (acceptanceHandled) {
            activeMessage = null;
            activeRunId = null;
            continue;
          }

          const agentFiles = await this.options.listAgentFiles();
          const messages = await this.storeCall("local-console-store-list", () => this.options.store.listMessages(sessionId));
          const timelineMessages = messages.filter((message) => message.id <= claimedMessage.id);
          const timeline = buildLocalConsoleTimeline(
            timelineMessages,
            agentFiles.map((agent) => agent.name),
          );
          const trigger = resolveTrigger({
            timeline,
            availableAgentNames: agentFiles.map((agent) => agent.name),
          });

          if (trigger.kind !== "run-agent") {
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

          const agentMarkdown = await fs.readFile(selectedAgent.path, "utf8");
          const agentManifest = parseAgentManifest(agentMarkdown);
          const plan = buildRolePromptPlan({
            role: trigger.role,
            agentMarkdown: agentManifest.body,
            timeline,
            state: null,
          });

          if (plan.kind === "skip") {
            await this.storeCall("local-console-store-skip", () =>
              this.options.store.recordSystemAndComplete({
                userMessageId: claimedMessage.id,
                sessionId,
                body: `Skipped local run: ${plan.reason}`,
                runId: nextRunId,
                runDir: null,
                now: this.nowIso(),
              }),
            );
            continue;
          }

          activeRunDir = this.options.makeRunDir(messages.length, this.now());
          const resolvedRunDir = path.resolve(activeRunDir);
          await this.storeCall("local-console-store-set-rundir", () =>
            this.options.store.setRunDir({
              id: claimedMessage.id,
              runDir: resolvedRunDir,
              now: this.nowIso(),
            }),
          );

          const controller = new AbortController();
          const workspace = await this.resolveWorkspace(sessionId, controller.signal);
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
            startedAt: this.nowIso(),
            controller,
          });

          const result = await this.options.runCodex({
            prompt: plan.prompt,
            runDir: activeRunDir,
            cwd: workspace.cwd,
            mode: { kind: "full" },
            signal: controller.signal,
            ...(this.codexIdleTimeoutMs === undefined ? {} : { idleTimeoutMs: this.codexIdleTimeoutMs }),
            ...(this.codexMaxDurationMs === undefined ? {} : { maxDurationMs: this.codexMaxDurationMs }),
          });

          if (!result.ok) {
            await this.recordFailedCodexResult(claimedMessage, sessionId, nextRunId, result);
            return;
          }

          if (trigger.role === "ceo") {
            await this.executeLocalCeoChildSessionOrchestrationIfNeeded({
              sessionId,
              runId: nextRunId,
              runDir: result.runDir,
              finalText: result.finalText,
              availableAgentNames: agentFiles.map((agent) => agent.name),
            });
          }

          await this.recordWorkspaceDiffIfNeeded(sessionId, nextRunId, resolvedRunDir, workspace, controller.signal);

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
          this.lastError = null;
        } catch (error) {
          this.lastError = formatLocalError(error);
          if (activeMessage !== null && activeRunId !== null) {
            await this.recordFailureOrDeadLetterBestEffort(activeMessage, sessionId, activeRunId, activeRunDir, this.lastError);
          }
          log({ event: "local-console-processing-failed", error: this.lastError });
          return;
        } finally {
          this.activeRuns.delete(sessionId);
        }
      }
    } catch (error) {
      this.lastError = formatLocalError(error);
      log({ event: "local-console-processing-failed", error: this.lastError });
    } finally {
      this.processingSessions.delete(sessionId);
      if (this.pendingProcessSessions.delete(sessionId)) {
        void this.processPending(sessionId);
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

  private async resolveWorkspace(sessionId: string, signal: AbortSignal): Promise<ResolvedLocalWorkspace> {
    const source = await this.storeCall("local-console-store-session-workspace", () => this.options.store.getSessionWorkspace(sessionId));
    const workspace = await resolveLocalWorkspaceSource({
      projectId: source.projectId,
      sessionId,
      folderPath: source.folderPath,
      worktreeMode: source.worktreeMode,
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
      await this.recordInterruptedBestEffort(message, sessionId, runId, result.runDir, result.reason);
      return;
    }
    await this.recordFailureOrDeadLetterBestEffort(message, sessionId, runId, result.runDir, result.reason);
  }

  private async maybeProcessAcceptancePrePass(
    message: LocalConsoleMessage,
    sessionId: string,
    runId: string,
  ): Promise<boolean> {
    if (message.speaker !== "agent" || !isLocalAcceptanceRole(message.role)) {
      return false;
    }
    const role = message.role;

    const context = await this.loadAcceptanceContext(sessionId);
    const taskId = extractLocalTaskId(context.initialBody ?? "", `local-task:${sessionId}`);
    const parseResult = parseLocalAcceptanceWalkthrough(message.body, context.acceptanceStatements);
    const decision = buildLocalAcceptancePrePassDecision({
      message,
      role,
      taskId,
      acceptanceStatements: context.acceptanceStatements,
      parseResult,
    });
    if (decision === null) {
      return false;
    }

    const parentEvent =
      decision.kind === "pass" && context.parentSessionId !== null
        ? {
            eventKey: `local-acceptance:${sessionId}:${taskId}`,
            status: "requested" as const,
            detail: {
              childSessionId: sessionId,
              taskId,
              role,
              messageId: message.id,
              verdict: "passed",
            },
          }
        : null;
    const repair =
      decision.kind === "fail"
        ? this.buildRepairDescriptor({
            sessionId,
            parentSessionId: context.parentSessionId,
            taskId,
            role,
            messageId: message.id,
            statementResults: decision.statementResults,
          })
        : null;

    try {
      await this.storeCall("local-console-store-acceptance-prepass", () =>
        recordLocalAcceptancePrePassResult(
          {
            sqlitePath: this.options.store.sqlitePath,
            timeoutMs: this.storeTimeoutMs,
          },
          {
            sessionId,
            messageId: message.id,
            runId,
            taskId,
            role,
            verdict: decision.kind === "pass" ? "passed" : decision.kind === "fail" ? "failed" : decision.kind === "blocked" ? "blocked" : "format_error",
            evidence: this.buildAcceptanceEvidence(message, decision),
            visibleBody: this.buildAcceptanceVisibleBody(decision),
            parentSessionId: context.parentSessionId,
            parentEventKey: parentEvent?.eventKey ?? null,
            parentEventStatus: parentEvent?.status ?? null,
            parentEventDetail: parentEvent?.detail ?? null,
            repairChildSessionId: repair?.childSessionId ?? null,
            repairTitle: repair?.title ?? null,
            repairHiddenKey: repair?.hiddenKey ?? null,
            repairInitialBody: repair?.initialBody ?? null,
            now: this.nowIso(),
          },
        ),
      );
      return true;
    } catch (error) {
      await this.releaseForRetryBestEffort(message, sessionId);
      throw error;
    }
  }

  private async loadAcceptanceContext(sessionId: string): Promise<{
    parentSessionId: string | null;
    initialBody: string | null;
    acceptanceStatements: string[];
  }> {
    const messages = await this.storeCall("local-console-store-list-acceptance-context", () =>
      this.options.store.listMessages(sessionId),
    );
    const initialBody =
      messages.find((message) =>
        (message.speaker === "user" || message.speaker === "system") &&
        /(?:Acceptance statements|验收语句)/iu.test(message.body)
      )?.body ?? null;
    const facts = await this.storeCall("local-console-store-list-acceptance-edges", () =>
      listLocalT5Facts({ sqlitePath: this.options.store.sqlitePath, timeoutMs: this.storeTimeoutMs }, sessionId),
    );
    const edge = (facts.sessionEdges as Array<{ parent_session_id?: unknown; child_session_id?: unknown }>).find((entry) =>
      entry.child_session_id === sessionId,
    );
    return {
      parentSessionId: typeof edge?.parent_session_id === "string" ? edge.parent_session_id : null,
      initialBody,
      acceptanceStatements: initialBody === null ? [] : extractLocalAcceptanceStatements(initialBody),
    };
  }

  private buildAcceptanceVisibleBody(decision: LocalAcceptancePrePassDecision): string {
    if (decision.kind === "blocked") {
      return buildLocalAcceptanceBlockedMessage({ role: decision.role, reason: decision.diagnostics.join(", ") });
    }
    if (decision.kind === "format-error") {
      return buildLocalAcceptanceReminder({
        role: decision.role,
        expectedCount: decision.acceptanceStatements.length,
        diagnostics: decision.diagnostics,
      });
    }
    const label = decision.kind === "pass" ? "通过" : "不通过";
    return [
      `本地验收事实已记录：${label}`,
      `taskId: ${decision.taskId}`,
      `role: ${decision.role}`,
      `statementResults: ${decision.statementResults.map((result) => `${result.index}:${result.status}`).join(", ")}`,
    ].join("\n");
  }

  private buildAcceptanceEvidence(
    message: LocalConsoleMessage,
    decision: LocalAcceptancePrePassDecision,
  ): Record<string, unknown> {
    if (decision.kind === "pass" || decision.kind === "fail") {
      return buildLocalAcceptanceEvidence({
        message,
        role: decision.role,
        taskId: decision.taskId,
        acceptanceStatements: decision.acceptanceStatements,
        parsed: {
          kind: "parsed",
          verdict: decision.kind === "pass" ? "passed" : "failed",
          statementResults: decision.statementResults,
          rawConclusion: decision.rawConclusion ?? (decision.kind === "pass" ? "通过" : "不通过"),
        },
      });
    }
    return {
      role: decision.role,
      taskId: decision.taskId,
      messageId: message.id,
      sourceBodyDigest: decision.bodyDigest,
      diagnostics: decision.diagnostics,
      acceptanceStatements: decision.acceptanceStatements,
    };
  }

  private buildRepairDescriptor(input: {
    sessionId: string;
    parentSessionId: string | null;
    taskId: string;
    role: string;
    messageId: number;
    statementResults: LocalAcceptancePrePassDecision["statementResults"];
  }): {
    childSessionId: string;
    title: string;
    hiddenKey: string;
    initialBody: string;
  } {
    const owner = input.parentSessionId ?? input.sessionId;
    const digest = Buffer.from(`${owner}:${input.taskId}:${input.role}`).toString("base64url").slice(0, 16);
    const failed = input.statementResults.filter((result) => result.status === "failed").map((result) => `${result.index}. ${result.evidence}`);
    return {
      childSessionId: `local:repair:${digest}`,
      title: `Repair ${input.taskId}`,
      hiddenKey: `local-acceptance-repair:${digest}`,
      initialBody: [
        `Repair handoff for ${input.taskId}`,
        "",
        `Source session: ${input.sessionId}`,
        `Source message: ${input.messageId}`,
        "Failed statements:",
        ...(failed.length === 0 ? ["- 未提供逐条失败依据"] : failed.map((line) => `- ${line}`)),
        "",
        "Initial handoff:",
        "@dev 请修复本地验收不通过项。",
      ].join("\n"),
    };
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
        body: "No valid agent mention found in the latest local message.",
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
  ): Promise<void> {
    try {
      await this.storeCall("local-console-store-record-interrupted", () =>
        this.options.store.recordInterrupted({
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
          body: `Local child session orchestration failed: ${reason}`,
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
  }): Promise<void> {
    const visibleTaskIds = collectLocalCeoLedgerTaskIds(input.finalText);
    if (visibleTaskIds.length === 0) {
      return;
    }
    const scripts = await loadCeoScripts({ agentsDir: path.join(this.options.projectRoot, "agents"), required: false });
    const parsed = parseCeoOrchestrationOutput({
      output: input.finalText,
      scripts,
      availableAgentNames: input.availableAgentNames,
      visibleTaskIds,
    });
    if (!parsed.ok) {
      return;
    }
    const descriptors =
      parsed.value.action === "spawn_child_issues"
        ? { workflowId: parsed.value.workflowId, groups: parsed.value.groups, issues: parsed.value.issues }
        : parsed.value.action === "goal_intake" && parsed.value.mode === "confirm"
          ? { workflowId: parsed.value.workflowId, groups: parsed.value.groups, issues: parsed.value.issues }
          : null;
    if (descriptors === null || descriptors.issues.length === 0) {
      return;
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
    await this.storeCall("local-console-store-child-session-summary", () =>
      this.options.store.recordSystemMessage({
        sessionId: input.sessionId,
        body: `Local child session orchestration completed: ${created.map((session) => session.sessionId).join(", ")}`,
        runId: input.runId,
        runDir: input.runDir,
        error: null,
        status: "displayed",
        now: this.nowIso(),
      }),
    );
    for (const child of created) {
      void this.processPending(child.sessionId);
    }
  }

  private async recordWorkspaceDiffIfNeeded(
    sessionId: string,
    runId: string,
    runDir: string,
    workspace: ResolvedLocalWorkspace,
    signal: AbortSignal,
  ): Promise<void> {
    if (workspace.mode !== "worktree" || workspace.worktreePath === null) {
      return;
    }
    try {
      const diff = await generateLocalWorkspaceDiff({
        worktreePath: workspace.worktreePath,
        runDir,
        baseRef: workspace.baseRef,
        branchName: workspace.branchName,
        gitTimeoutMs: this.options.workspaceGitTimeoutMs,
        signal,
      });
      await this.storeCall("local-console-store-record-workspace-diff", () =>
        recordLocalWorkspaceDiff(
          {
            sqlitePath: this.options.store.sqlitePath,
            timeoutMs: this.storeTimeoutMs,
          },
          {
            sessionId,
            runId,
            baseRef: diff.baseRef,
            branchName: diff.branchName,
            worktreePath: diff.worktreePath,
            patchPath: diff.patchPath,
            status: "generated",
            error: null,
            now: this.nowIso(),
          },
        ),
      );
    } catch (error) {
      const message = formatLocalError(error);
      log({ event: "local-console-workspace-diff-failed", error: message, sessionId, runId });
      await recordLocalWorkspaceDiff(
        {
          sqlitePath: this.options.store.sqlitePath,
          timeoutMs: this.storeTimeoutMs,
        },
        {
          sessionId,
          runId,
          baseRef: workspace.baseRef ?? "unknown",
          branchName: workspace.branchName ?? "unknown",
          worktreePath: workspace.worktreePath,
          patchPath: path.join(runDir, "workspace.patch"),
          status: "failed",
          error: message,
          now: this.nowIso(),
        },
      );
    }
  }

  private async storeCall<T>(label: string, operation: () => Promise<T>): Promise<T> {
    return await withLocalConsoleTimeout(Promise.resolve().then(operation), this.storeTimeoutMs, label);
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
  const acceptance = input.descriptor.acceptanceStatements.map((statement, index) => `${String(index + 1)}. ${statement}`).join("\n");
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

Acceptance statements:
${acceptance}

Initial handoff:
@${input.descriptor.initialRole} 请按本子会话的质量基准与验收语句推进。

Conflict group: ${input.group.id}
Conflict reason: ${input.group.reason}

Provenance:
${input.descriptor.provenance}

<!-- ${input.orchestrationKey} -->`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
