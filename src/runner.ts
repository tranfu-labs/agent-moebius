import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_ISSUE_NO_CHANGE_LIMIT,
  ACTIVE_ISSUE_POLL_INTERVAL_MS,
  AGENT_CONTEXTS_STATE_PATH,
  AGENTS_DIR,
  CODEX_DRIVER_POOL_MAX_CONCURRENT,
  CODEX_RUN_MAX_DURATION_MS,
  CONFIG_LOG_FIELDS,
  FAILURE_RETRY_LIMIT,
  IDLE_REPOSITORY_SCAN_INTERVAL_MS,
  ISSUE_DISCOVERY_LIMIT,
  MAX_ACTIVE_ISSUES,
  RUNNING_AGENT_INTERRUPT_POLL_INTERVAL_MS,
  TICK_INTERVAL_MS,
  TMP_ROOT,
  WATCH_REPOSITORIES,
  WORKDIR_ROOT,
} from "./config.js";
import {
  formatConversationInterrupt,
  resolveConversationInterrupt,
  startPollingConversationInterruptMonitor,
  type ConversationInterrupt,
  type PollingConversationInterruptMonitor,
} from "./conversation-interrupt.js";
import { parseAgentManifest } from "./agent-manifest.js";
import { runAgentPreScript } from "./agent-prescripts/index.js";
import {
  buildFallbackFullPrompt,
  buildRolePromptPlan,
  buildTimeline,
  countMessages,
  formatAgentComment,
  resolveNextRoleThreadState,
  type TimelineMessage,
} from "./conversation.js";
import { isInterruptedCodexRunResult, run as runCodex } from "./codex.js";
import { createDriverPool, type DriverPool } from "./driver-pool.js";
import {
  createIssueDispatcher,
  foldIssueProcessingJobResult,
  issueKeyForJob,
  type IssueDispatcher,
  type IssueProcessingJob,
  type IssueProcessingJobResult,
} from "./issue-dispatcher.js";
import { runIntakeScan } from "./scanner.js";
import { createStatePersister, type StatePersister } from "./state-persister.js";
import { CEO_CORRECTED_METADATA, formatCeoComment } from "./format-ceo.js";
import {
  addReaction,
  fetchIssueWithComments,
  isGitHubIssueNotFoundError,
  listOpenIssueSummaries,
  postComment,
  publishReleaseArtifacts,
  type GitHubIssue,
  type IssueReactionContent,
  type ReactionTarget,
} from "./github.js";
import { appendMediaManifest, extractIssueMediaReferences, type MediaPromptEntry } from "./issue-media.js";
import {
  discoverOutputArtifacts,
  formatArtifactPublishingFailure,
  formatMediaPreparationFailure,
  formatPublishedArtifactsMarkdown,
  type MediaPreparationFailure,
  prepareIssueMedia,
} from "./media-assets.js";
import {
  failedIssueProcessingOutcome,
  getDueActiveIssueSources,
  isFailedIssueProcessingOutcome,
  type GitHubResponseIntakeState,
  type IssueProcessingOutcome,
  type IssueSummary,
} from "./github-response-intake.js";
import { loadGitHubResponseIntakeState, saveGitHubResponseIntakeState } from "./github-intake-state.js";
import { makeIssueSource, type IssueSource, type RepositoryRef } from "./issue-source.js";
import { log } from "./log.js";
import {
  getRoleThreadState,
  loadRoleThreadStateStore,
  saveRoleThreadStateEntry,
} from "./state.js";
import { resolveTrigger } from "./triggers/index.js";

let runDirSequence = 0;

export interface AgentFile {
  name: string;
  path: string;
}

export interface ProcessIssueSourceDependencies {
  runAgentPreScript: typeof runAgentPreScript;
  runCodex: typeof runCodex;
  addReaction: typeof addReaction;
  fetchIssueWithComments: typeof fetchIssueWithComments;
  postComment: typeof postComment;
  prepareIssueMedia: typeof prepareIssueMedia;
  discoverOutputArtifacts: typeof discoverOutputArtifacts;
  publishArtifacts: typeof publishReleaseArtifacts;
  loadRoleThreadStateStore: typeof loadRoleThreadStateStore;
  saveRoleThreadStateEntry: typeof saveRoleThreadStateEntry;
  formatCeoComment: typeof formatCeoComment;
}

const DEFAULT_PROCESS_ISSUE_SOURCE_DEPENDENCIES: ProcessIssueSourceDependencies = {
  runAgentPreScript,
  runCodex,
  addReaction,
  fetchIssueWithComments,
  postComment,
  prepareIssueMedia,
  discoverOutputArtifacts,
  publishArtifacts: publishReleaseArtifacts,
  loadRoleThreadStateStore,
  saveRoleThreadStateEntry,
  formatCeoComment,
};

