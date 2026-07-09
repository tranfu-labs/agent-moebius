import fs from "node:fs/promises";
import path from "node:path";
import { parseAgentManifest } from "../agent-manifest.js";
import { buildRolePromptPlan } from "../conversation.js";
import { type CodexRunOptions, type CodexRunResult, codexTimeoutKind } from "../codex.js";
import { log } from "../log.js";
import { resolveTrigger } from "../triggers/index.js";
import { buildLocalConsoleTimeline } from "./timeline.js";
import {
  LOCAL_CONSOLE_DEFAULT_SESSION_ID,
  LocalConsoleBusyError,
  LocalConsoleStoreTimeoutError,
  type LocalConsoleMessage,
  type LocalConsoleSnapshot,
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

export class LocalConsoleRuntime {
  private readonly sessionId: string;
  private readonly storeTimeoutMs: number;
  private readonly codexIdleTimeoutMs?: number;
  private readonly codexMaxDurationMs?: number;
  private readonly staleRunningGraceMs: number;
  private readonly now: () => Date;
  private processing = false;
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
    await this.repairStaleRunning();
  }

  async close(): Promise<void> {
    await this.options.store.close();
  }

  async submitUserMessage(body: string): Promise<LocalConsoleMessage> {
    const trimmed = body.trim();
    if (trimmed === "") {
      throw new Error("Message body must not be empty");
    }

    if (this.processing || (await this.storeCall("local-console-store-has-running", () => this.options.store.hasRunningMessage(this.sessionId)))) {
      throw new LocalConsoleBusyError();
    }

    const message = await this.storeCall("local-console-store-append-user", () =>
      this.options.store.appendUserMessage({
        sessionId: this.sessionId,
        body: trimmed,
        now: this.nowIso(),
      }),
    );
    void this.processPending();
    return message;
  }

  async snapshot(): Promise<LocalConsoleSnapshot> {
    const messages = await this.storeCall("local-console-store-list", () => this.options.store.listMessages(this.sessionId));
    return {
      sessionId: this.sessionId,
      status: messages.some((message) => message.status === "running")
        ? "running"
        : messages.some((message) => message.status === "failed")
          ? "failed"
          : "idle",
      messages,
      sqlitePath: this.options.store.sqlitePath,
      lastError: this.lastError,
    };
  }

  async processPending(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    let claimed: LocalConsoleMessage | null = null;
    let runId: string | null = null;
    let runDir: string | null = null;

    try {
      await this.repairStaleRunning();
      if (await this.storeCall("local-console-store-has-running", () => this.options.store.hasRunningMessage(this.sessionId))) {
        return;
      }

      const nextRunId = `local-${this.now().toISOString()}-${Math.random().toString(36).slice(2, 10)}`;
      runId = nextRunId;
      claimed = await this.storeCall("local-console-store-claim", () =>
        this.options.store.claimNextPendingMessage({
          sessionId: this.sessionId,
          runId: nextRunId,
          now: this.nowIso(),
        }),
      );
      if (claimed === null) {
        return;
      }
      const activeMessage = claimed;
      const activeRunId = nextRunId;

      const agentFiles = await this.options.listAgentFiles();
      const messages = await this.storeCall("local-console-store-list", () => this.options.store.listMessages(this.sessionId));
      const timeline = buildLocalConsoleTimeline(
        messages,
        agentFiles.map((agent) => agent.name),
      );
      const trigger = resolveTrigger({
        timeline,
        availableAgentNames: agentFiles.map((agent) => agent.name),
      });

      if (trigger.kind !== "run-agent") {
        await this.storeCall("local-console-store-no-trigger", () =>
          this.options.store.recordSystemAndComplete({
            userMessageId: activeMessage.id,
            sessionId: this.sessionId,
            body: "No valid agent mention found in the latest local message.",
            runId: activeRunId,
            runDir: null,
            now: this.nowIso(),
          }),
        );
        return;
      }

      const selectedAgent = agentFiles.find((agent) => agent.name === trigger.role);
      if (selectedAgent === undefined) {
        await this.recordFailureBestEffort(activeMessage, activeRunId, null, `Agent not found: ${trigger.role}`);
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
            userMessageId: activeMessage.id,
            sessionId: this.sessionId,
            body: `Skipped local run: ${plan.reason}`,
            runId: activeRunId,
            runDir: null,
            now: this.nowIso(),
          }),
        );
        return;
      }

      const activeRunDir = this.options.makeRunDir(messages.length, this.now());
      runDir = activeRunDir;
      await this.storeCall("local-console-store-set-rundir", () =>
        this.options.store.setRunDir({
          id: activeMessage.id,
          runDir: path.resolve(activeRunDir),
          now: this.nowIso(),
        }),
      );

      const result = await this.options.runCodex({
        prompt: plan.prompt,
        runDir: activeRunDir,
        cwd: this.options.projectRoot,
        mode: { kind: "full" },
        ...(this.codexIdleTimeoutMs === undefined ? {} : { idleTimeoutMs: this.codexIdleTimeoutMs }),
        ...(this.codexMaxDurationMs === undefined ? {} : { maxDurationMs: this.codexMaxDurationMs }),
      });

      if (!result.ok) {
        const timeoutKind = codexTimeoutKind(result.reason);
        if (timeoutKind !== null) {
          log({
            event: timeoutKind === "idle" ? "local-console-codex-idle-timeout" : "local-console-codex-watchdog-timeout",
            runDir: result.runDir,
            reason: result.reason,
          });
        }
        await this.recordFailureBestEffort(activeMessage, activeRunId, result.runDir, result.reason);
        return;
      }

      await this.storeCall("local-console-store-record-agent-response", () =>
        this.options.store.recordAgentResponse({
          userMessageId: activeMessage.id,
          sessionId: this.sessionId,
          role: trigger.role,
          body: result.finalText,
          runId: activeRunId,
          runDir: result.runDir,
          now: this.nowIso(),
        }),
      );
      this.lastError = null;
    } catch (error) {
      this.lastError = formatLocalError(error);
      if (claimed !== null) {
        await this.recordFailureBestEffort(claimed, runId, runDir, this.lastError);
      }
      log({ event: "local-console-processing-failed", error: this.lastError });
    } finally {
      this.processing = false;
    }
  }

  async repairStaleRunning(): Promise<number> {
    const maxDurationMs = this.codexMaxDurationMs ?? 120 * 60 * 1000;
    const cutoffIso = new Date(this.now().getTime() - maxDurationMs - this.staleRunningGraceMs).toISOString();
    return await this.storeCall("local-console-store-mark-stale", () =>
      this.options.store.markStaleRunning({
        sessionId: this.sessionId,
        cutoffIso,
        now: this.nowIso(),
        reason: `stale-running>${String(maxDurationMs + this.staleRunningGraceMs)}ms`,
      }),
    );
  }

  private async recordFailureBestEffort(
    message: LocalConsoleMessage,
    runId: string | null,
    runDir: string | null,
    error: string,
  ): Promise<void> {
    try {
      await this.storeCall("local-console-store-record-failure", () =>
        this.options.store.recordFailure({
          userMessageId: message.id,
          sessionId: this.sessionId,
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

  private async storeCall<T>(label: string, operation: () => Promise<T>): Promise<T> {
    return await withLocalConsoleTimeout(Promise.resolve().then(operation), this.storeTimeoutMs, label);
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
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
