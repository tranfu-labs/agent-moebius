import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_ISSUE_NO_CHANGE_LIMIT,
  ACTIVE_ISSUE_POLL_INTERVAL_MS,
  AGENT_CONTEXTS_STATE_PATH,
  AGENTS_DIR,
  CODEX_DRIVER_POOL_MAX_CONCURRENT,
  CONFIG_LOG_FIELDS,
  IDLE_REPOSITORY_SCAN_INTERVAL_MS,
  ISSUE_DISCOVERY_LIMIT,
  MAX_ACTIVE_ISSUES,
  RUNNING_AGENT_INTERRUPT_POLL_INTERVAL_MS,
  MAX_SELF_REFLECT,
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
  type GitHubIssue,
  type IssueReactionContent,
  type ReactionTarget,
} from "./github.js";
import {
  getDueActiveIssueSources,
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
import { appendPostedComment, decideNextSelfReflectStep } from "./triggers/self-reflect.js";

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
    runJob: (job) =>
      job.kind === "active"
        ? processActiveIssueJob({
            job,
            agentFiles,
            fetchIssueWithComments: dependencies.fetchIssueWithComments,
            processIssueSource: dependencies.processIssueSource,
          })
        : processChangedIssueJob({
            job,
            agentFiles,
            fetchIssueWithComments: dependencies.fetchIssueWithComments,
            processIssueSource: dependencies.processIssueSource,
          }),
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

    log({ event: "active-issue-fetch-failed", issueKey: input.job.source.issueKey, error: formatError(error) });
    return {
      kind: "processed",
      summary: issueSummaryFromSource(input.job.source, input.job.previousUpdatedAt),
      outcome: "failed",
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

    log({ event: "issue-fetch-failed", issueKey: source.issueKey, error: formatError(error) });
    return {
      kind: "processed",
      summary: input.job.summary,
      outcome: "failed",
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

export async function processIssueSource(
  input: {
    source: IssueSource;
    issue: GitHubIssue;
    agentFiles: AgentFile[];
  },
  dependencies = DEFAULT_PROCESS_ISSUE_SOURCE_DEPENDENCIES,
): Promise<IssueProcessingOutcome> {
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

    if (trigger.kind === "post-comment") {
      await dependencies.postComment(input.source, trigger.body);
      log({
        event: "hook-commented",
        count,
        reason: trigger.reason,
        agent: trigger.role,
        sourceRole: trigger.sourceRole,
        sourceIndex: trigger.sourceIndex,
        stage: trigger.stage,
        issueKey: input.source.issueKey,
      });
      return "triggered-success";
    }

    const selectedAgent = agentFiles.find((agent) => agent.name === trigger.role);
    if (selectedAgent === undefined) {
      log({ event: "skip", count, reason: "selected-agent-missing", agent: trigger.role });
      return "no-trigger";
    }

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
        return "failed";
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

    const interruptController = new AbortController();
    let currentThreadId = plan.mode === "resume" ? plan.threadId : null;
    let finalRunDir = runDir;
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
    let result: Awaited<ReturnType<ProcessIssueSourceDependencies["runCodex"]>>;
    try {
      result = await dependencies.runCodex({
        prompt: plan.prompt,
        runDir,
        cwd: codexCwd,
        signal: interruptController.signal,
        mode: plan.mode === "resume" ? { kind: "resume", threadId: plan.threadId } : { kind: "full" },
      });

      if (isInterruptedCodexRunResult(result)) {
        log({
          event: "codex-interrupted",
          count,
          runDir: result.runDir,
          reason: result.reason,
          agent: selectedAgent.name,
          issueKey: input.source.issueKey,
        });
        return "interrupted";
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
        result = await dependencies.runCodex({
          prompt: buildFallbackFullPrompt(agentManifest.body, timeline),
          runDir: finalRunDir,
          cwd: codexCwd,
          signal: interruptController.signal,
          mode: { kind: "full" },
        });
      }
    } finally {
      interruptMonitor?.stop();
    }

    if (isInterruptedCodexRunResult(result)) {
      log({
        event: "codex-interrupted",
        count,
        runDir: result.runDir,
        reason: result.reason,
        agent: selectedAgent.name,
        issueKey: input.source.issueKey,
      });
      return "interrupted";
    }

    if (!result.ok) {
      log({ event: "codex-failed", count, runDir: result.runDir, reason: result.reason, agent: selectedAgent.name });
      return "failed";
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
      log({
        event: "agent-run-interrupt-check-failed",
        agent: selectedAgent.name,
        issueKey: input.source.issueKey,
        error: formatError(error),
      });
      return "failed";
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
      return "failed";
    }

    const ceoResult = await dependencies.formatCeoComment({
      agent: selectedAgent.name,
      originalRequest: input.issue.body,
      latestResponse: result.finalText,
      lastReflectorHook: findLatestReflectorHookBody(timeline),
      runDir: finalRunDir,
      runCodex: dependencies.runCodex,
    });
    logCeoGuardrailResult({
      result: ceoResult,
      count,
      agent: selectedAgent.name,
      issueKey: input.source.issueKey,
    });

    let workingTimeline = timeline;

    if (ceoResult.action === "APPEND") {
      const originalBody = formatAgentComment(selectedAgent.name, result.finalText);
      await dependencies.postComment(input.source, originalBody);
      workingTimeline = appendPostedComment(workingTimeline, selectedAgent.name, originalBody);

      const ceoAppendBody = `${formatAgentComment(ceoResult.as, ceoResult.body)}\n\n${CEO_CORRECTED_METADATA}`;
      await dependencies.postComment(input.source, ceoAppendBody);
      workingTimeline = appendPostedComment(workingTimeline, ceoResult.as, ceoAppendBody);
    } else {
      const postedBody = formatGuardedAgentComment(selectedAgent.name, ceoResult.body);
      await dependencies.postComment(input.source, postedBody);
      workingTimeline = appendPostedComment(workingTimeline, selectedAgent.name, postedBody);
    }

    await dependencies.saveRoleThreadStateEntry(input.source.issueKey, selectedAgent.name, nextState);
    log({
      event: "commented",
      count,
      runDir: finalRunDir,
      agent: selectedAgent.name,
      threadId: nextState.threadId,
      cachedInputTokens: result.cachedInputTokens,
      issueKey: input.source.issueKey,
    });
    for (let iteration = 1; iteration <= MAX_SELF_REFLECT; iteration++) {
      const nextTrigger = resolveTrigger({ timeline: workingTimeline, availableAgentNames: agentNames });
      const step = decideNextSelfReflectStep(nextTrigger, iteration, MAX_SELF_REFLECT);

      if (step.kind === "stop") {
        log({
          event: "self-reflect-stopped",
          iteration,
          reason: step.reason,
          issueKey: input.source.issueKey,
        });
        break;
      }

      // step.kind === "continue-hook" 保证 nextTrigger.kind === "post-comment"
      if (nextTrigger.kind !== "post-comment") {
        break;
      }

      await dependencies.postComment(input.source, nextTrigger.body);
      log({
        event: "self-reflect-hook-commented",
        iteration,
        stage: nextTrigger.stage,
        sourceRole: nextTrigger.sourceRole,
        sourceIndex: nextTrigger.sourceIndex,
        issueKey: input.source.issueKey,
      });
      workingTimeline = appendPostedComment(workingTimeline, nextTrigger.role, nextTrigger.body);
    }

    return "triggered-success";
  } catch (error) {
    log({ event: "process-issue-error", issueKey: input.source.issueKey, error: formatError(error) });
    return "failed";
  }
}

function findLatestReflectorHookBody(timeline: ReturnType<typeof buildTimeline>): string | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const message = timeline[index];
    if (message?.speaker === "reflector" && message.body.includes("agent-moebius:stage-hook")) {
      return message.body;
    }
  }

  return null;
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
      const issue = await input.fetchIssueWithComments(input.source);
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

process.on("unhandledRejection", (reason) => {
  log({ event: "unhandled-rejection", error: formatError(reason) });
});

process.on("uncaughtException", (error) => {
  log({ event: "uncaught-exception", error: formatError(error) });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void start();
}