export interface RunnerDependencies {
  watchRepositories: readonly RepositoryRef[];
  driverPool: DriverPool;
  listAgentFiles: typeof listAgentFiles;
  listOpenIssueSummaries: typeof listOpenIssueSummaries;
  fetchIssueWithComments: typeof fetchIssueWithComments;
  processIssueSource: typeof processIssueSource;
  postComment: typeof postComment;
  saveGitHubResponseIntakeState: typeof saveGitHubResponseIntakeState;
}

export function createDefaultCodexDriverPool(): DriverPool {
  return createDriverPool({ maxConcurrent: CODEX_DRIVER_POOL_MAX_CONCURRENT });
}

export function createDefaultRunnerDependencies(): RunnerDependencies {
  return {
    watchRepositories: WATCH_REPOSITORIES,
    driverPool: createDefaultCodexDriverPool(),
    listAgentFiles,
    listOpenIssueSummaries,
    fetchIssueWithComments,
    processIssueSource,
    postComment,
    saveGitHubResponseIntakeState,
  };
}

export interface Runner {
  heartbeat(now?: Date): Promise<void>;
  dispatcher: IssueDispatcher;
  persister: StatePersister;
}

export function createRunner(input: {
  initialState: GitHubResponseIntakeState;
  dependencies?: RunnerDependencies;
}): Runner {
  const dependencies = input.dependencies ?? createDefaultRunnerDependencies();
  const persister = createStatePersister({
    initialState: input.initialState,
    save: dependencies.saveGitHubResponseIntakeState,
  });

  let agentFiles: AgentFile[] = [];
  const dispatcher = createIssueDispatcher({
    driverPool: dependencies.driverPool,
    persister,
    runJob: async (job) => {
      const result =
        job.kind === "active"
          ? await processActiveIssueJob({
              job,
              agentFiles,
              fetchIssueWithComments: dependencies.fetchIssueWithComments,
              processIssueSource: dependencies.processIssueSource,
            })
          : await processChangedIssueJob({
              job,
              agentFiles,
              fetchIssueWithComments: dependencies.fetchIssueWithComments,
              processIssueSource: dependencies.processIssueSource,
            });

      return resolveDeadLetterForFailedResult({
        state: persister.state(),
        result,
        failureRetryLimit: FAILURE_RETRY_LIMIT,
        postComment: dependencies.postComment,
      });
    },
    timing: {
      activeIssuePollIntervalMs: ACTIVE_ISSUE_POLL_INTERVAL_MS,
      activeIssueNoChangeLimit: ACTIVE_ISSUE_NO_CHANGE_LIMIT,
    },
    policy: {
      repositories: dependencies.watchRepositories,
      maxActiveIssues: MAX_ACTIVE_ISSUES,
    },
  });

  let scanning = false;
  const heartbeat = async (now = new Date()): Promise<void> => {
    if (scanning) {
      log({ event: "skip-overlap" });
      return;
    }

    scanning = true;
    try {
      agentFiles = await dependencies.listAgentFiles();
      const changedIssues = await runIntakeScan({
        repositories: dependencies.watchRepositories,
        getState: persister.state,
        applyState: persister.update,
        now,
        listOpenIssueSummaries: dependencies.listOpenIssueSummaries,
        config: {
          idleRepositoryScanIntervalMs: IDLE_REPOSITORY_SCAN_INTERVAL_MS,
          issueDiscoveryLimit: ISSUE_DISCOVERY_LIMIT,
        },
      });

      const state = persister.state();
      const jobs: IssueProcessingJob[] = [
        ...changedIssues.map((summary) => ({ kind: "changed" as const, summary })),
        ...getDueActiveIssueSources({
          repositories: dependencies.watchRepositories,
          state,
          now,
        }).map((source) => {
          const issueState = state.issues[source.issueKey];
          return {
            kind: "active" as const,
            source,
            previousUpdatedAt: issueState?.updatedAt ?? new Date(0).toISOString(),
            previousActiveNoChangeCount: issueState?.activeNoChangeCount ?? 0,
          };
        }),
      ];

      for (const job of dedupeIssueProcessingJobs(jobs)) {
        dispatcher.dispatch(job);
      }
    } catch (error) {
      log({ event: "cycle-error", error: formatError(error) });
    } finally {
      scanning = false;
    }
  };

  return { heartbeat, dispatcher, persister };
}

function dedupeIssueProcessingJobs(jobs: IssueProcessingJob[]): IssueProcessingJob[] {
  const seen = new Set<string>();
  const result: IssueProcessingJob[] = [];
  for (const job of jobs) {
    const issueKey = issueKeyForJob(job);
    if (seen.has(issueKey)) {
      log({ event: "issue-job-deduped", issueKey });
      continue;
    }

    seen.add(issueKey);
    result.push(job);
  }

  return result;
}

