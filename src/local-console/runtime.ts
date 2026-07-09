import fs from "node:fs/promises";
import path from "node:path";
import { parseAgentManifest } from "../agent-manifest.js";
import { buildRolePromptPlan } from "../conversation.js";
import {
  type CodexRunOptions,
  type CodexRunResult,
  codexTimeoutKind,
  isInterruptedCodexRunResult,
} from "../codex.js";
import { log } from "../log.js";
import { resolveTrigger } from "../triggers/index.js";
import { readLocalConsoleOutputTail } from "./output-tail.js";
import { buildLocalConsoleTimeline } from "./timeline.js";
import {
  LOCAL_CONSOLE_DEFAULT_SESSION_ID,
  LOCAL_CONSOLE_PROJECT_ID,
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
  sessionId?: string;
  storeTimeoutMs?: number;
  codexIdleTimeoutMs?: number;
  codexMaxDurationMs?: number;
  staleRunningGraceMs?: number;
  now?: () => Date;
}

interface ActiveLocalRun {
  sessionId: string;
  runId: string;
  userMessageId: number;
  role: string | null;
  runDir: string | null;
  startedAt: string;
  controller: AbortController;
}

export class LocalConsoleRuntime {
  private readonly sessionId: string;
  private readonly storeTimeoutMs: number;
  private readonly codexIdleTimeoutMs?: number;
  private readonly codexMaxDurationMs?: number;
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
    this.staleRunningGraceMs = options.staleRunningGraceMs ?? 5_000;
    this.now = options.now ?? (() => new Date());
  }

  async init(): Promise<void> {
    await this.storeCall("local-console-store-init", () => this.options.store.init());
    const sessions = await this.storeCall("local-console-store-list-sessions", () => this.options.store.listSessions());
    const sessionIds = sessions.length === 0 ? [this.sessionId] : sessions.map((session) => session.sessionId);
    await Promise.all(sessionIds.map((sessionId) => this.repairStaleRunning(sessionId)));
  }

  async close(): Promise<void> {
    for (const active of this.activeRuns.values()) {
      active.controller.abort("runtime-closing");
    }
    await this.options.store.close();
  }

  async createSession(title?: string): Promise<LocalConsoleSessionSummary> {
    const sessionId = `local:${this.now().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
    return await this.storeCall("local-console-store-create-session", () =>
      this.options.store.createSession({
        sessionId,
        title: normalizeTitle(title),
        now: this.nowIso(),
      }),
    );
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

  async state(selectedSessionId = this.sessionId): Promise<LocalConsoleStateSnapshot> {
    const sessions = await this.storeCall("local-console-store-list-sessions", () => this.options.store.listSessions());
    const selectedSession = sessions.find((session) => session.sessionId === selectedSessionId) ?? sessions[0] ?? null;
    const sessionId = selectedSession?.sessionId ?? selectedSessionId;
    const messages = selectedSession === null
      ? []
      : await this.storeCall("local-console-store-list", () => this.options.store.listMessages(sessionId));
    return {
      project: buildProjectSummary(sessions),
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
            await this.recordNoTrigger(claimedMessage, sessionId, nextRunId);
            continue;
          }

          const selectedAgent = agentFiles.find((agent) => agent.name === trigger.role);
          if (selectedAgent === undefined) {
            await this.recordFailureBestEffort(claimedMessage, sessionId, nextRunId, null, `Agent not found: ${trigger.role}`);
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
          this.activeRuns.set(sessionId, {
            sessionId,
            runId: nextRunId,
            userMessageId: claimedMessage.id,
            role: trigger.role,
            runDir: resolvedRunDir,
            startedAt: this.nowIso(),
            controller,
          });

          const result = await this.options.runCodex({
            prompt: plan.prompt,
            runDir: activeRunDir,
            cwd: this.options.projectRoot,
            mode: { kind: "full" },
            signal: controller.signal,
            ...(this.codexIdleTimeoutMs === undefined ? {} : { idleTimeoutMs: this.codexIdleTimeoutMs }),
            ...(this.codexMaxDurationMs === undefined ? {} : { maxDurationMs: this.codexMaxDurationMs }),
          });

          if (!result.ok) {
            await this.recordFailedCodexResult(claimedMessage, sessionId, nextRunId, result);
            return;
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
            await this.releaseForRetryBestEffort(claimedMessage, sessionId);
            activeMessage = null;
            activeRunId = null;
            activeRunDir = null;
            throw error;
          }
          this.lastError = null;
        } catch (error) {
          this.lastError = formatLocalError(error);
          if (activeMessage !== null && activeRunId !== null) {
            await this.recordFailureBestEffort(activeMessage, sessionId, activeRunId, activeRunDir, this.lastError);
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
    await Promise.all(sessionIds.map((sessionId) => this.processPending(sessionId)));
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
    await this.recordFailureBestEffort(message, sessionId, runId, result.runDir, result.reason);
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
      stdoutTail: tail.stdoutTail,
      stderrTail: tail.stderrTail,
      lastOutputSummary: tail.lastOutputSummary,
      tailDiagnostic: tail.tailDiagnostic,
      interruptible: true,
    };
  }

  private async recordFailureBestEffort(
    message: LocalConsoleMessage,
    sessionId: string,
    runId: string | null,
    runDir: string | null,
    error: string,
  ): Promise<void> {
    try {
      await this.storeCall("local-console-store-record-failure", () =>
        this.options.store.recordFailure({
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
      log({ event: "local-console-record-failure-failed", error: this.lastError, originalError: error });
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

  private async storeCall<T>(label: string, operation: () => Promise<T>): Promise<T> {
    return await withLocalConsoleTimeout(Promise.resolve().then(operation), this.storeTimeoutMs, label);
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
}

function buildProjectSummary(sessions: LocalConsoleSessionSummary[]): LocalConsoleProjectSummary {
  return {
    projectId: LOCAL_CONSOLE_PROJECT_ID,
    title: "agent-moebius",
    sessions,
    runningCount: sessions.reduce((sum, session) => sum + session.runningCount, 0),
    waitingCount: sessions.reduce((sum, session) => sum + session.waitingCount, 0),
    stuckCount: sessions.reduce((sum, session) => sum + session.stuckCount, 0),
    errorCount: sessions.reduce((sum, session) => sum + session.errorCount, 0),
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
