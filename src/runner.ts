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
  CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
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
import { runIssueWorktreeCapability } from "./agent-prescripts/issue-worktree.js";
import { formatCeoScriptsForPrompt, loadCeoScripts, type CeoScript } from "./ceo-scripts.js";
import {
  buildCeoOrchestrationKey,
  buildCeoRoundtableCompletionKey,
  buildCeoRoundtableKey,
  ensureInProgressStage,
  extractCeoOrchestrationKeyFromNote,
  extractCeoRoundtableCompletionKey,
  extractCeoRoundtableKey,
  parseCeoOrchestrationOutput,
  renderCeoChildIssueBody,
  renderCeoRoundtableChildIssueBody,
  renderCeoRoundtableParentSummaryBody,
  renderCeoRoundtableRouteBody,
  type CeoChildIssueDescriptor,
  type CeoOrchestrationGroup,
  type CeoRoundtableContribution,
  type ParsedCeoOrchestration,
} from "./ceo-orchestration.js";
import { resolveCeoLedgerPromptContext } from "./agent-prescripts/ceo-ledger-context.js";
import {
  buildFallbackFullPrompt,
  buildRolePromptPlan,
  buildTimeline,
  countMessages,
  formatAgentComment,
  getLatestTimelineMessage,
  parseAgentMentions,
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
import {
  appendCeoReviewedMetadata,
  CEO_CORRECTED_METADATA,
  formatCeoComment,
  formatExternalCommentRoute,
  type FormatCeoResult,
  type FormatExternalCommentRouteResult,
} from "./format-ceo.js";
import {
  addReaction,
  createIssue,
  fetchIssueWithComments,
  findIssueByOrchestrationKey,
  isGitHubIssueNotFoundError,
  listOpenIssueSummaries,
  postComment,
  publishReleaseArtifacts,
  type CreatedIssue,
  type GitHubIssue,
  type IssueReactionContent,
  type ReactionTarget,
} from "./github.js";
import {
  loadGoalLedgerState,
  saveGoalLedgerEntry,
} from "./goal-ledger-state.js";
import {
  buildAcceptanceStatementsDigest,
  buildIntegrationAcceptanceJoinKey,
  evaluateIntegrationAcceptanceJoin,
  recordIntegrationAcceptanceEvent,
  recordTaskAcceptanceFact,
  type AcceptanceStatementResult,
  GoalLedgerEntry,
  GoalLedgerState,
  IssueReference,
  type PhaseOwner,
  type PhaseRecord,
  TaskRecord,
} from "./goal-ledger.js";
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
  externalCommentFallbackRouteProcessingOutcome,
  getDueActiveIssueSources,
  isFailedIssueProcessingOutcome,
  type GitHubResponseIntakeState,
  type IntakeIssueState,
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
import { parseTrailingStageMarker } from "./stages.js";
import { resolveTrigger } from "./triggers/index.js";

let runDirSequence = 0;

const DEFAULT_RUN_MANIFEST_PATH = path.join(".state", "run-manifests.jsonl");

export interface AgentFile {
  name: string;
  path: string;
}

export interface ProcessIssueSourceDependencies {
  runIssueWorktreeCapability: typeof runIssueWorktreeCapability;
  runAgentPreScript: typeof runAgentPreScript;
  runCodex: typeof runCodex;
  addReaction: typeof addReaction;
  createIssue: typeof createIssue;
  fetchIssueWithComments: typeof fetchIssueWithComments;
  findIssueByOrchestrationKey: typeof findIssueByOrchestrationKey;
  postComment: typeof postComment;
  prepareIssueMedia: typeof prepareIssueMedia;
  discoverOutputArtifacts: typeof discoverOutputArtifacts;
  publishArtifacts: typeof publishReleaseArtifacts;
  loadRoleThreadStateStore: typeof loadRoleThreadStateStore;
  saveRoleThreadStateEntry: typeof saveRoleThreadStateEntry;
  loadCeoScripts: typeof loadCeoScripts;
  loadGoalLedgerState: typeof loadGoalLedgerState;
  saveGoalLedgerEntry: typeof saveGoalLedgerEntry;
  formatCeoComment: typeof formatCeoComment;
  formatExternalCommentRoute: typeof formatExternalCommentRoute;
  writeRunManifest: typeof writeRunManifest;
}

const DEFAULT_PROCESS_ISSUE_SOURCE_DEPENDENCIES: ProcessIssueSourceDependencies = {
  runIssueWorktreeCapability,
  runAgentPreScript,
  runCodex,
  addReaction,
  createIssue,
  fetchIssueWithComments,
  findIssueByOrchestrationKey,
  postComment,
  prepareIssueMedia,
  discoverOutputArtifacts,
  publishArtifacts: publishReleaseArtifacts,
  loadRoleThreadStateStore,
  saveRoleThreadStateEntry,
  loadCeoScripts,
  loadGoalLedgerState,
  saveGoalLedgerEntry,
  formatCeoComment,
  formatExternalCommentRoute,
  writeRunManifest,
};

export type RunManifestStage = "plan-written" | "code-verified" | "in-progress" | "unknown";

export interface RunManifestRecord {
  issue: {
    owner: string;
    repo: string;
    number: number;
  };
  role: string;
  stage: RunManifestStage;
  artifacts: Array<{
    path: string;
    publishedUrl: string | null;
  }>;
  startedAt: string;
  completedAt: string;
}

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

export async function writeRunManifest(input: {
  record: RunManifestRecord;
  runDir: string;
  manifestPath?: string;
}): Promise<void> {
  const manifestPath = input.manifestPath ?? DEFAULT_RUN_MANIFEST_PATH;
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.appendFile(manifestPath, `${JSON.stringify(input.record)}\n`, "utf8");

  try {
    await fs.mkdir(input.runDir, { recursive: true });
    await fs.writeFile(path.join(input.runDir, "run-manifest.json"), `${JSON.stringify(input.record, null, 2)}\n`, "utf8");
  } catch {
    // The runDir copy is only for debugging; the JSONL state file above is the contract source.
  }
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
        ...changedIssues.map((summary) => {
          const issueState = state.issues[makeIssueSource(summary).issueKey];
          return { kind: "changed" as const, summary, previousIssueState: issueState };
        }),
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
            previousIssueState: issueState,
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
      intakeIssueState: input.job.previousIssueState,
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
      intakeIssueState: input.job.previousIssueState,
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
      previousIssueState: issueState,
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
    intakeIssueState?: IntakeIssueState;
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
    const acceptancePrePassOutcome = await maybeProcessIntegrationAcceptancePrePass({
      source: input.source,
      issue: input.issue,
      timeline,
      agentNames,
      count,
      postVisibleComment,
      dependencies,
    });
    if (acceptancePrePassOutcome !== null) {
      return acceptancePrePassOutcome;
    }

    const roundtableRecoveryOutcome = await maybeRecoverRoundtableNoHandoff({
      source: input.source,
      issue: input.issue,
      timeline,
      intakeIssueState: input.intakeIssueState,
      postVisibleComment,
    });
    if (roundtableRecoveryOutcome !== null) {
      return roundtableRecoveryOutcome;
    }

    const trigger = resolveTrigger({ timeline, availableAgentNames: agentNames });

    if (trigger.kind === "skip") {
      const fallbackRouteOutcome = await maybeRouteExternalNoMentionComment({
        source: input.source,
        issue: input.issue,
        timeline,
        agentNames,
        intakeIssueState: input.intakeIssueState,
        count,
        postVisibleComment,
        dependencies,
      });
      if (fallbackRouteOutcome !== null) {
        return fallbackRouteOutcome;
      }

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
    const promptContexts: string[] = [];
    if (agentManifest.workspaceAccess !== null) {
      const workspaceResult = await dependencies.runIssueWorktreeCapability({
        role: selectedAgent.name,
        workspaceAccess: agentManifest.workspaceAccess,
        latestIndex: plan.latestIndex,
        issueSource: input.source,
        workdirRoot: WORKDIR_ROOT,
        contextStatePath: AGENT_CONTEXTS_STATE_PATH,
      });

      if (!workspaceResult.ok) {
        log({
          event: "agent-workspace-failed",
          count,
          runDir,
          agent: selectedAgent.name,
          workspaceAccess: agentManifest.workspaceAccess,
          reason: workspaceResult.reason,
          issueKey: input.source.issueKey,
        });
        return failedIssueProcessingOutcome({ reason: workspaceResult.reason, agent: selectedAgent.name });
      }

      codexCwd = workspaceResult.codexCwd;
      if (workspaceResult.promptContext !== undefined) {
        promptContexts.push(workspaceResult.promptContext);
      }
      log({
        event: "agent-workspace-completed",
        count,
        runDir,
        agent: selectedAgent.name,
        workspaceAccess: agentManifest.workspaceAccess,
        codexCwd,
        issueKey: input.source.issueKey,
      });
    }

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
        if (selectedAgent.name === "ceo" && preScriptResult.visibleFailureBody !== undefined) {
          await postVisibleComment(
            formatBypassedAgentComment(
              selectedAgent.name,
              preScriptResult.visibleFailureBody,
              "agent-prescript-failed",
            ),
          );
          return "triggered-success";
        }

        return failedIssueProcessingOutcome({ reason: preScriptResult.reason, agent: selectedAgent.name });
      }

      if (preScriptResult.codexCwd !== undefined && codexCwd !== undefined && preScriptResult.codexCwd !== codexCwd) {
        const reason = `workspace-prescript-cwd-conflict:${codexCwd}:${preScriptResult.codexCwd}`;
        log({
          event: "agent-prescript-failed",
          count,
          runDir,
          agent: selectedAgent.name,
          preScript: agentManifest.preScript,
          reason,
          issueKey: input.source.issueKey,
        });
        return failedIssueProcessingOutcome({ reason, agent: selectedAgent.name });
      }

      codexCwd = preScriptResult.codexCwd ?? codexCwd;
      if (preScriptResult.promptContext !== undefined) {
        promptContexts.push(preScriptResult.promptContext);
      }
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
    const agentPromptContext = promptContexts.length === 0 ? undefined : promptContexts.join("\n\n");

    const initialMedia = await prepareMediaForPrompt({
      messages: plan.mode === "resume" ? plan.deltaMessages : timeline,
      runDir,
      count,
      agent: selectedAgent.name,
      issueKey: input.source.issueKey,
      dependencies,
    });
    if (!initialMedia.ok) {
      await postVisibleComment(
        formatBypassedAgentComment(
          selectedAgent.name,
          formatMediaPreparationFailure(initialMedia.failures),
          "media-preparation-failed",
        ),
      );
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
        prompt: appendMediaManifest(appendPromptContext(plan.prompt, agentPromptContext), initialMedia.prepared),
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
          await postVisibleComment(
            formatBypassedAgentComment(
              selectedAgent.name,
              formatMediaPreparationFailure(fallbackMedia.failures),
              "media-preparation-failed",
            ),
          );
          return "triggered-success";
        }

        finalCodexStartedAtMs = Date.now();
        result = await runCodexWithWatchdog({
          prompt: appendMediaManifest(
            appendPromptContext(buildFallbackFullPrompt(agentManifest.body, timeline), agentPromptContext),
            fallbackMedia.prepared,
          ),
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

    if (selectedAgent.name === "ceo") {
      return await handleCeoAgentResult({
        source: input.source,
        issue: input.issue,
        agentNames,
        finalText: result.finalText,
        resultThreadId: nextState.threadId,
        nextState,
        runDir: finalRunDir,
        startedAtMs: finalCodexStartedAtMs,
        count,
        postVisibleComment,
        dependencies,
      });
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
      await writeRunManifestBestEffort({
        record: buildRunManifestRecord({
          source: input.source,
          role: selectedAgent.name,
          finalText: result.finalText,
          artifacts: publishableFinalText.artifacts,
          startedAtMs: finalCodexStartedAtMs,
        }),
        runDir: finalRunDir,
        count,
        agent: selectedAgent.name,
        issueKey: input.source.issueKey,
        dependencies,
      });
      await postVisibleComment(
        formatBypassedAgentComment(
          selectedAgent.name,
          formatArtifactPublishingFailure(publishableFinalText.error),
          "artifact-publishing-failed",
        ),
      );
      return "triggered-success";
    }

    const runManifestRecord = buildRunManifestRecord({
      source: input.source,
      role: selectedAgent.name,
      finalText: result.finalText,
      artifacts: publishableFinalText.artifacts,
      startedAtMs: finalCodexStartedAtMs,
    });

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
      const originalBody = appendCeoReviewedMetadata(formatAgentComment(selectedAgent.name, publishableFinalText.body), {
        action: "append_original",
      });
      await postVisibleComment(originalBody);
      await writeRunManifestBestEffort({
        record: runManifestRecord,
        runDir: finalRunDir,
        count,
        agent: selectedAgent.name,
        issueKey: input.source.issueKey,
        dependencies,
      });
      await dependencies.saveRoleThreadStateEntry(input.source.issueKey, selectedAgent.name, nextState);

      const ceoAppendBody = `${appendCeoReviewedMetadata(formatAgentComment(ceoResult.as, ceoResult.body), {
        action: "append_ceo",
      })}\n\n${CEO_CORRECTED_METADATA}`;
      await dependencies.postComment(input.source, ceoAppendBody);
    } else {
      const postedBody = formatGuardedAgentComment(selectedAgent.name, ceoResult.body, ceoResult);
      await postVisibleComment(postedBody);
      await writeRunManifestBestEffort({
        record: runManifestRecord,
        runDir: finalRunDir,
        count,
        agent: selectedAgent.name,
        issueKey: input.source.issueKey,
        dependencies,
      });
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

interface ParsedAcceptanceWalkthrough {
  status: "passed" | "failed";
  statementResults: AcceptanceStatementResult[];
  failedStatementIds: string[];
  failedStatements: string[];
}

interface IntegrationOwnerResolution {
  owner: PhaseOwner;
  phase: PhaseRecord;
  parentIssue: { owner: string; repo: string; number: number };
}

async function maybeProcessIntegrationAcceptancePrePass(input: {
  source: IssueSource;
  issue: GitHubIssue;
  timeline: TimelineMessage[];
  agentNames: string[];
  count: number;
  postVisibleComment: (body: string) => Promise<void>;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<IssueProcessingOutcome | null> {
  const latestMessage = getLatestTimelineMessage(input.timeline);
  if (latestMessage === null || latestMessage.source !== "comment") {
    return null;
  }

  const latestComment = input.issue.comments[latestMessage.index - 1];
  if (latestComment === undefined) {
    return null;
  }
  if (!isAcceptanceReviewerRole(latestMessage.speaker, input.agentNames)) {
    return null;
  }

  const ledger = await withTimeout(
    input.dependencies.loadGoalLedgerState(),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "loadGoalLedgerState",
  );
  const childTask = findTaskByChildIssue(ledger, input.source);
  if (childTask !== null) {
    return processChildTaskAcceptance({
      ...input,
      latestMessage,
      latestCommentId: latestComment.id,
      ledger,
      task: childTask,
      reviewerRole: latestMessage.speaker,
    });
  }

  const parentResolution = findIntegrationOwnerForParentIssue(ledger, input.source);
  if (parentResolution === null) {
    return null;
  }

  return processParentIntegrationAcceptance({
    ...input,
    latestMessage,
    latestCommentId: latestComment.id,
    ledger,
    resolution: parentResolution,
    reviewerRole: latestMessage.speaker,
  });
}

async function processChildTaskAcceptance(input: {
  source: IssueSource;
  issue: GitHubIssue;
  timeline: TimelineMessage[];
  agentNames: string[];
  count: number;
  postVisibleComment: (body: string) => Promise<void>;
  dependencies: ProcessIssueSourceDependencies;
  latestMessage: TimelineMessage;
  latestCommentId: string;
  ledger: GoalLedgerState;
  task: TaskRecord;
  reviewerRole: string;
}): Promise<IssueProcessingOutcome | null> {
  const statements = input.task.acceptanceStatements ?? [];
  const parsed = parseAcceptanceWalkthrough(input.latestMessage.body, statements);
  if (parsed === null) {
    return null;
  }

  let ledgerAfterFact: GoalLedgerState | null = null;
  await withTimeout(
    input.dependencies.saveGoalLedgerEntry(
      "tasks",
      input.task.id,
      (entry, state) => {
        if (entry === null || !isTaskRecord(entry)) {
          throw new Error(`missing-ledger-task:${input.task.id}`);
        }
        const nextState = recordTaskAcceptanceFact(state, {
          taskId: input.task.id,
          issue: {
            owner: input.source.owner,
            repo: input.source.repo,
            number: input.source.issueNumber,
          },
          role: input.reviewerRole,
          status: parsed.status,
          statementResults: parsed.statementResults,
          messageIndex: input.latestMessage.index,
          commentId: input.latestCommentId,
          capturedAt: new Date().toISOString(),
          note: `source-comment:${input.latestCommentId}`,
        });
        ledgerAfterFact = nextState;
        return nextState.tasks[input.task.id] ?? entry;
      },
      undefined,
      { timeoutMs: CEO_ORCHESTRATION_ACTION_TIMEOUT_MS },
    ),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "saveGoalLedgerEntry",
  );

  if (parsed.status === "failed") {
    return null;
  }

  const currentLedger =
    ledgerAfterFact ??
    (await withTimeout(
      input.dependencies.loadGoalLedgerState(),
      CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
      "loadGoalLedgerState",
    ));
  const ownerResolution = resolveIntegrationOwnerForTask(currentLedger, input.task.id);
  if (ownerResolution === null) {
    await input.postVisibleComment(
      formatBypassedAgentComment(
        "ceo",
        formatIntegrationAcceptanceBlockedBody({
          reason: "parent-reference-missing",
          detail: `child task ${input.task.id} has no resolvable parent issue in the active phase projection`,
        }),
        "integration-acceptance-blocked",
      ),
    );
    return "triggered-success";
  }

  const reviewerRole = resolveTargetReviewerRole(input.agentNames);
  if (reviewerRole === null) {
    await input.postVisibleComment(
      formatBypassedAgentComment(
        "ceo",
        formatIntegrationAcceptanceBlockedBody({
          reason: "reviewer-role-missing",
          detail: "no current real acceptance reviewer role is available",
        }),
        "integration-acceptance-blocked",
      ),
    );
    return "triggered-success";
  }

  const evaluation = evaluateIntegrationAcceptanceJoin(currentLedger, {
    owner: ownerResolution.owner,
    parentIssue: ownerResolution.parentIssue,
    reviewerRole,
  });
  if (evaluation.status === "waiting") {
    log({
      event: "integration-acceptance-waiting",
      issueKey: input.source.issueKey,
      pending: evaluation.pending.map((item) => `${item.taskId}:${item.reason}`),
    });
    return "no-trigger";
  }

  if (evaluation.status === "blocked") {
    const parentSource = makeIssueSource({
      owner: ownerResolution.parentIssue.owner,
      repo: ownerResolution.parentIssue.repo,
      issueNumber: ownerResolution.parentIssue.number,
    });
    await input.dependencies.postComment(
      parentSource,
      appendCeoReviewedMetadata(
        formatAgentComment(
          "ceo",
          formatIntegrationAcceptanceBlockedBody({
            reason: evaluation.reason,
            detail:
              evaluation.reason === "missing-target-acceptance-statements"
                ? `@${reviewerRole} 当前 active phase projection 缺少目标级验收语句，请先补齐账本事实。`
                : `集成验收 join 被阻断：${evaluation.reason}`,
          }),
        ),
        { action: "bypass", reason: "integration-acceptance-blocked" },
      ),
    );
    return "triggered-success";
  }

  return requestParentIntegrationAcceptance({
    source: input.source,
    parentIssue: ownerResolution.parentIssue,
    evaluation,
    dependencies: input.dependencies,
  });
}

async function processParentIntegrationAcceptance(input: {
  source: IssueSource;
  issue: GitHubIssue;
  timeline: TimelineMessage[];
  agentNames: string[];
  count: number;
  postVisibleComment: (body: string) => Promise<void>;
  dependencies: ProcessIssueSourceDependencies;
  latestMessage: TimelineMessage;
  latestCommentId: string;
  ledger: GoalLedgerState;
  resolution: IntegrationOwnerResolution;
  reviewerRole: string;
}): Promise<IssueProcessingOutcome | null> {
  const requested = latestIntegrationAcceptanceRequest(input.resolution.phase, input.resolution.parentIssue);
  if (requested === null) {
    return null;
  }

  const parsed = parseAcceptanceWalkthrough(input.latestMessage.body, input.resolution.phase.acceptanceStatements ?? []);
  if (parsed === null) {
    return null;
  }

  await saveIntegrationAcceptanceEvent({
    dependencies: input.dependencies,
    phaseId: input.resolution.phase.id,
    parentIssue: input.resolution.parentIssue,
    reviewerRole: input.reviewerRole,
    status: parsed.status,
    childPassDigest: requested.childPassDigest,
    targetAcceptanceDigest: requested.targetAcceptanceDigest,
    joinKey: requested.joinKey,
    sourceComment: {
      issue: {
        owner: input.source.owner,
        repo: input.source.repo,
        number: input.source.issueNumber,
      },
      messageIndex: input.latestMessage.index,
      commentId: input.latestCommentId,
    },
    failedStatementIds: parsed.status === "failed" ? parsed.failedStatementIds : undefined,
    capturedAt: new Date().toISOString(),
    note: `source-comment:${input.latestCommentId}`,
  });

  if (parsed.status === "passed") {
    log({
      event: "integration-acceptance-passed",
      issueKey: input.source.issueKey,
      joinKey: requested.joinKey,
    });
    return "no-trigger";
  }

  return createIntegrationRepairChildren({
    source: input.source,
    parentIssue: input.resolution.parentIssue,
    owner: input.resolution.owner,
    phase: input.resolution.phase,
    requested,
    parsed,
    ledger: input.ledger,
    agentNames: input.agentNames,
    latestCommentId: input.latestCommentId,
    postVisibleComment: input.postVisibleComment,
    dependencies: input.dependencies,
  });
}

async function requestParentIntegrationAcceptance(input: {
  source: IssueSource;
  parentIssue: { owner: string; repo: string; number: number };
  evaluation: Extract<ReturnType<typeof evaluateIntegrationAcceptanceJoin>, { status: "ready" }>;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<IssueProcessingOutcome> {
  const parentSource = makeIssueSource({
    owner: input.parentIssue.owner,
    repo: input.parentIssue.repo,
    issueNumber: input.parentIssue.number,
  });
  const parent = await withTimeout(
    input.dependencies.fetchIssueWithComments(parentSource),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "fetchParentIssueForIntegrationAcceptance",
  );

  if (issueContainsHiddenKey(parent, input.evaluation.joinKey)) {
    await saveIntegrationAcceptanceEvent({
      dependencies: input.dependencies,
      phaseId: input.evaluation.phaseId,
      parentIssue: input.parentIssue,
      reviewerRole: input.evaluation.reviewerRole,
      status: "requested",
      childPassDigest: input.evaluation.childPassDigest,
      targetAcceptanceDigest: input.evaluation.targetAcceptanceDigest,
      joinKey: input.evaluation.joinKey,
      capturedAt: new Date().toISOString(),
      note: "recovered-existing-parent-request",
    });
    return "no-trigger";
  }

  const requestBody = appendCeoReviewedMetadata(
    formatAgentComment(
      "ceo",
      formatIntegrationAcceptanceRequestBody({
        reviewerRole: input.evaluation.reviewerRole,
        acceptanceStatements: input.evaluation.acceptanceStatements,
        childPassFacts: input.evaluation.childPassFacts,
        joinKey: input.evaluation.joinKey,
      }),
    ),
    { action: "bypass", reason: "integration_acceptance_request" },
  );
  await input.dependencies.postComment(parentSource, requestBody);

  await saveIntegrationAcceptanceEvent({
    dependencies: input.dependencies,
    phaseId: input.evaluation.phaseId,
    parentIssue: input.parentIssue,
    reviewerRole: input.evaluation.reviewerRole,
    status: "requested",
    childPassDigest: input.evaluation.childPassDigest,
    targetAcceptanceDigest: input.evaluation.targetAcceptanceDigest,
    joinKey: input.evaluation.joinKey,
    capturedAt: new Date().toISOString(),
    note: `trigger-child:${input.source.issueKey}`,
  });

  return "triggered-success";
}

async function saveIntegrationAcceptanceEvent(input: {
  dependencies: ProcessIssueSourceDependencies;
  phaseId: string;
  parentIssue: { owner: string; repo: string; number: number };
  reviewerRole: string;
  status: "requested" | "passed" | "failed" | "blocked";
  childPassDigest: string;
  targetAcceptanceDigest: string;
  joinKey: string;
  sourceComment?: {
    issue: { owner: string; repo: string; number: number };
    messageIndex: number;
    commentId?: string;
  };
  failedStatementIds?: string[];
  repairTaskIds?: string[];
  capturedAt: string;
  note?: string;
}): Promise<void> {
  await withTimeout(
    input.dependencies.saveGoalLedgerEntry(
      "phases",
      input.phaseId,
      (entry, state) => {
        if (entry === null || !isPhaseRecord(entry)) {
          throw new Error(`missing-ledger-phase:${input.phaseId}`);
        }
        const nextState = recordIntegrationAcceptanceEvent(state, {
          phaseId: input.phaseId,
          parentIssue: input.parentIssue,
          reviewerRole: input.reviewerRole,
          status: input.status,
          childPassDigest: input.childPassDigest,
          targetAcceptanceDigest: input.targetAcceptanceDigest,
          joinKey: input.joinKey,
          sourceComment: input.sourceComment,
          failedStatementIds: input.failedStatementIds,
          repairTaskIds: input.repairTaskIds,
          capturedAt: input.capturedAt,
          note: input.note,
        });
        return nextState.phases[input.phaseId] ?? entry;
      },
      undefined,
      { timeoutMs: CEO_ORCHESTRATION_ACTION_TIMEOUT_MS },
    ),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "saveGoalLedgerEntry",
  );
}

async function createIntegrationRepairChildren(input: {
  source: IssueSource;
  parentIssue: { owner: string; repo: string; number: number };
  owner: PhaseOwner;
  phase: PhaseRecord;
  requested: NonNullable<ReturnType<typeof latestIntegrationAcceptanceRequest>>;
  parsed: ParsedAcceptanceWalkthrough;
  ledger: GoalLedgerState;
  agentNames: string[];
  latestCommentId: string;
  postVisibleComment: (body: string) => Promise<void>;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<IssueProcessingOutcome> {
  const initialRole = input.agentNames.includes("dev") ? "dev" : input.agentNames[0];
  if (initialRole === undefined) {
    await input.postVisibleComment(
      formatBypassedAgentComment(
        "ceo",
        formatIntegrationAcceptanceBlockedBody({
          reason: "repair-initial-role-missing",
          detail: "no current real implementation role is available",
        }),
        "integration-repair-blocked",
      ),
    );
    return "triggered-success";
  }

  const repairTaskId = buildIntegrationRepairTaskId(input.requested.joinKey, input.parsed.failedStatementIds);
  const acceptanceStatements = input.parsed.failedStatements.length > 0 ? input.parsed.failedStatements : ["修复父级集成验收失败项"];
  const group: CeoOrchestrationGroup = {
    id: "integration-repair",
    reason: "目标级验收失败；冲突面未知，按串行修复子任务处理。",
  };
  const descriptor: CeoChildIssueDescriptor = {
    ledgerTaskId: repairTaskId,
    groupId: group.id,
    title: truncateForComment(`修复集成验收失败：${acceptanceStatements[0] ?? repairTaskId}`, 120),
    description: "本子任务由父目标集成验收失败自动回流生成，只修复列出的目标级验收失败项。",
    initialRole,
    qualityBaseline: input.phase.qualityBaseline,
    acceptanceStatements,
    dependencies: [],
    provenance: `integration acceptance failed on ${issueUrl(input.source)} comment ${input.latestCommentId}; joinKey=${input.requested.joinKey}`,
  };
  const orchestrationKey = buildCeoOrchestrationKey({
    source: input.source,
    workflowId: "integration-repair-child-issues",
    ledgerTaskId: repairTaskId,
  });

  const completed: CeoSpawnCompletedItem[] = [];
  const pending: CeoChildIssueDescriptor[] = [descriptor];
  try {
    await saveIntegrationRepairTask({
      dependencies: input.dependencies,
      ledger: input.ledger,
      owner: input.owner,
      phase: input.phase,
      parentIssue: input.parentIssue,
      descriptor,
      orchestrationKey,
    });

    pending.shift();
    const latestLedger = await withTimeout(
      input.dependencies.loadGoalLedgerState(),
      CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
      "loadGoalLedgerState",
    );
    const existingRef = findTaskChildIssueRefByOrchestrationKey(latestLedger, repairTaskId, orchestrationKey);
    if (existingRef !== null) {
      completed.push({ kind: "already-created", descriptor, issue: issueFromReference(existingRef), orchestrationKey });
    } else {
      const lookup = await withTimeout(
        input.dependencies.findIssueByOrchestrationKey(input.source, orchestrationKey),
        CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
        "findIssueByOrchestrationKey",
      );
      if (lookup.kind === "multiple") {
        throw new Error(
          `orchestration-key-multiple-matches:${orchestrationKey}:${lookup.issues.map((issue) => issue.url).join(",")}`,
        );
      }
      if (lookup.kind === "one") {
        completed.push({ kind: "recovered-existing", descriptor, issue: lookup.issue, orchestrationKey });
        await saveTaskChildIssueRef({
          dependencies: input.dependencies,
          ledgerTaskId: repairTaskId,
          issue: lookup.issue,
          orchestrationKey,
          provenance: descriptor.provenance,
        });
      } else {
        const body = renderCeoChildIssueBody({
          source: input.source,
          parentIssueUrl: issueUrl(input.source),
          workflowId: "integration-repair-child-issues",
          group,
          descriptor,
          orchestrationKey,
        });
        const created = await withTimeout(
          input.dependencies.createIssue(input.source, { title: descriptor.title, body }),
          CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
          "createIssue",
        );
        completed.push({ kind: "created", descriptor, issue: created, orchestrationKey });
        await saveTaskChildIssueRef({
          dependencies: input.dependencies,
          ledgerTaskId: repairTaskId,
          issue: created,
          orchestrationKey,
          provenance: descriptor.provenance,
        });
      }
    }

    await saveIntegrationAcceptanceEvent({
      dependencies: input.dependencies,
      phaseId: input.phase.id,
      parentIssue: input.parentIssue,
      reviewerRole: input.requested.reviewerRole,
      status: "failed",
      childPassDigest: input.requested.childPassDigest,
      targetAcceptanceDigest: input.requested.targetAcceptanceDigest,
      joinKey: input.requested.joinKey,
      failedStatementIds: input.parsed.failedStatementIds,
      repairTaskIds: [repairTaskId],
      capturedAt: new Date().toISOString(),
      note: `repair-created:${repairTaskId}`,
    });
  } catch (error) {
    const failureBody = formatCeoOrchestrationFailureBody({
      reason: formatFailureReason(error),
      completed,
      pending,
    });
    try {
      await input.postVisibleComment(formatBypassedAgentComment("ceo", failureBody, "integration-repair-failed"));
      return "triggered-success";
    } catch (postError) {
      throw new Error(
        `integration-repair-failed:${formatFailureReason(error)}; fail-closed-comment-failed:${formatFailureReason(
          postError,
        )}; completed=${completed.map((item) => item.issue.url).join(",")}`,
      );
    }
  }

  await input.postVisibleComment(
    formatBypassedAgentComment(
      "ceo",
      formatIntegrationRepairSuccessBody({
        repairTaskId,
        completed,
        failedStatementIds: input.parsed.failedStatementIds,
      }),
      "integration-repair-created",
    ),
  );
  return "triggered-success";
}

async function saveIntegrationRepairTask(input: {
  dependencies: ProcessIssueSourceDependencies;
  ledger: GoalLedgerState;
  owner: PhaseOwner;
  phase: PhaseRecord;
  parentIssue: { owner: string; repo: string; number: number };
  descriptor: CeoChildIssueDescriptor;
  orchestrationKey: string;
}): Promise<void> {
  const goalId = resolveGoalIdForOwner(input.ledger, input.owner);
  if (goalId === null) {
    throw new Error(`integration-repair-owner-missing:${input.owner.kind}:${input.owner.id}`);
  }
  const milestoneId = input.owner.kind === "milestone" ? input.owner.id : input.owner.kind === "task" ? input.ledger.tasks[input.owner.id]?.milestoneId : undefined;
  const now = new Date().toISOString();

  await withTimeout(
    input.dependencies.saveGoalLedgerEntry(
      "tasks",
      input.descriptor.ledgerTaskId,
      (entry) => {
        if (entry !== null && !isTaskRecord(entry)) {
          throw new Error(`invalid-repair-task-entry:${input.descriptor.ledgerTaskId}`);
        }
        const existing = entry;
        const task: TaskRecord = {
          id: input.descriptor.ledgerTaskId,
          goalId,
          ...(milestoneId === undefined ? {} : { milestoneId }),
          title: input.descriptor.title,
          status: "ready",
          scope: input.descriptor.description,
          acceptanceStatements: input.descriptor.acceptanceStatements,
          dependencies: input.descriptor.dependencies,
          qualityBaseline: input.descriptor.qualityBaseline,
          phaseIds: Array.from(new Set([...(existing?.phaseIds ?? []), input.phase.id])),
          parentIssueRef: {
            owner: input.parentIssue.owner,
            repo: input.parentIssue.repo,
            number: input.parentIssue.number,
            relation: "parent",
            status: "open",
            note: input.orchestrationKey,
          },
          childIssueRefs: existing?.childIssueRefs ?? [],
          acceptanceFacts: existing?.acceptanceFacts,
          runManifestRefs: existing?.runManifestRefs ?? [],
          provenance: existing?.provenance ?? [
            {
              issue: input.parentIssue,
              messageIndex: 0,
              capturedAt: now,
              note: input.descriptor.provenance,
            },
          ],
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        return task;
      },
      undefined,
      { timeoutMs: CEO_ORCHESTRATION_ACTION_TIMEOUT_MS },
    ),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "saveGoalLedgerEntry",
  );

  if (input.owner.kind === "milestone") {
    await withTimeout(
      input.dependencies.saveGoalLedgerEntry(
        "milestones",
        input.owner.id,
        (entry) => {
          if (entry === null || !("taskIds" in entry)) {
            throw new Error(`missing-ledger-milestone:${input.owner.id}`);
          }
          if (entry.taskIds.includes(input.descriptor.ledgerTaskId)) {
            return entry;
          }
          return {
            ...entry,
            taskIds: [...entry.taskIds, input.descriptor.ledgerTaskId],
            updatedAt: now,
          };
        },
        undefined,
        { timeoutMs: CEO_ORCHESTRATION_ACTION_TIMEOUT_MS },
      ),
      CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
      "saveGoalLedgerEntry",
    );
  }
}

function isAcceptanceReviewerRole(role: string, agentNames: readonly string[]): boolean {
  return ["product-manager", "hermes-user", "qa"].includes(role) && agentNames.includes(role);
}

function resolveTargetReviewerRole(agentNames: readonly string[]): string | null {
  for (const role of ["product-manager", "hermes-user", "qa"]) {
    if (agentNames.includes(role)) {
      return role;
    }
  }
  return null;
}

function findTaskByChildIssue(ledger: GoalLedgerState, source: IssueSource): TaskRecord | null {
  const matches = Object.values(ledger.tasks).filter((task) =>
    task.childIssueRefs.some((reference) => reference.relation === "child" && issueReferenceMatchesSource(reference, source)),
  );
  return matches.length === 1 ? matches[0]! : null;
}

function resolveIntegrationOwnerForTask(ledger: GoalLedgerState, taskId: string): IntegrationOwnerResolution | null {
  const task = ledger.tasks[taskId];
  if (task === undefined) {
    return null;
  }
  const owners: PhaseOwner[] = [
    { kind: "goal", id: task.goalId },
    ...(task.milestoneId === undefined ? [] : [{ kind: "milestone" as const, id: task.milestoneId }]),
    { kind: "task", id: task.id },
  ];
  for (const owner of owners) {
    const phase = findSingleActivePhase(ledger, owner);
    if (phase === null) {
      continue;
    }
    const parentIssue = resolveParentIssueForOwner(ledger, owner, task);
    if (parentIssue === null) {
      return null;
    }
    return { owner, phase, parentIssue };
  }
  return null;
}

function findIntegrationOwnerForParentIssue(ledger: GoalLedgerState, source: IssueSource): IntegrationOwnerResolution | null {
  for (const phase of Object.values(ledger.phases)) {
    if (phase.status !== "active") {
      continue;
    }
    const owner = phase.owner;
    const parentIssue = resolveParentIssueForOwner(ledger, owner);
    if (parentIssue !== null && parentIssue.owner === source.owner && parentIssue.repo === source.repo && parentIssue.number === source.issueNumber) {
      return { owner, phase, parentIssue };
    }
  }
  return null;
}

function findSingleActivePhase(ledger: GoalLedgerState, owner: PhaseOwner): PhaseRecord | null {
  const phases = Object.values(ledger.phases).filter(
    (phase) => phase.status === "active" && phase.owner.kind === owner.kind && phase.owner.id === owner.id,
  );
  return phases.length === 1 ? phases[0]! : null;
}

function resolveParentIssueForOwner(
  ledger: GoalLedgerState,
  owner: PhaseOwner,
  fallbackTask?: TaskRecord,
): { owner: string; repo: string; number: number } | null {
  if (fallbackTask?.parentIssueRef !== undefined) {
    return issueLikeFromReference(fallbackTask.parentIssueRef);
  }

  if (owner.kind === "task") {
    const task = ledger.tasks[owner.id];
    if (task?.parentIssueRef !== undefined) {
      return issueLikeFromReference(task.parentIssueRef);
    }
    return task === undefined ? null : resolveParentIssueForOwner(ledger, { kind: "goal", id: task.goalId }, task);
  }

  if (owner.kind === "milestone") {
    const milestone = ledger.milestones[owner.id];
    const milestoneRef = milestone?.issueRefs.find((reference) => reference.relation === "source" || reference.relation === "parent");
    if (milestoneRef !== undefined) {
      return issueLikeFromReference(milestoneRef);
    }
    return milestone === undefined ? null : resolveParentIssueForOwner(ledger, { kind: "goal", id: milestone.goalId }, fallbackTask);
  }

  const goal = ledger.goals[owner.id];
  const goalRef = goal?.issueRefs.find((reference) => reference.relation === "source" || reference.relation === "parent");
  return goalRef === undefined ? null : issueLikeFromReference(goalRef);
}

function resolveGoalIdForOwner(ledger: GoalLedgerState, owner: PhaseOwner): string | null {
  if (owner.kind === "goal") {
    return ledger.goals[owner.id] === undefined ? null : owner.id;
  }
  if (owner.kind === "milestone") {
    return ledger.milestones[owner.id]?.goalId ?? null;
  }
  return ledger.tasks[owner.id]?.goalId ?? null;
}

function latestIntegrationAcceptanceRequest(
  phase: PhaseRecord,
  parentIssue: { owner: string; repo: string; number: number },
): NonNullable<PhaseRecord["integrationAcceptance"]>[number] | null {
  const requests = (phase.integrationAcceptance ?? []).filter(
    (event) =>
      event.status === "requested" &&
      event.parentIssue.owner === parentIssue.owner &&
      event.parentIssue.repo === parentIssue.repo &&
      event.parentIssue.number === parentIssue.number,
  );
  return requests.sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt)).at(-1) ?? null;
}

function parseAcceptanceWalkthrough(body: string, statements: readonly string[]): ParsedAcceptanceWalkthrough | null {
  if (statements.length === 0) {
    return null;
  }

  const lines = body.split(/\r?\n/u);
  const statementResults: AcceptanceStatementResult[] = [];
  const failedStatementIds: string[] = [];
  const failedStatements: string[] = [];
  for (const [index, statement] of statements.entries()) {
    const id = String(index + 1);
    const line = findAcceptanceLineForStatement(lines, index + 1);
    if (line === null) {
      return null;
    }
    const status = parseAcceptanceLineStatus(line);
    if (status === null) {
      return null;
    }
    statementResults.push({ id, status, statement });
    if (status === "failed") {
      failedStatementIds.push(id);
      failedStatements.push(statement);
    }
  }

  const overall = parseOverallAcceptanceStatus(body);
  if (overall === null) {
    return null;
  }
  const status = overall === "failed" || failedStatementIds.length > 0 ? "failed" : "passed";
  return { status, statementResults, failedStatementIds, failedStatements };
}

function findAcceptanceLineForStatement(lines: readonly string[], statementNumber: number): string | null {
  const prefix = new RegExp(`^\\s*(?:[-*]\\s*)?(?:验收语句\\s*)?${String(statementNumber)}[.、)．:：\\s]`, "u");
  return lines.find((line) => prefix.test(line) && /(通过|不通过|失败)/u.test(line)) ?? null;
}

function parseAcceptanceLineStatus(line: string): "passed" | "failed" | null {
  if (/(不通过|失败|未通过)/u.test(line)) {
    return "failed";
  }
  if (/通过/u.test(line)) {
    return "passed";
  }
  return null;
}

function parseOverallAcceptanceStatus(body: string): "passed" | "failed" | null {
  if (/(验收结论|结论|整体验收|方案验收结论|集成验收结论)[^\n]{0,40}(不通过|失败|未通过)/u.test(body)) {
    return "failed";
  }
  if (/(验收失败|整体验收失败|集成验收失败)/u.test(body)) {
    return "failed";
  }
  if (/(验收结论|结论|整体验收|方案验收结论|集成验收结论)[^\n]{0,40}通过/u.test(body)) {
    return "passed";
  }
  if (/(验收通过|全部通过|整体通过|集成验收通过)/u.test(body)) {
    return "passed";
  }
  return null;
}

function issueContainsHiddenKey(issue: GitHubIssue, key: string): boolean {
  return issue.body.includes(key) || issue.comments.some((comment) => comment.body.includes(key));
}

function issueReferenceMatchesSource(reference: IssueReference, source: IssueSource): boolean {
  return reference.owner === source.owner && reference.repo === source.repo && reference.number === source.issueNumber;
}

function issueLikeFromReference(reference: IssueReference): { owner: string; repo: string; number: number } {
  return {
    owner: reference.owner,
    repo: reference.repo,
    number: reference.number,
  };
}

function isPhaseRecord(entry: GoalLedgerEntry): entry is PhaseRecord {
  return "owner" in entry && "qualityBaseline" in entry && "provenance" in entry;
}

function buildIntegrationRepairTaskId(joinKey: string, failedStatementIds: readonly string[]): string {
  const digest = buildAcceptanceStatementsDigest([joinKey, ...failedStatementIds]).slice(0, 20);
  return `integration-repair-${digest}`;
}

function formatIntegrationAcceptanceRequestBody(input: {
  reviewerRole: string;
  acceptanceStatements: string[];
  childPassFacts: Array<{ taskId: string; fact: { factKey: string; role: string; commentId?: string } }>;
  joinKey: string;
}): string {
  const acceptance = input.acceptanceStatements.map((statement, index) => `${String(index + 1)}. ${statement}`).join("\n");
  const childFacts = input.childPassFacts
    .map((item) => `- ${item.taskId}: ${item.fact.role} / ${item.fact.commentId ?? item.fact.factKey}`)
    .join("\n");

  return `@${input.reviewerRole} 当前 active phase 中所有已入账子任务均已通过验收，请按目标级验收语句执行集成验收走查。子任务通过不能直接代表父目标通过；本评论只发起父级集成验收请求，不改变 issue 生命周期状态。

目标级验收语句：
${acceptance}

子任务通过事实：
${childFacts}

<!-- ${input.joinKey} -->

<!-- agent-moebius:stage=in-progress -->`;
}

function formatIntegrationAcceptanceBlockedBody(input: { reason: string; detail: string }): string {
  return `集成验收 join 已 fail-closed。

原因：${input.reason}
说明：${input.detail}

本轮不会把父目标标记为通过，也不会创建修复子任务。

<!-- agent-moebius:stage=in-progress -->`;
}

function formatIntegrationRepairSuccessBody(input: {
  repairTaskId: string;
  completed: CeoSpawnCompletedItem[];
  failedStatementIds: string[];
}): string {
  const completed =
    input.completed.length === 0
      ? "- none"
      : input.completed.map((item) => `- ${item.kind}: ${item.descriptor.ledgerTaskId} -> ${item.issue.url}`).join("\n");
  return `集成验收失败已回流为修复子任务。

Repair task: ${input.repairTaskId}
Failed statements: ${input.failedStatementIds.join(", ")}

子 issue：
${completed}

修复子任务通过后，将重新触发同一父目标的集成验收。

<!-- agent-moebius:stage=in-progress -->`;
}

async function maybeRouteExternalNoMentionComment(input: {
  source: IssueSource;
  issue: GitHubIssue;
  timeline: TimelineMessage[];
  agentNames: string[];
  intakeIssueState?: IntakeIssueState;
  count: number;
  postVisibleComment: (body: string) => Promise<void>;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<IssueProcessingOutcome | null> {
  if (input.intakeIssueState?.mode !== "active") {
    return null;
  }

  const latestMessage = getLatestTimelineMessage(input.timeline);
  if (latestMessage === null || latestMessage.source !== "comment" || latestMessage.speaker !== "user") {
    return null;
  }

  const latestComment = input.issue.comments[latestMessage.index - 1];
  if (latestComment === undefined) {
    return null;
  }

  if (hasAgentMoebiusMetadata(latestComment.body)) {
    return null;
  }

  if (input.intakeIssueState.externalCommentFallbackRoutes?.[latestComment.id] !== undefined) {
    log({
      event: "external-comment-route-skip",
      reason: "already-routed",
      issueKey: input.source.issueKey,
      commentId: latestComment.id,
    });
    return null;
  }

  const runDir = makeRunDir(input.count);
  log({
    event: "external-comment-route-start",
    count: input.count,
    runDir,
    issueKey: input.source.issueKey,
    commentId: latestComment.id,
  });

  const routeResult = await input.dependencies.formatExternalCommentRoute({
    issueContext: buildCeoIssueContext(input.source, input.issue),
    latestComment: latestMessage.body,
    availableAgentNames: input.agentNames,
    runDir,
    runCodex: input.dependencies.runCodex,
  });

  logExternalCommentRouteResult({
    result: routeResult,
    count: input.count,
    issueKey: input.source.issueKey,
    commentId: latestComment.id,
  });

  const decidedAt = new Date().toISOString();
  if (routeResult.action === "APPEND") {
    await input.postVisibleComment(
      appendCeoReviewedMetadata(formatAgentComment("ceo", routeResult.body), {
        action: "external_route_append",
      }),
    );
    return externalCommentFallbackRouteProcessingOutcome({
      result: "triggered-success",
      route: {
        commentId: latestComment.id,
        outcome: "append",
        decidedAt,
        targetRole: routeResult.targetRole,
      },
    });
  }

  if (routeResult.action === "NO_ACTION") {
    return externalCommentFallbackRouteProcessingOutcome({
      result: "no-trigger",
      route: {
        commentId: latestComment.id,
        outcome: "no_action",
        decidedAt,
        reason: routeResult.reason,
      },
    });
  }

  return externalCommentFallbackRouteProcessingOutcome({
    result: "no-trigger",
    route: {
      commentId: latestComment.id,
      outcome: "fail_open",
      decidedAt,
      reason: routeResult.reason,
    },
  });
}

async function maybeRecoverRoundtableNoHandoff(input: {
  source: IssueSource;
  issue: GitHubIssue;
  timeline: TimelineMessage[];
  intakeIssueState?: IntakeIssueState;
  postVisibleComment: (body: string) => Promise<void>;
}): Promise<IssueProcessingOutcome | null> {
  if (input.intakeIssueState?.mode !== "active") {
    return null;
  }
  const context = parseRoundtableIssueContext(input.issue.body);
  if (context === null) {
    return null;
  }
  const latestMessage = getLatestTimelineMessage(input.timeline);
  if (latestMessage === null || latestMessage.source !== "comment" || !context.participants.includes(latestMessage.speaker)) {
    return null;
  }
  const latestComment = input.issue.comments[latestMessage.index - 1];
  if (latestComment === undefined) {
    return null;
  }
  if (input.intakeIssueState.externalCommentFallbackRoutes?.[latestComment.id] !== undefined) {
    log({
      event: "roundtable-recovery-skip",
      reason: "already-routed",
      issueKey: input.source.issueKey,
      commentId: latestComment.id,
    });
    return null;
  }
  const mentions = parseAgentMentions(latestMessage.body);
  if (mentions.length === 1 && mentions[0]?.name === "ceo") {
    return null;
  }
  const decidedAt = new Date().toISOString();
  const reason =
    mentions.length === 0
      ? `roundtable participant ${latestMessage.speaker} spoke without handing control back to CEO`
      : `roundtable participant ${latestMessage.speaker} handed control to ${mentions.map((mention) => mention.name).join(",")} instead of CEO`;
  const body =
    mentions.length === 0
      ? `@ceo 圆桌参与者 ${latestMessage.speaker} 已发言，但没有把控制权交回 CEO 主持人。请继续按圆桌参与者顺序 route 或在全员发言后 complete。`
      : `@ceo 圆桌参与者 ${latestMessage.speaker} 已发言，但把控制权交给了非 CEO 角色。runner 已拦截该错误 handoff；请按圆桌参与者顺序继续 route 或在全员发言后 complete。`;
  await input.postVisibleComment(
    appendCeoReviewedMetadata(formatAgentComment("ceo", ensureInProgressStage(body)), {
      action: "bypass",
      reason: "roundtable_recovery",
    }),
  );
  return externalCommentFallbackRouteProcessingOutcome({
    result: "triggered-success",
    route: {
      commentId: latestComment.id,
      outcome: "append",
      decidedAt,
      targetRole: "ceo",
      reason,
    },
  });
}

async function handleCeoAgentResult(input: {
  source: IssueSource;
  issue: GitHubIssue;
  agentNames: string[];
  finalText: string;
  resultThreadId: string;
  nextState: NonNullable<ReturnType<typeof resolveNextRoleThreadState>>;
  runDir: string;
  startedAtMs: number;
  count: number;
  postVisibleComment: (body: string) => Promise<void>;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<IssueProcessingOutcome> {
  let scripts: CeoScript[];
  let ledgerContext: ReturnType<typeof resolveCeoLedgerPromptContext>;
  try {
    scripts = await input.dependencies.loadCeoScripts({ required: true });
    const ledger = await input.dependencies.loadGoalLedgerState();
    ledgerContext = resolveCeoLedgerPromptContext({
      ledger,
      source: input.source,
      scriptsPrompt: formatCeoScriptsForPrompt(scripts),
    });
  } catch (error) {
    const failureBody = formatCeoOrchestrationFailureBody({
      reason: formatFailureReason(error),
      completed: [],
      pending: [],
    });
    try {
      await input.postVisibleComment(formatBypassedAgentComment("ceo", failureBody, "ceo-orchestration-failed"));
      return "triggered-success";
    } catch (postError) {
      throw new Error(
        `ceo-orchestration-failed:${formatFailureReason(error)}; fail-closed-comment-failed:${formatFailureReason(postError)}`,
      );
    }
  }
  const visibleTaskIds = ledgerContext.visibleTasks.map((task) => task.id);
  const parsed = parseCeoOrchestrationOutput({
    output: input.finalText,
    scripts,
    availableAgentNames: input.agentNames,
    visibleTaskIds,
  });

  if (!parsed.ok) {
    await input.postVisibleComment(
      formatBypassedAgentComment(
        "ceo",
        formatCeoOrchestrationFailureBody({
          reason: parsed.reason,
          completed: [],
          pending: [],
        }),
        "ceo-orchestration-failed",
      ),
    );
    return "triggered-success";
  }

  if (parsed.value.action === "fail") {
    await input.postVisibleComment(formatBypassedAgentComment("ceo", parsed.value.body, "ceo-orchestration-failed"));
    return "triggered-success";
  }

  if (parsed.value.action === "route") {
    await publishCeoVisibleResult({
      source: input.source,
      issue: input.issue,
      body: parsed.value.body,
      runDir: input.runDir,
      startedAtMs: input.startedAtMs,
      count: input.count,
      nextState: input.nextState,
      postVisibleComment: input.postVisibleComment,
      dependencies: input.dependencies,
    });
    return "triggered-success";
  }

  if (parsed.value.action === "roundtable") {
    return await handleCeoRoundtableResult({
      source: input.source,
      issue: input.issue,
      parsed: parsed.value,
      nextState: input.nextState,
      runDir: input.runDir,
      startedAtMs: input.startedAtMs,
      count: input.count,
      postVisibleComment: input.postVisibleComment,
      dependencies: input.dependencies,
    });
  }

  const completed: CeoSpawnCompletedItem[] = [];
  const pending = [...parsed.value.issues];
  try {
    for (const descriptor of parsed.value.issues) {
      pending.shift();
      const group = parsed.value.groups.find((candidate) => candidate.id === descriptor.groupId);
      if (group === undefined) {
        throw new Error(`missing-group:${descriptor.groupId}`);
      }

      const orchestrationKey = buildCeoOrchestrationKey({
        source: input.source,
        workflowId: parsed.value.workflowId,
        ledgerTaskId: descriptor.ledgerTaskId,
      });

      const existingRef = findTaskChildIssueRefByOrchestrationKey(
        await input.dependencies.loadGoalLedgerState(),
        descriptor.ledgerTaskId,
        orchestrationKey,
      );
      if (existingRef !== null) {
        completed.push({
          kind: "already-created",
          descriptor,
          issue: issueFromReference(existingRef),
          orchestrationKey,
        });
        continue;
      }

      const lookup = await withTimeout(
        input.dependencies.findIssueByOrchestrationKey(input.source, orchestrationKey),
        CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
        "findIssueByOrchestrationKey",
      );
      if (lookup.kind === "multiple") {
        throw new Error(
          `orchestration-key-multiple-matches:${orchestrationKey}:${lookup.issues.map((issue) => issue.url).join(",")}`,
        );
      }
      if (lookup.kind === "one") {
        completed.push({
          kind: "recovered-existing",
          descriptor,
          issue: lookup.issue,
          orchestrationKey,
        });
        await saveTaskChildIssueRef({
          dependencies: input.dependencies,
          ledgerTaskId: descriptor.ledgerTaskId,
          issue: lookup.issue,
          orchestrationKey,
          provenance: descriptor.provenance,
        });
        continue;
      }

      const body = renderCeoChildIssueBody({
        source: input.source,
        parentIssueUrl: issueUrl(input.source),
        workflowId: parsed.value.workflowId,
        group,
        descriptor,
        orchestrationKey,
      });
      const created = await withTimeout(
        input.dependencies.createIssue(input.source, { title: descriptor.title, body }),
        CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
        "createIssue",
      );
      completed.push({
        kind: "created",
        descriptor,
        issue: created,
        orchestrationKey,
      });
      await saveTaskChildIssueRef({
        dependencies: input.dependencies,
        ledgerTaskId: descriptor.ledgerTaskId,
        issue: created,
        orchestrationKey,
        provenance: descriptor.provenance,
      });
    }
  } catch (error) {
    const failureBody = formatCeoOrchestrationFailureBody({
      reason: formatFailureReason(error),
      completed,
      pending,
    });
    try {
      await input.postVisibleComment(formatBypassedAgentComment("ceo", failureBody, "ceo-orchestration-failed"));
      return "triggered-success";
    } catch (postError) {
      throw new Error(
        `ceo-orchestration-failed:${formatFailureReason(error)}; fail-closed-comment-failed:${formatFailureReason(
          postError,
        )}; completed=${completed.map((item) => item.issue.url).join(",")}`,
      );
    }
  }

  const successBody = formatCeoSpawnSuccessBody({
    summary: parsed.value.summary,
    groups: parsed.value.groups,
    completed,
  });
  await publishCeoVisibleResult({
    source: input.source,
    issue: input.issue,
    body: successBody,
    runDir: input.runDir,
    startedAtMs: input.startedAtMs,
    count: input.count,
    nextState: input.nextState,
    postVisibleComment: input.postVisibleComment,
    dependencies: input.dependencies,
  });
  return "triggered-success";
}

type ParsedCeoRoundtable = Extract<ParsedCeoOrchestration, { action: "roundtable" }>;

interface RoundtableIssueContext {
  parentSource: IssueSource;
  roundtableKey: string;
  workflowId: string;
  ledgerTaskId: string;
  topic: string;
  participants: string[];
}

async function handleCeoRoundtableResult(input: {
  source: IssueSource;
  issue: GitHubIssue;
  parsed: ParsedCeoRoundtable;
  nextState: NonNullable<ReturnType<typeof resolveNextRoleThreadState>>;
  runDir: string;
  startedAtMs: number;
  count: number;
  postVisibleComment: (body: string) => Promise<void>;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<IssueProcessingOutcome> {
  try {
    if (input.parsed.mode === "start") {
      return await handleCeoRoundtableStart(input as typeof input & { parsed: Extract<ParsedCeoRoundtable, { mode: "start" }> });
    }
    if (input.parsed.mode === "route") {
      return await handleCeoRoundtableRoute(input as typeof input & { parsed: Extract<ParsedCeoRoundtable, { mode: "route" }> });
    }
    return await handleCeoRoundtableComplete(input as typeof input & { parsed: Extract<ParsedCeoRoundtable, { mode: "complete" }> });
  } catch (error) {
    try {
      await input.postVisibleComment(
        formatBypassedAgentComment(
          "ceo",
          formatCeoRoundtableFailureBody({ reason: formatFailureReason(error) }),
          "ceo-roundtable-failed",
        ),
      );
      return "triggered-success";
    } catch (postError) {
      throw new Error(
        `ceo-roundtable-failed:${formatFailureReason(error)}; fail-closed-comment-failed:${formatFailureReason(postError)}`,
      );
    }
  }
}

async function handleCeoRoundtableStart(input: {
  source: IssueSource;
  issue: GitHubIssue;
  parsed: Extract<ParsedCeoRoundtable, { mode: "start" }>;
  nextState: NonNullable<ReturnType<typeof resolveNextRoleThreadState>>;
  runDir: string;
  startedAtMs: number;
  count: number;
  postVisibleComment: (body: string) => Promise<void>;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<IssueProcessingOutcome> {
  const roundtableKey = buildCeoRoundtableKey({
    source: input.source,
    workflowId: input.parsed.workflowId,
    roundtableId: input.parsed.roundtableId,
  });
  let completedIssue: CreatedIssue | null = null;
  const existingRef = findTaskChildIssueRefByRoundtableKey(
    await input.dependencies.loadGoalLedgerState(),
    input.parsed.ledgerTaskId,
    roundtableKey,
  );
  if (existingRef !== null) {
    completedIssue = issueFromReference(existingRef);
  } else {
    const lookup = await withTimeout(
      input.dependencies.findIssueByOrchestrationKey(input.source, roundtableKey),
      CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
      "findRoundtableIssueByKey",
    );
    if (lookup.kind === "multiple") {
      throw new Error(`roundtable-key-multiple-matches:${roundtableKey}:${lookup.issues.map((issue) => issue.url).join(",")}`);
    }
    if (lookup.kind === "one") {
      completedIssue = lookup.issue;
      await saveTaskRoundtableChildIssueRef({
        dependencies: input.dependencies,
        ledgerTaskId: input.parsed.ledgerTaskId,
        issue: completedIssue,
        roundtableKey,
        provenance: input.parsed.provenance,
      });
    } else {
      const body = renderCeoRoundtableChildIssueBody({
        parentIssueUrl: issueUrl(input.source),
        workflowId: input.parsed.workflowId,
        ledgerTaskId: input.parsed.ledgerTaskId,
        roundtableKey,
        title: input.parsed.title,
        topic: input.parsed.topic,
        inputSummary: input.parsed.inputSummary,
        participants: input.parsed.participants,
        firstRole: input.parsed.firstRole,
        qualityBaseline: input.parsed.qualityBaseline,
        provenance: input.parsed.provenance,
      });
      completedIssue = await withTimeout(
        input.dependencies.createIssue(input.source, { title: input.parsed.title, body }),
        CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
        "createRoundtableIssue",
      );
      try {
        await saveTaskRoundtableChildIssueRef({
          dependencies: input.dependencies,
          ledgerTaskId: input.parsed.ledgerTaskId,
          issue: completedIssue,
          roundtableKey,
          provenance: input.parsed.provenance,
        });
      } catch (error) {
        throw new Error(`roundtable-ledger-save-failed:${formatFailureReason(error)}; child=${completedIssue.url}; key=${roundtableKey}`);
      }
    }
  }

  await publishCeoVisibleResult({
    source: input.source,
    issue: input.issue,
    body: `圆桌已启动。

Child issue: ${completedIssue.url}
Workflow id: ${input.parsed.workflowId}
Participants: ${input.parsed.participants.join(" -> ")}
Current waiting role: ${input.parsed.firstRole}

<!-- ${roundtableKey} -->`,
    runDir: input.runDir,
    startedAtMs: input.startedAtMs,
    count: input.count,
    nextState: input.nextState,
    postVisibleComment: input.postVisibleComment,
    dependencies: input.dependencies,
  });
  return "triggered-success";
}

async function handleCeoRoundtableRoute(input: {
  source: IssueSource;
  issue: GitHubIssue;
  parsed: Extract<ParsedCeoRoundtable, { mode: "route" }>;
  nextState: NonNullable<ReturnType<typeof resolveNextRoleThreadState>>;
  runDir: string;
  startedAtMs: number;
  count: number;
  postVisibleComment: (body: string) => Promise<void>;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<IssueProcessingOutcome> {
  const context = requireRoundtableIssueContext(input.issue.body);
  if (context.roundtableKey !== input.parsed.roundtableKey) {
    throw new Error(`roundtable-key-mismatch:${input.parsed.roundtableKey}`);
  }
  const nextRole = nextRoundtableParticipant(input.issue, context.participants);
  if (nextRole === null) {
    throw new Error("roundtable-route-no-pending-participant");
  }
  if (input.parsed.nextRole !== nextRole) {
    throw new Error(`roundtable-route-wrong-next-role:${input.parsed.nextRole}:expected:${nextRole}`);
  }
  const rendered = renderCeoRoundtableRouteBody({ nextRole, body: input.parsed.body });
  if (!rendered.ok) {
    throw new Error(rendered.reason);
  }
  await publishCeoVisibleResult({
    source: input.source,
    issue: input.issue,
    body: rendered.body,
    runDir: input.runDir,
    startedAtMs: input.startedAtMs,
    count: input.count,
    nextState: input.nextState,
    postVisibleComment: input.postVisibleComment,
    dependencies: input.dependencies,
  });
  return "triggered-success";
}

async function handleCeoRoundtableComplete(input: {
  source: IssueSource;
  issue: GitHubIssue;
  parsed: Extract<ParsedCeoRoundtable, { mode: "complete" }>;
  nextState: NonNullable<ReturnType<typeof resolveNextRoleThreadState>>;
  runDir: string;
  startedAtMs: number;
  count: number;
  postVisibleComment: (body: string) => Promise<void>;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<IssueProcessingOutcome> {
  const context = requireRoundtableIssueContext(input.issue.body);
  if (context.roundtableKey !== input.parsed.roundtableKey) {
    throw new Error(`roundtable-key-mismatch:${input.parsed.roundtableKey}`);
  }
  const participantIndexes = roundtableParticipantMessageIndexes(input.issue, context.participants);
  const missing = context.participants.filter((participant) => participantIndexes[participant] === undefined);
  if (missing.length > 0) {
    await input.postVisibleComment(
      formatBypassedAgentComment(
        "ceo",
        formatCeoRoundtableFailureBody({ reason: `roundtable-participants-missing:${missing.join(",")}` }),
        "ceo-roundtable-failed",
      ),
    );
    return "triggered-success";
  }
  const completionKey = buildCeoRoundtableCompletionKey({
    roundtableKey: context.roundtableKey,
    participants: context.participants,
    participantMessageIndexes: context.participants.map((participant) => participantIndexes[participant]!),
  });
  const parentIssue = await withTimeout(
    input.dependencies.fetchIssueWithComments(context.parentSource),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "fetchRoundtableParent",
  );
  const childUrl = issueUrl(input.source);
  if (!issueContainsHiddenKey(parentIssue, completionKey)) {
    await withTimeout(
      input.dependencies.postComment(
        context.parentSource,
        appendCeoReviewedMetadata(
          formatAgentComment(
            "ceo",
            renderCeoRoundtableParentSummaryBody({
              childIssueUrl: childUrl,
              topic: context.topic,
              summary: input.parsed.summary,
              contributions: input.parsed.contributions,
              decision: input.parsed.decision,
              provenance: input.parsed.provenance,
              completionKey,
            }),
          ),
          { action: "bypass", reason: "roundtable_parent_summary" },
        ),
      ),
      CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
      "postRoundtableParentSummary",
    );
  }
  await publishCeoVisibleResult({
    source: input.source,
    issue: input.issue,
    body: `圆桌已完成并回流父 issue。

Parent issue: ${issueUrl(context.parentSource)}
Completion key: ${completionKey}`,
    runDir: input.runDir,
    startedAtMs: input.startedAtMs,
    count: input.count,
    nextState: input.nextState,
    postVisibleComment: input.postVisibleComment,
    dependencies: input.dependencies,
  });
  return "triggered-success";
}

async function publishCeoVisibleResult(input: {
  source: IssueSource;
  issue: GitHubIssue;
  body: string;
  runDir: string;
  startedAtMs: number;
  count: number;
  nextState: NonNullable<ReturnType<typeof resolveNextRoleThreadState>>;
  postVisibleComment: (body: string) => Promise<void>;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<void> {
  const body = ensureInProgressStage(input.body);
  const runManifestRecord = buildRunManifestRecord({
    source: input.source,
    role: "ceo",
    finalText: body,
    artifacts: [],
    startedAtMs: input.startedAtMs,
  });
  const ceoResult = await input.dependencies.formatCeoComment({
    agent: "ceo",
    issueContext: buildCeoIssueContext(input.source, input.issue),
    latestResponse: body,
    runDir: input.runDir,
    runCodex: input.dependencies.runCodex,
  });
  logCeoGuardrailResult({
    result: ceoResult,
    count: input.count,
    agent: "ceo",
    issueKey: input.source.issueKey,
  });

  if (ceoResult.action === "APPEND") {
    const originalBody = appendCeoReviewedMetadata(formatAgentComment("ceo", body), {
      action: "append_original",
    });
    await input.postVisibleComment(originalBody);
    const ceoAppendBody = `${appendCeoReviewedMetadata(formatAgentComment(ceoResult.as, ceoResult.body), {
      action: "append_ceo",
    })}\n\n${CEO_CORRECTED_METADATA}`;
    await input.dependencies.postComment(input.source, ceoAppendBody);
  } else {
    await input.postVisibleComment(formatGuardedAgentComment("ceo", ceoResult.body, ceoResult));
  }

  await writeRunManifestBestEffort({
    record: runManifestRecord,
    runDir: input.runDir,
    count: input.count,
    agent: "ceo",
    issueKey: input.source.issueKey,
    dependencies: input.dependencies,
  });
  await input.dependencies.saveRoleThreadStateEntry(input.source.issueKey, "ceo", input.nextState);
}

interface CeoSpawnCompletedItem {
  kind: "created" | "already-created" | "recovered-existing";
  descriptor: CeoChildIssueDescriptor;
  issue: CreatedIssue;
  orchestrationKey: string;
}

function findTaskChildIssueRefByOrchestrationKey(
  ledger: GoalLedgerState,
  ledgerTaskId: string,
  orchestrationKey: string,
): IssueReference | null {
  const task = ledger.tasks[ledgerTaskId];
  if (task === undefined) {
    return null;
  }

  return task.childIssueRefs.find((reference) => extractCeoOrchestrationKeyFromNote(reference.note) === orchestrationKey) ?? null;
}

function findTaskChildIssueRefByRoundtableKey(
  ledger: GoalLedgerState,
  ledgerTaskId: string,
  roundtableKey: string,
): IssueReference | null {
  const task = ledger.tasks[ledgerTaskId];
  if (task === undefined) {
    return null;
  }

  return task.childIssueRefs.find((reference) => extractCeoRoundtableKey(reference.note) === roundtableKey) ?? null;
}

async function saveTaskChildIssueRef(input: {
  dependencies: ProcessIssueSourceDependencies;
  ledgerTaskId: string;
  issue: CreatedIssue;
  orchestrationKey: string;
  provenance: string;
}): Promise<void> {
  await withTimeout(
    input.dependencies.saveGoalLedgerEntry(
      "tasks",
      input.ledgerTaskId,
      (entry) => {
        if (entry === null || !isTaskRecord(entry)) {
          throw new Error(`missing-ledger-task:${input.ledgerTaskId}`);
        }
        if (entry.childIssueRefs.some((reference) => extractCeoOrchestrationKeyFromNote(reference.note) === input.orchestrationKey)) {
          return entry;
        }

        const note = truncateForComment(
          `${input.orchestrationKey}; provenance=${input.provenance.replace(/\s+/g, " ").trim()}`,
          500,
        );
        const repo = parseIssueUrl(input.issue.url);
        return {
          ...entry,
          childIssueRefs: [
            ...entry.childIssueRefs,
            {
              owner: repo.owner,
              repo: repo.repo,
              number: input.issue.number,
              relation: "child",
              status: "open",
              note,
            },
          ],
          updatedAt: new Date().toISOString(),
        };
      },
      undefined,
      { timeoutMs: CEO_ORCHESTRATION_ACTION_TIMEOUT_MS },
    ),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "saveGoalLedgerEntry",
  );
}

async function saveTaskRoundtableChildIssueRef(input: {
  dependencies: ProcessIssueSourceDependencies;
  ledgerTaskId: string;
  issue: CreatedIssue;
  roundtableKey: string;
  provenance: string;
}): Promise<void> {
  await withTimeout(
    input.dependencies.saveGoalLedgerEntry(
      "tasks",
      input.ledgerTaskId,
      (entry) => {
        if (entry === null || !isTaskRecord(entry)) {
          throw new Error(`missing-ledger-task:${input.ledgerTaskId}`);
        }
        if (entry.childIssueRefs.some((reference) => extractCeoRoundtableKey(reference.note) === input.roundtableKey)) {
          return entry;
        }

        const note = truncateForComment(
          `${input.roundtableKey}; provenance=${input.provenance.replace(/\s+/g, " ").trim()}`,
          500,
        );
        const repo = parseIssueUrl(input.issue.url);
        return {
          ...entry,
          childIssueRefs: [
            ...entry.childIssueRefs,
            {
              owner: repo.owner,
              repo: repo.repo,
              number: input.issue.number,
              relation: "child",
              status: "open",
              note,
            },
          ],
          updatedAt: new Date().toISOString(),
        };
      },
      undefined,
      { timeoutMs: CEO_ORCHESTRATION_ACTION_TIMEOUT_MS },
    ),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "saveGoalLedgerEntry",
  );
}

function formatCeoSpawnSuccessBody(input: {
  summary: string;
  groups: CeoOrchestrationGroup[];
  completed: CeoSpawnCompletedItem[];
}): string {
  const issueLines =
    input.completed.length === 0
      ? "- none"
      : input.completed
          .map((item) => `- ${item.kind}: ${item.descriptor.ledgerTaskId} -> ${item.issue.url}`)
          .join("\n");
  const groupLines = input.groups.map((group) => `- ${group.id}: ${group.reason}`).join("\n");

  return `CEO 编排完成。

${input.summary}

子 issue：
${issueLines}

冲突分组：
${groupLines}

<!-- agent-moebius:stage=in-progress -->`;
}

function formatCeoOrchestrationFailureBody(input: {
  reason: string;
  completed: CeoSpawnCompletedItem[];
  pending: CeoChildIssueDescriptor[];
}): string {
  const completed =
    input.completed.length === 0
      ? "- none"
      : input.completed
          .map((item) => `- ${item.kind}: ${item.descriptor.ledgerTaskId} -> ${item.issue.url}`)
          .join("\n");
  const pending =
    input.pending.length === 0
      ? "- none"
      : input.pending.map((descriptor) => `- ${descriptor.ledgerTaskId}: ${descriptor.title}`).join("\n");

  return `CEO 编排路径 fail-closed：${input.reason}

已创建或已找回：
${completed}

未创建：
${pending}

本轮不会继续创建后续 issue，也不会更新 ceo role thread。下一轮会先按稳定 orchestration key 查 ledger 和 GitHub，避免重复创建。

<!-- agent-moebius:stage=in-progress -->`;
}

function formatCeoRoundtableFailureBody(input: { reason: string }): string {
  return `CEO 圆桌路径 fail-closed：${input.reason}

本轮不会继续推进圆桌，也不会更新 ceo role thread。若已有 child issue 或父 issue 可见结果，下一轮会先按 hidden key 查找并恢复，避免重复创建或重复回流。

<!-- agent-moebius:stage=in-progress -->`;
}

function parseRoundtableIssueContext(body: string): RoundtableIssueContext | null {
  const roundtableKey = extractCeoRoundtableKey(body);
  if (roundtableKey === null) {
    return null;
  }
  const parentUrl = matchField(body, "Parent issue");
  const workflowId = matchField(body, "Workflow id");
  const ledgerTaskId = matchField(body, "Ledger task id");
  if (parentUrl === null || workflowId === null || ledgerTaskId === null) {
    return null;
  }
  const parentSource = parseIssueSourceUrl(parentUrl);
  if (parentSource === null) {
    return null;
  }
  const participants = parseRoundtableParticipants(body);
  if (participants.length === 0) {
    return null;
  }
  return {
    parentSource,
    roundtableKey,
    workflowId,
    ledgerTaskId,
    topic: matchMultilineSection(body, "Topic") ?? "",
    participants,
  };
}

function requireRoundtableIssueContext(body: string): RoundtableIssueContext {
  const context = parseRoundtableIssueContext(body);
  if (context === null) {
    throw new Error("roundtable-context-missing");
  }
  return context;
}

function parseRoundtableParticipants(body: string): string[] {
  const match = body.match(/Participants in order:\s*\n([\s\S]*?)(?:\n\n|$)/u);
  if (match?.[1] === undefined) {
    return [];
  }
  return match[1]
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/u, "").trim())
    .filter((line) => line !== "");
}

function matchField(body: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = body.match(new RegExp(`^${escaped}:\\s*(.+)$`, "mu"));
  return match?.[1]?.trim() ?? null;
}

function matchMultilineSection(body: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = body.match(new RegExp(`^${escaped}:\\s*\\n([\\s\\S]*?)(?:\\n\\n|$)`, "mu"));
  return match?.[1]?.trim() ?? null;
}

function parseIssueSourceUrl(url: string): IssueSource | null {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/u);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  return makeIssueSource({ owner: match[1], repo: match[2], issueNumber: Number.parseInt(match[3], 10) });
}

function roundtableParticipantMessageIndexes(issue: GitHubIssue, participants: readonly string[]): Record<string, number> {
  const timeline = buildTimeline(issue.body, issue.comments, [...participants, "ceo"]);
  const result: Record<string, number> = {};
  for (const message of timeline) {
    if (message.source === "comment" && participants.includes(message.speaker)) {
      result[message.speaker] = message.index;
    }
  }
  return result;
}

function nextRoundtableParticipant(issue: GitHubIssue, participants: readonly string[]): string | null {
  const indexes = roundtableParticipantMessageIndexes(issue, participants);
  return participants.find((participant) => indexes[participant] === undefined) ?? null;
}

function issueFromReference(reference: IssueReference): CreatedIssue {
  return {
    number: reference.number,
    url: `https://github.com/${reference.owner}/${reference.repo}/issues/${String(reference.number)}`,
  };
}

function parseIssueUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/\d+$/u);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`invalid-created-issue-url:${url}`);
  }
  return { owner: match[1], repo: match[2] };
}

function issueUrl(source: IssueSource): string {
  return `https://github.com/${source.owner}/${source.repo}/issues/${String(source.issueNumber)}`;
}

function isTaskRecord(entry: GoalLedgerEntry): entry is TaskRecord {
  return "childIssueRefs" in entry && "runManifestRefs" in entry;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label}-timeout:${String(timeoutMs)}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function hasAgentMoebiusMetadata(body: string): boolean {
  return /<!--\s*agent-moebius:/u.test(body);
}

function appendPromptContext(prompt: string, promptContext: string | undefined): string {
  if (promptContext === undefined || promptContext.trim() === "") {
    return prompt;
  }

  return `${prompt.trimEnd()}

## Agent Execution Context

${promptContext.trimEnd()}`;
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
}): Promise<{ ok: true; body: string; artifacts: RunManifestRecord["artifacts"] } | { ok: false; error: unknown; artifacts: RunManifestRecord["artifacts"] }> {
  const artifacts = await input.dependencies.discoverOutputArtifacts({
    cwd: input.cwd,
    runDir: input.runDir,
    finalText: input.finalText,
    startedAtMs: input.startedAtMs,
  });
  if (artifacts.length === 0) {
    return { ok: true, body: input.finalText, artifacts: [] };
  }

  const stagedArtifacts = artifacts.map((artifact) => ({
    path: toManifestArtifactPath(input.runDir, artifact.filePath),
    publishedUrl: null,
  }));

  try {
    const publishedArtifacts = await input.dependencies.publishArtifacts(input.source, artifacts);
    const artifactMarkdown = formatPublishedArtifactsMarkdown(publishedArtifacts);
    const manifestArtifacts = stagedArtifacts.map((artifact, index) => ({
      ...artifact,
      publishedUrl: publishedArtifacts[index]?.url ?? null,
    }));
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
      artifacts: manifestArtifacts,
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
    return { ok: false, error, artifacts: stagedArtifacts };
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

function buildRunManifestRecord(input: {
  source: IssueSource;
  role: string;
  finalText: string;
  artifacts: RunManifestRecord["artifacts"];
  startedAtMs: number;
  completedAt?: Date;
}): RunManifestRecord {
  return {
    issue: {
      owner: input.source.owner,
      repo: input.source.repo,
      number: input.source.issueNumber,
    },
    role: input.role,
    stage: resolveRunManifestStage(input.finalText),
    artifacts: input.artifacts,
    startedAt: new Date(input.startedAtMs).toISOString(),
    completedAt: (input.completedAt ?? new Date()).toISOString(),
  };
}

function resolveRunManifestStage(finalText: string): RunManifestStage {
  return (parseTrailingStageMarker(finalText) as RunManifestStage | null) ?? "unknown";
}

function toManifestArtifactPath(runDir: string, filePath: string): string {
  const relative = path.relative(path.resolve(runDir), path.resolve(filePath));
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return path.basename(filePath);
  }

  return relative.split(path.sep).join(path.posix.sep);
}

async function writeRunManifestBestEffort(input: {
  record: RunManifestRecord;
  runDir: string;
  count: number;
  agent: string;
  issueKey: string;
  dependencies: ProcessIssueSourceDependencies;
}): Promise<void> {
  try {
    await input.dependencies.writeRunManifest({ record: input.record, runDir: input.runDir });
    log({
      event: "run-manifest-written",
      count: input.count,
      runDir: input.runDir,
      agent: input.agent,
      issueKey: input.issueKey,
      artifactCount: input.record.artifacts.length,
      stage: input.record.stage,
    });
  } catch (error) {
    log({
      event: "run-manifest-write-failed",
      count: input.count,
      runDir: input.runDir,
      agent: input.agent,
      issueKey: input.issueKey,
      error: formatError(error),
    });
  }
}

function logCeoGuardrailResult(input: {
  result: FormatCeoResult;
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

function logExternalCommentRouteResult(input: {
  result: FormatExternalCommentRouteResult;
  count: number;
  issueKey: string;
  commentId: string;
}): void {
  if (input.result.action === "APPEND") {
    log({
      event: "external-comment-route-appended",
      count: input.count,
      issueKey: input.issueKey,
      commentId: input.commentId,
      targetRole: input.result.targetRole,
    });
    return;
  }

  if (input.result.action === "NO_ACTION") {
    log({
      event: "external-comment-route-no-action",
      count: input.count,
      issueKey: input.issueKey,
      commentId: input.commentId,
    });
    return;
  }

  log({
    event: "external-comment-route-failopen",
    count: input.count,
    issueKey: input.issueKey,
    commentId: input.commentId,
    reason: input.result.reason,
    detail: input.result.detail,
  });
}

function formatBypassedAgentComment(role: string, finalText: string, reason: string): string {
  return appendCeoReviewedMetadata(formatAgentComment(role, finalText), {
    action: "bypass",
    reason,
  });
}

function formatGuardedAgentComment(role: string, finalText: string, result: FormatCeoResult): string {
  const review =
    result.action === "REPLACE"
      ? { action: "replace" }
      : result.action === "NO_CHANGE"
        ? { action: "no_change" }
        : { action: "fail_open", reason: result.reason };

  if (!finalText.includes(CEO_CORRECTED_METADATA)) {
    return appendCeoReviewedMetadata(formatAgentComment(role, finalText), review);
  }

  const withoutCeoMetadata = finalText.replaceAll(CEO_CORRECTED_METADATA, "").trimEnd();
  return `${appendCeoReviewedMetadata(formatAgentComment(role, withoutCeoMetadata), review)}\n\n${CEO_CORRECTED_METADATA}`;
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

<!-- agent-moebius:dead-letter -->

<!-- agent-moebius:ceo-reviewed action=not_applicable reason=dead-letter -->`;
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