async function processActiveIssueJob(input: {
  job: Extract<IssueProcessingJob, { kind: "active" }>;
  agentFiles: AgentFile[];
  fetchIssueWithComments: typeof fetchIssueWithComments;
  processIssueSource: typeof processIssueSource;
}): Promise<IssueProcessingJobResult> {
  try {
    const issue = await input.fetchIssueWithComments(input.job.source);
    if (issue.state === "CLOSED") {
      log({ event: "skip", reason: "issue-closed", issueKey: input.job.source.issueKey });
      return {
        kind: "processed",
        summary: issueSummaryFromSource(input.job.source, issue.updatedAt),
        outcome: "issue-closed",
      };
    }

    if (issue.updatedAt === input.job.previousUpdatedAt) {
      log({
        event: "active-issue-unchanged",
        issueKey: input.job.source.issueKey,
        activeNoChangeCount: input.job.previousActiveNoChangeCount + 1,
      });
      return {
        kind: "active-unchanged",
        source: input.job.source,
      };
    }

    const outcome = await input.processIssueSource({
      source: input.job.source,
      issue,
      agentFiles: input.agentFiles,
    });

    return {
      kind: "processed",
      summary: issueSummaryFromSource(input.job.source, issue.updatedAt),
      outcome,
    };
  } catch (error) {
    if (isGitHubIssueNotFoundError(error)) {
      log({ event: "skip", reason: "issue-not-found", issueKey: error.issueKey, detail: error.detail.trim() });
      return {
        kind: "processed",
        summary: issueSummaryFromSource(input.job.source, input.job.previousUpdatedAt),
        outcome: "issue-not-found",
      };
    }

    const reason = formatFailureReason(error);
    log({ event: "active-issue-fetch-failed", issueKey: input.job.source.issueKey, outcome: "failed", error: formatError(error) });
    return {
      kind: "processed",
      summary: issueSummaryFromSource(input.job.source, input.job.previousUpdatedAt),
      outcome: failedIssueProcessingOutcome({ reason }),
    };
  }
}

async function processChangedIssueJob(input: {
  job: Extract<IssueProcessingJob, { kind: "changed" }>;
  agentFiles: AgentFile[];
  fetchIssueWithComments: typeof fetchIssueWithComments;
  processIssueSource: typeof processIssueSource;
}): Promise<IssueProcessingJobResult> {
  const source = makeIssueSource(input.job.summary);

  try {
    const issue = await input.fetchIssueWithComments(source);
    if (issue.state === "CLOSED") {
      log({ event: "skip", reason: "issue-closed", issueKey: source.issueKey });
      return {
        kind: "processed",
        summary: issueSummaryFromSource(source, issue.updatedAt),
        outcome: "issue-closed",
      };
    }

    const outcome = await input.processIssueSource({
      source,
      issue,
      agentFiles: input.agentFiles,
    });

    return {
      kind: "processed",
      summary: issueSummaryFromSource(source, issue.updatedAt),
      outcome,
    };
  } catch (error) {
    if (isGitHubIssueNotFoundError(error)) {
      log({ event: "skip", reason: "issue-not-found", issueKey: error.issueKey, detail: error.detail.trim() });
      return {
        kind: "processed",
        summary: input.job.summary,
        outcome: "issue-not-found",
      };
    }

    const reason = formatFailureReason(error);
    log({ event: "issue-fetch-failed", issueKey: source.issueKey, outcome: "failed", error: formatError(error) });
    return {
      kind: "processed",
      summary: input.job.summary,
      outcome: failedIssueProcessingOutcome({ reason }),
    };
  }
}

export async function pollActiveIssue(input: {
  state: GitHubResponseIntakeState;
  source: IssueSource;
  agentFiles: AgentFile[];
  now: Date;
}, dependencies: {
  fetchIssueWithComments: typeof fetchIssueWithComments;
  processIssueSource: typeof processIssueSource;
} = {
  fetchIssueWithComments,
  processIssueSource,
}): Promise<GitHubResponseIntakeState> {
  const issueState = input.state.issues[input.source.issueKey];
  if (issueState === undefined || issueState.mode !== "active") {
    return input.state;
  }

  const result = await processActiveIssueJob({
    job: {
      kind: "active",
      source: input.source,
      previousUpdatedAt: issueState.updatedAt,
      previousActiveNoChangeCount: issueState.activeNoChangeCount,
    },
    agentFiles: input.agentFiles,
    fetchIssueWithComments: dependencies.fetchIssueWithComments,
    processIssueSource: dependencies.processIssueSource,
  });

  return foldIssueProcessingJobResult({
    state: input.state,
    result,
    now: input.now,
    timing: {
      activeIssuePollIntervalMs: ACTIVE_ISSUE_POLL_INTERVAL_MS,
      activeIssueNoChangeLimit: ACTIVE_ISSUE_NO_CHANGE_LIMIT,
    },
  });
}

async function resolveDeadLetterForFailedResult(input: {
  state: GitHubResponseIntakeState;
  result: IssueProcessingJobResult;
  failureRetryLimit: number;
  postComment: typeof postComment;
}): Promise<IssueProcessingJobResult> {
  if (input.result.kind !== "processed" || !isFailedIssueProcessingOutcome(input.result.outcome)) {
    return input.result;
  }

  const source = makeIssueSource(input.result.summary);
  const previousFailureCount = input.state.issues[source.issueKey]?.failureCount ?? 0;
  const failureCount = previousFailureCount + 1;

  if (failureCount < input.failureRetryLimit) {
    log({
      event: "issue-retry-scheduled",
      issueKey: source.issueKey,
      failureCount,
      reason: input.result.outcome.reason,
    });
    return input.result;
  }

  try {
    await input.postComment(
      source,
      formatDeadLetterComment({
        agent: input.result.outcome.agent ?? "unknown",
        reason: input.result.outcome.reason,
        failureCount,
      }),
    );
    log({
      event: "dead-letter-posted",
      issueKey: source.issueKey,
      failureCount,
      reason: input.result.outcome.reason,
    });
    return {
      ...input.result,
      outcome: "dead-lettered",
    };
  } catch (error) {
    log({
      event: "dead-letter-post-failed",
      issueKey: source.issueKey,
      failureCount,
      reason: input.result.outcome.reason,
      error: formatError(error),
    });
    return input.result;
  }
}

export async function processIssueSource(
  input: {
    source: IssueSource;
    issue: GitHubIssue;
    agentFiles: AgentFile[];
  },
  dependencies = DEFAULT_PROCESS_ISSUE_SOURCE_DEPENDENCIES,
): Promise<IssueProcessingOutcome> {
  let selectedAgentName: string | null = null;
  let published = false;

  const postVisibleComment = async (body: string): Promise<void> => {
    await dependencies.postComment(input.source, body);
    published = true;
  };

  try {
    const count = countMessages(input.issue.comments.length);
    const agentFiles = input.agentFiles;
    const agentNames = agentFiles.map((agent) => agent.name);
    const timeline = buildTimeline(input.issue.body, input.issue.comments, agentNames);
    const trigger = resolveTrigger({ timeline, availableAgentNames: agentNames });

    if (trigger.kind === "skip") {
      log({ event: "skip", count, reason: trigger.reason, issueKey: input.source.issueKey });
      return "no-trigger";
    }

    const selectedAgent = agentFiles.find((agent) => agent.name === trigger.role);
    if (selectedAgent === undefined) {
      log({ event: "skip", count, reason: "selected-agent-missing", agent: trigger.role });
      return "no-trigger";
    }
    selectedAgentName = selectedAgent.name;

    const runDir = makeRunDir(count);
    log({ event: "trigger", count, runDir, agent: selectedAgent.name, issueKey: input.source.issueKey });

    const agentMarkdown = await fs.readFile(selectedAgent.path, "utf8");
    const agentManifest = parseAgentManifest(agentMarkdown);
    const stateStore = await dependencies.loadRoleThreadStateStore();
    const existingState = getRoleThreadState(stateStore, input.source.issueKey, selectedAgent.name);
    const plan = buildRolePromptPlan({
      role: selectedAgent.name,
      agentMarkdown: agentManifest.body,
      timeline,
      state: existingState,
    });

    if (plan.kind === "skip") {
      log({ event: "skip", count, reason: plan.reason, agent: selectedAgent.name, issueKey: input.source.issueKey });
      return "no-trigger";
    }

    let codexCwd: string | undefined;
    if (agentManifest.preScript !== null) {
      const preScriptResult = await dependencies.runAgentPreScript({
        role: selectedAgent.name,
        preScript: agentManifest.preScript,
        latestIndex: plan.latestIndex,
        issueSource: input.source,
        workdirRoot: WORKDIR_ROOT,
        contextStatePath: AGENT_CONTEXTS_STATE_PATH,
      });

      if (!preScriptResult.ok) {
        log({
          event: "agent-prescript-failed",
          count,
          runDir,
          agent: selectedAgent.name,
          preScript: agentManifest.preScript,
          reason: preScriptResult.reason,
          issueKey: input.source.issueKey,
        });
        return failedIssueProcessingOutcome({ reason: preScriptResult.reason, agent: selectedAgent.name });
      }

      codexCwd = preScriptResult.codexCwd;
      log({
        event: "agent-prescript-completed",
        count,
        runDir,
        agent: selectedAgent.name,
        preScript: agentManifest.preScript,
        codexCwd,
        issueKey: input.source.issueKey,
      });
    }

    const initialMedia = await prepareMediaForPrompt({
      messages: plan.mode === "resume" ? plan.deltaMessages : timeline,
      runDir,
      count,
      agent: selectedAgent.name,
      issueKey: input.source.issueKey,
      dependencies,
    });
    if (!initialMedia.ok) {
      await postVisibleComment(formatAgentComment(selectedAgent.name, formatMediaPreparationFailure(initialMedia.failures)));
      return "triggered-success";
    }

    const interruptController = new AbortController();
    let currentThreadId = plan.mode === "resume" ? plan.threadId : null;
    let finalRunDir = runDir;
    let finalCodexStartedAtMs = Date.now();
    await addCodexExecutionReaction({
      reaction: resolveCodexExecutionReactionTarget({
        source: input.source,
        issue: input.issue,
        latestIndex: plan.latestIndex,
      }),
      agent: selectedAgent.name,
      count,
      addReaction: dependencies.addReaction,
    });

    const interruptMonitor = startAgentRunInterruptMonitor({
      source: input.source,
      agent: selectedAgent.name,
      baselineMessageCount: count,
      controller: interruptController,
      fetchIssueWithComments: dependencies.fetchIssueWithComments,
    });

    // 看门狗：单次 codex run 的总时长上限，兜底 in-flight job 永不返回导致的 skip-inflight 死锁。
    const codexWatchdog = { fired: false };
    let currentCodexRunDir = runDir;
    let resolveWatchdogResult: (result: Awaited<ReturnType<ProcessIssueSourceDependencies["runCodex"]>>) => void = () => {};
    const watchdogResult = new Promise<Awaited<ReturnType<ProcessIssueSourceDependencies["runCodex"]>>>((resolve) => {
      resolveWatchdogResult = resolve;
    });
    const runCodexWithWatchdog = (options: Parameters<ProcessIssueSourceDependencies["runCodex"]>[0]) => {
      currentCodexRunDir = options.runDir;
      return Promise.race([dependencies.runCodex(options), watchdogResult]);
    };
    const watchdogTimer = setTimeout(() => {
      codexWatchdog.fired = true;
      const reason = `codex-run-timeout:${String(CODEX_RUN_MAX_DURATION_MS)}ms`;
      interruptController.abort(reason);
      resolveWatchdogResult({
        ok: false,
        reason: `interrupted:${reason}`,
        runDir: currentCodexRunDir,
        stdoutPath: path.join(currentCodexRunDir, "stdout.jsonl"),
        stderrPath: path.join(currentCodexRunDir, "stderr.log"),
      });
    }, CODEX_RUN_MAX_DURATION_MS);
    watchdogTimer.unref();

    const resolveInterruptedOutcome = (interruptedResult: { runDir: string; reason: string }): IssueProcessingOutcome => {
      if (codexWatchdog.fired) {
        log({
          event: "codex-watchdog-timeout",
          count,
          runDir: interruptedResult.runDir,
          agent: selectedAgent.name,
          issueKey: input.source.issueKey,
          timeoutMs: CODEX_RUN_MAX_DURATION_MS,
        });
        return failedIssueProcessingOutcome({
          reason: `codex-run-timeout:${String(CODEX_RUN_MAX_DURATION_MS)}ms`,
          agent: selectedAgent.name,
        });
      }

      log({
        event: "codex-interrupted",
        count,
        runDir: interruptedResult.runDir,
        reason: interruptedResult.reason,
        agent: selectedAgent.name,
        issueKey: input.source.issueKey,
      });
      return "interrupted";
    };

    let result: Awaited<ReturnType<ProcessIssueSourceDependencies["runCodex"]>>;
    try {
      finalCodexStartedAtMs = Date.now();
      result = await runCodexWithWatchdog({
        prompt: appendMediaManifest(plan.prompt, initialMedia.prepared),
        runDir,
        cwd: codexCwd,
        signal: interruptController.signal,
        mode: plan.mode === "resume" ? { kind: "resume", threadId: plan.threadId } : { kind: "full" },
        imagePaths: initialMedia.imagePaths,
      });

      if (isInterruptedCodexRunResult(result)) {
        return resolveInterruptedOutcome(result);
      }

      if (!result.ok && plan.mode === "resume") {
        log({
          event: "codex-resume-failed",
          count,
          runDir: result.runDir,
          reason: result.reason,
          agent: selectedAgent.name,
          threadId: plan.threadId,
        });

        currentThreadId = null;
        finalRunDir = `${runDir}-fallback`;
        const fallbackMedia = await prepareMediaForPrompt({
          messages: timeline,
          runDir: finalRunDir,
          count,
          agent: selectedAgent.name,
          issueKey: input.source.issueKey,
          dependencies,
        });
        if (!fallbackMedia.ok) {
          await postVisibleComment(formatAgentComment(selectedAgent.name, formatMediaPreparationFailure(fallbackMedia.failures)));
          return "triggered-success";
        }

        finalCodexStartedAtMs = Date.now();
        result = await runCodexWithWatchdog({
          prompt: appendMediaManifest(buildFallbackFullPrompt(agentManifest.body, timeline), fallbackMedia.prepared),
          runDir: finalRunDir,
          cwd: codexCwd,
          signal: interruptController.signal,
          mode: { kind: "full" },
          imagePaths: fallbackMedia.imagePaths,
        });
      }
    } finally {
      clearTimeout(watchdogTimer);
      interruptMonitor?.stop();
    }

    if (isInterruptedCodexRunResult(result)) {
      return resolveInterruptedOutcome(result);
    }

    if (!result.ok) {
      log({ event: "codex-failed", count, runDir: result.runDir, reason: result.reason, agent: selectedAgent.name });
      return failedIssueProcessingOutcome({ reason: result.reason, agent: selectedAgent.name });
    }

    let finalInterrupt: ConversationInterrupt | null;
    try {
      finalInterrupt = await checkAgentRunInterrupt({
        source: input.source,
        agent: selectedAgent.name,
        baselineMessageCount: count,
        fetchIssueWithComments: dependencies.fetchIssueWithComments,
      });
    } catch (error) {
      // fail-open：收尾检查只是复核有没有人插话，网络抖动不该丢弃已完成的 codex 产出。
      // 假定无新消息、照常发布；运行中监视器已覆盖绝大多数中途插话。
      log({
        event: "agent-run-interrupt-check-failopen",
        agent: selectedAgent.name,
        issueKey: input.source.issueKey,
        error: formatError(error),
      });
      finalInterrupt = null;
    }

    if (finalInterrupt !== null) {
      logAgentRunInterrupt({
        source: input.source,
        agent: selectedAgent.name,
        interrupt: finalInterrupt,
      });
      return "interrupted";
    }

    const nextState = resolveNextRoleThreadState({
      currentThreadId,
      resultThreadId: result.threadId,
      latestIndex: plan.latestIndex,
    });

    if (nextState === null) {
      log({ event: "codex-failed", count, runDir: result.runDir, reason: "no-thread-id", agent: selectedAgent.name });
      return failedIssueProcessingOutcome({ reason: "no-thread-id", agent: selectedAgent.name });
    }

    const publishableFinalText = await buildPublishableFinalText({
      source: input.source,
      finalText: result.finalText,
      runDir: finalRunDir,
      cwd: codexCwd,
      startedAtMs: finalCodexStartedAtMs,
      count,
      agent: selectedAgent.name,
      dependencies,
    });
    if (!publishableFinalText.ok) {
      await postVisibleComment(formatAgentComment(selectedAgent.name, formatArtifactPublishingFailure(publishableFinalText.error)));
      return "triggered-success";
    }

    const ceoResult = await dependencies.formatCeoComment({
      agent: selectedAgent.name,
      issueContext: buildCeoIssueContext(input.source, input.issue),
      latestResponse: publishableFinalText.body,
      runDir: finalRunDir,
      runCodex: dependencies.runCodex,
    });
    logCeoGuardrailResult({
      result: ceoResult,
      count,
      agent: selectedAgent.name,
      issueKey: input.source.issueKey,
    });

    if (ceoResult.action === "APPEND") {
      const originalBody = formatAgentComment(selectedAgent.name, publishableFinalText.body);
      await postVisibleComment(originalBody);
      await dependencies.saveRoleThreadStateEntry(input.source.issueKey, selectedAgent.name, nextState);

      const ceoAppendBody = `${formatAgentComment(ceoResult.as, ceoResult.body)}\n\n${CEO_CORRECTED_METADATA}`;
      await dependencies.postComment(input.source, ceoAppendBody);
    } else {
      const postedBody = formatGuardedAgentComment(selectedAgent.name, ceoResult.body);
      await postVisibleComment(postedBody);
      await dependencies.saveRoleThreadStateEntry(input.source.issueKey, selectedAgent.name, nextState);
    }

    log({
      event: "commented",
      count,
      runDir: finalRunDir,
      agent: selectedAgent.name,
      threadId: nextState.threadId,
      cachedInputTokens: result.cachedInputTokens,
      issueKey: input.source.issueKey,
    });

    return "triggered-success";
  } catch (error) {
    // 首条可见评论成功后不再 nack 重入，避免重复发帖；成功前失败仍可安全重试。
    log({ event: "process-issue-error", issueKey: input.source.issueKey, error: formatError(error) });
    if (published) {
      return "triggered-success";
    }

    return failedIssueProcessingOutcome({
      reason: formatFailureReason(error),
      agent: selectedAgentName ?? undefined,
    });
  }
}

async function prepareMediaForPrompt(input: {
  messages: TimelineMessage[];
  runDir: string;
  count: number;
  agent: string;
  issueKey: string;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<{ ok: true; prepared: MediaPromptEntry[]; imagePaths: string[] } | { ok: false; failures: MediaPreparationFailure[] }> {
  const references = extractIssueMediaReferences(input.messages);
  if (references.length === 0) {
    return { ok: true, prepared: [], imagePaths: [] };
  }

  const result = await input.dependencies.prepareIssueMedia({ references, runDir: input.runDir });
  if (!result.ok) {
    log({
      event: "issue-media-preparation-failed",
      count: input.count,
      runDir: input.runDir,
      agent: input.agent,
      issueKey: input.issueKey,
      failures: result.failures.map((failure) => failure.reason),
    });
    return result;
  }

  log({
    event: "issue-media-prepared",
    count: input.count,
    runDir: input.runDir,
    agent: input.agent,
    issueKey: input.issueKey,
    mediaCount: result.prepared.length,
    imageCount: result.imagePaths.length,
  });
  return result;
}

async function buildPublishableFinalText(input: {
  source: IssueSource;
  finalText: string;
  runDir: string;
  cwd: string | undefined;
  startedAtMs: number;
  count: number;
  agent: string;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<{ ok: true; body: string } | { ok: false; error: unknown }> {
  const artifacts = await input.dependencies.discoverOutputArtifacts({
    cwd: input.cwd,
    runDir: input.runDir,
    finalText: input.finalText,
    startedAtMs: input.startedAtMs,
  });
  if (artifacts.length === 0) {
    return { ok: true, body: input.finalText };
  }

  try {
    const publishedArtifacts = await input.dependencies.publishArtifacts(input.source, artifacts);
    const artifactMarkdown = formatPublishedArtifactsMarkdown(publishedArtifacts);
    log({
      event: "output-artifacts-published",
      count: input.count,
      runDir: input.runDir,
      agent: input.agent,
      issueKey: input.source.issueKey,
      artifactCount: publishedArtifacts.length,
    });
    return {
      ok: true,
      body: artifactMarkdown === "" ? input.finalText : `${input.finalText.trimEnd()}\n\n${artifactMarkdown}`,
    };
  } catch (error) {
    log({
      event: "output-artifact-publish-failed",
      count: input.count,
      runDir: input.runDir,
      agent: input.agent,
      issueKey: input.source.issueKey,
      error: formatError(error),
    });
    return { ok: false, error };
  }
}

function buildCeoIssueContext(source: IssueSource, issue: GitHubIssue): {
  issueUrl: string;
  issueBody: string;
  comments: Array<{ body: string }>;
} {
  return {
    issueUrl: `https://github.com/${source.owner}/${source.repo}/issues/${source.issueNumber}`,
    issueBody: issue.body,
    comments: issue.comments.map((comment) => ({ body: comment.body })),
  };
}

function logCeoGuardrailResult(input: {
  result: Awaited<ReturnType<typeof formatCeoComment>>;
  count: number;
  agent: string;
  issueKey: string;
}): void {
  if (input.result.action === "REPLACE") {
    log({
      event: "ceo-guardrail-repaired",
      count: input.count,
      agent: input.agent,
      reason: input.result.reason,
      issueKey: input.issueKey,
    });
    return;
  }

  if (input.result.action === "APPEND") {
    log({
      event: "ceo-guardrail-appended",
      count: input.count,
      agent: input.agent,
      as: input.result.as,
      reason: input.result.reason,
      issueKey: input.issueKey,
    });
    return;
  }

  if (input.result.action === "NO_CHANGE") {
    log({
      event: "ceo-guardrail-noop",
      count: input.count,
      agent: input.agent,
      reason: input.result.reason,
      issueKey: input.issueKey,
    });
    return;
  }

  log({
    event: "ceo-guardrail-failopen",
    count: input.count,
    agent: input.agent,
    reason: input.result.reason,
    detail: input.result.detail,
    issueKey: input.issueKey,
  });
}

function formatGuardedAgentComment(role: string, finalText: string): string {
  if (!finalText.includes(CEO_CORRECTED_METADATA)) {
    return formatAgentComment(role, finalText);
  }

  const withoutCeoMetadata = finalText.replaceAll(CEO_CORRECTED_METADATA, "").trimEnd();
  return `${formatAgentComment(role, withoutCeoMetadata)}\n\n${CEO_CORRECTED_METADATA}`;
}

async function addCodexExecutionReaction(input: {
  reaction: CodexExecutionReactionTarget;
  agent: string;
  count: number;
  addReaction: (target: ReactionTarget, content: IssueReactionContent) => Promise<void>;
}): Promise<void> {
  try {
    if (input.reaction.target === null) {
      throw new Error(input.reaction.unavailableReason);
    }

    await input.addReaction(input.reaction.target, "eyes");
    log({
      event: "codex-execution-reaction-added",
      count: input.count,
      agent: input.agent,
      issueKey: input.reaction.source.issueKey,
      targetSource: input.reaction.targetSource,
      targetIndex: input.reaction.targetIndex,
    });
  } catch (error) {
    log({
      event: "codex-execution-reaction-failed",
      count: input.count,
      agent: input.agent,
      issueKey: input.reaction.source.issueKey,
      targetSource: input.reaction.targetSource,
      targetIndex: input.reaction.targetIndex,
      error: formatError(error),
    });
  }
}

type CodexExecutionReactionTarget = {
  source: IssueSource;
  targetSource: "issue-body" | "comment";
  targetIndex: number;
} & (
  | {
      target: ReactionTarget;
      unavailableReason?: never;
    }
  | {
      target: null;
      unavailableReason: string;
    }
);

function resolveCodexExecutionReactionTarget(input: {
  source: IssueSource;
  issue: GitHubIssue;
  latestIndex: number;
}): CodexExecutionReactionTarget {
  if (input.latestIndex === 0) {
    return {
      source: input.source,
      targetSource: "issue-body",
      targetIndex: input.latestIndex,
      target: { kind: "issue", source: input.source },
    };
  }

  const comment = input.issue.comments[input.latestIndex - 1];
  if (comment === undefined) {
    return {
      source: input.source,
      targetSource: "comment",
      targetIndex: input.latestIndex,
      target: null,
      unavailableReason: `missing comment for timeline index ${String(input.latestIndex)}`,
    };
  }

  return {
    source: input.source,
    targetSource: "comment",
    targetIndex: input.latestIndex,
    target: {
      kind: "issue-comment",
      source: input.source,
      commentId: comment.id,
    },
  };
}

export async function start(): Promise<NodeJS.Timeout> {
  log({ event: "start", config: CONFIG_LOG_FIELDS });
  const runner = createRunner({ initialState: await loadGitHubResponseIntakeState() });
  void runner.heartbeat();
  return setInterval(() => {
    void runner.heartbeat();
  }, TICK_INTERVAL_MS);
}

export function makeRunDir(count: number, now = new Date()): string {
  runDirSequence += 1;
  return path.join(TMP_ROOT, `agent-moebius-${now.toISOString()}-c${count}-r${runDirSequence}`);
}

async function listAgentFiles(dir = AGENTS_DIR): Promise<AgentFile[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => ({
      name: path.basename(entry.name, ".md"),
      path: path.join(dir, entry.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function issueSummaryFromSource(source: IssueSource, updatedAt: string): IssueSummary {
  return {
    owner: source.owner,
    repo: source.repo,
    issueNumber: source.issueNumber,
    updatedAt,
  };
}

export function formatDeadLetterComment(input: {
  agent: string;
  reason: string;
  failureCount: number;
}): string {
  const reason = truncateForComment(input.reason.trim() === "" ? "unknown failure" : input.reason.trim(), 2_000);
  return `Agent Moebius dead letter

Target agent: ${input.agent}
Failure reason: ${reason}
Failure count: ${String(input.failureCount)}

Recovery: fix the underlying problem, then add any new comment to this issue to trigger processing again.

<!-- agent-moebius:dead-letter -->`;
}

function startAgentRunInterruptMonitor(input: {
  source: IssueSource;
  agent: string;
  baselineMessageCount: number;
  controller: AbortController;
  fetchIssueWithComments: typeof fetchIssueWithComments;
}): PollingConversationInterruptMonitor | null {
  if (input.agent !== "dev") {
    return null;
  }

  return startPollingConversationInterruptMonitor({
    baselineSnapshot: { messageCount: input.baselineMessageCount },
    intervalMs: RUNNING_AGENT_INTERRUPT_POLL_INTERVAL_MS,
    fetchSnapshot: async () => {
      const issue = await input.fetchIssueWithComments(input.source, { signal: input.controller.signal });
      return { messageCount: countMessages(issue.comments.length) };
    },
    onInterrupt: (interrupt) => {
      logAgentRunInterrupt({
        agent: input.agent,
        source: input.source,
        interrupt,
      });
      input.controller.abort(formatConversationInterrupt(interrupt));
    },
    onError: (error) => {
      log({
        event: "agent-run-interrupt-check-failed",
        agent: input.agent,
        issueKey: input.source.issueKey,
        error: formatError(error),
      });
    },
  });
}

async function checkAgentRunInterrupt(input: {
  source: IssueSource;
  agent: string;
  baselineMessageCount: number;
  fetchIssueWithComments: typeof fetchIssueWithComments;
}): Promise<ConversationInterrupt | null> {
  if (input.agent !== "dev") {
    return null;
  }

  const issue = await input.fetchIssueWithComments(input.source);
  return resolveConversationInterrupt({
    baselineSnapshot: { messageCount: input.baselineMessageCount },
    currentSnapshot: { messageCount: countMessages(issue.comments.length) },
  });
}

function logAgentRunInterrupt(input: { source: IssueSource; agent: string; interrupt: ConversationInterrupt }): void {
  log({
    event: "agent-run-interrupt",
    reason: input.interrupt.reason,
    baselineMessageCount: input.interrupt.baselineMessageCount,
    currentMessageCount: input.interrupt.currentMessageCount,
    agent: input.agent,
    issueKey: input.source.issueKey,
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function formatFailureReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncateForComment(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

process.on("unhandledRejection", (reason) => {
  log({ event: "unhandled-rejection", error: formatError(reason) });
});

process.on("uncaughtException", (error) => {
  log({ event: "uncaught-exception", error: formatError(error) });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void start();
}
