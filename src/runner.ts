import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_ISSUE_NO_CHANGE_LIMIT,
  ACTIVE_ISSUE_POLL_INTERVAL_MS,
  AGENT_CONTEXTS_STATE_PATH,
  AGENTS_DIR,
  CONFIG_LOG_FIELDS,
  IDLE_REPOSITORY_SCAN_INTERVAL_MS,
  ISSUE_DISCOVERY_LIMIT,
  MAX_ACTIVE_ISSUES,
  MAX_SELF_REFLECT,
  TICK_INTERVAL_MS,
  TMP_ROOT,
  WATCH_REPOSITORIES,
  WORKDIR_ROOT,
} from "./config.js";
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
import { run as runCodex } from "./codex.js";
import {
  fetchIssueWithComments,
  isGitHubIssueNotFoundError,
  listOpenIssueSummaries,
  postComment,
  type GitHubIssue,
} from "./github.js";
import {
  enforceActiveIssueLimit,
  getDueActiveIssueSources,
  getDueRepositories,
  recordActiveIssueUnchanged,
  recordIssueProcessingOutcome,
  resolveRepositoryScan,
  type GitHubResponseIntakeState,
  type IssueProcessingOutcome,
  type IssueSummary,
} from "./github-response-intake.js";
import { loadGitHubResponseIntakeState, saveGitHubResponseIntakeState } from "./github-intake-state.js";
import { makeIssueSource, makeRepoKey, type IssueSource, type RepositoryRef } from "./issue-source.js";
import { log } from "./log.js";
import {
  getRoleThreadState,
  loadRoleThreadStateStore,
  saveRoleThreadStateStore,
  withRoleThreadState,
} from "./state.js";
import { resolveTrigger } from "./triggers/index.js";
import { appendPostedComment, decideNextSelfReflectStep } from "./triggers/self-reflect.js";

let running = false;

interface AgentFile {
  name: string;
  path: string;
}

export async function tick(now = new Date()): Promise<void> {
  if (running) {
    log({ event: "skip-overlap" });
    return;
  }

  running = true;
  try {
    const agentFiles = await listAgentFiles();
    let intakeState = await loadGitHubResponseIntakeState();

    for (const repository of getDueRepositories({
      repositories: WATCH_REPOSITORIES,
      state: intakeState,
      now,
      idleRepositoryScanIntervalMs: IDLE_REPOSITORY_SCAN_INTERVAL_MS,
    })) {
      intakeState = await scanRepository({
        state: intakeState,
        repository,
        agentFiles,
        now,
      });
    }

    for (const source of getDueActiveIssueSources({ repositories: WATCH_REPOSITORIES, state: intakeState, now })) {
      intakeState = await pollActiveIssue({
        state: intakeState,
        source,
        agentFiles,
        now,
      });
    }

    const limited = enforceActiveIssueLimit({
      repositories: WATCH_REPOSITORIES,
      state: intakeState,
      maxActiveIssues: MAX_ACTIVE_ISSUES,
    });
    intakeState = limited.state;
    for (const issueKey of limited.demotedIssueKeys) {
      log({ event: "active-issue-demoted", reason: "active-limit", issueKey, maxActiveIssues: MAX_ACTIVE_ISSUES });
    }

    await saveGitHubResponseIntakeState(intakeState);
  } catch (error) {
    log({ event: "cycle-error", error: formatError(error) });
  } finally {
    running = false;
  }
}

async function scanRepository(input: {
  state: GitHubResponseIntakeState;
  repository: RepositoryRef;
  agentFiles: AgentFile[];
  now: Date;
}): Promise<GitHubResponseIntakeState> {
  const repoKey = makeRepoKey(input.repository);

  try {
    const summaries = (await listOpenIssueSummaries(input.repository, ISSUE_DISCOVERY_LIMIT)).map((summary) => ({
      owner: input.repository.owner,
      repo: input.repository.repo,
      issueNumber: summary.issueNumber,
      updatedAt: summary.updatedAt,
    }));
    const scan = resolveRepositoryScan({
      state: input.state,
      repository: input.repository,
      summaries,
      scannedAt: input.now,
    });

    log({
      event: "repo-scanned",
      repoKey,
      baselineIssueCount: scan.baselineIssueCount,
      changedIssueCount: scan.changedIssues.length,
      issueDiscoveryLimit: ISSUE_DISCOVERY_LIMIT,
    });

    let nextState = scan.state;
    for (const summary of scan.changedIssues) {
      nextState = await fetchAndProcessChangedIssue({
        state: nextState,
        summary,
        agentFiles: input.agentFiles,
        now: input.now,
      });
    }

    return nextState;
  } catch (error) {
    log({ event: "repo-scan-failed", repoKey, error: formatError(error) });
    return input.state;
  }
}

async function pollActiveIssue(input: {
  state: GitHubResponseIntakeState;
  source: IssueSource;
  agentFiles: AgentFile[];
  now: Date;
}): Promise<GitHubResponseIntakeState> {
  const issueState = input.state.issues[input.source.issueKey];
  if (issueState === undefined || issueState.mode !== "active") {
    return input.state;
  }

  try {
    const issue = await fetchIssueWithComments(input.source);
    if (issue.updatedAt === issueState.updatedAt) {
      log({
        event: "active-issue-unchanged",
        issueKey: input.source.issueKey,
        activeNoChangeCount: issueState.activeNoChangeCount + 1,
      });
      return recordActiveIssueUnchanged({
        state: input.state,
        source: input.source,
        checkedAt: input.now,
        activeIssuePollIntervalMs: ACTIVE_ISSUE_POLL_INTERVAL_MS,
        activeIssueNoChangeLimit: ACTIVE_ISSUE_NO_CHANGE_LIMIT,
      });
    }

    const outcome = await processIssueSource({
      source: input.source,
      issue,
      agentFiles: input.agentFiles,
    });
    return recordIssueProcessingOutcome({
      state: input.state,
      summary: issueSummaryFromSource(input.source, issue.updatedAt),
      outcome,
      processedAt: input.now,
      activeIssuePollIntervalMs: ACTIVE_ISSUE_POLL_INTERVAL_MS,
    });
  } catch (error) {
    if (isGitHubIssueNotFoundError(error)) {
      log({ event: "skip", reason: "issue-not-found", issueKey: error.issueKey, detail: error.detail.trim() });
      return recordIssueProcessingOutcome({
        state: input.state,
        summary: issueSummaryFromSource(input.source, issueState.updatedAt),
        outcome: "issue-not-found",
        processedAt: input.now,
        activeIssuePollIntervalMs: ACTIVE_ISSUE_POLL_INTERVAL_MS,
      });
    }

    log({ event: "active-issue-fetch-failed", issueKey: input.source.issueKey, error: formatError(error) });
    return input.state;
  }
}

async function fetchAndProcessChangedIssue(input: {
  state: GitHubResponseIntakeState;
  summary: IssueSummary;
  agentFiles: AgentFile[];
  now: Date;
}): Promise<GitHubResponseIntakeState> {
  const source = makeIssueSource(input.summary);

  try {
    const issue = await fetchIssueWithComments(source);
    const outcome = await processIssueSource({
      source,
      issue,
      agentFiles: input.agentFiles,
    });

    return recordIssueProcessingOutcome({
      state: input.state,
      summary: issueSummaryFromSource(source, issue.updatedAt),
      outcome,
      processedAt: input.now,
      activeIssuePollIntervalMs: ACTIVE_ISSUE_POLL_INTERVAL_MS,
    });
  } catch (error) {
    if (isGitHubIssueNotFoundError(error)) {
      log({ event: "skip", reason: "issue-not-found", issueKey: error.issueKey, detail: error.detail.trim() });
      return recordIssueProcessingOutcome({
        state: input.state,
        summary: input.summary,
        outcome: "issue-not-found",
        processedAt: input.now,
        activeIssuePollIntervalMs: ACTIVE_ISSUE_POLL_INTERVAL_MS,
      });
    }

    log({ event: "issue-fetch-failed", issueKey: source.issueKey, error: formatError(error) });
    return recordIssueProcessingOutcome({
      state: input.state,
      summary: input.summary,
      outcome: "failed",
      processedAt: input.now,
      activeIssuePollIntervalMs: ACTIVE_ISSUE_POLL_INTERVAL_MS,
    });
  }
}

async function processIssueSource(input: {
  source: IssueSource;
  issue: GitHubIssue;
  agentFiles: AgentFile[];
}): Promise<IssueProcessingOutcome> {
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
      await postComment(input.source, trigger.body);
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
    const stateStore = await loadRoleThreadStateStore();
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
      const preScriptResult = await runAgentPreScript({
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

    let currentThreadId = plan.mode === "resume" ? plan.threadId : null;
    let finalRunDir = runDir;
    let result = await runCodex({
      prompt: plan.prompt,
      runDir,
      cwd: codexCwd,
      mode: plan.mode === "resume" ? { kind: "resume", threadId: plan.threadId } : { kind: "full" },
    });

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
      result = await runCodex({
        prompt: buildFallbackFullPrompt(agentManifest.body, timeline),
        runDir: finalRunDir,
        cwd: codexCwd,
        mode: { kind: "full" },
      });
    }

    if (!result.ok) {
      log({ event: "codex-failed", count, runDir: result.runDir, reason: result.reason, agent: selectedAgent.name });
      return "failed";
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

    const postedBody = formatAgentComment(selectedAgent.name, result.finalText);
    await postComment(input.source, postedBody);
    await saveRoleThreadStateStore(withRoleThreadState(stateStore, input.source.issueKey, selectedAgent.name, nextState));
    log({
      event: "commented",
      count,
      runDir: finalRunDir,
      agent: selectedAgent.name,
      threadId: nextState.threadId,
      cachedInputTokens: result.cachedInputTokens,
      issueKey: input.source.issueKey,
    });

    let workingTimeline = appendPostedComment(timeline, selectedAgent.name, postedBody);
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

      await postComment(input.source, nextTrigger.body);
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

export function start(): NodeJS.Timeout {
  log({ event: "start", config: CONFIG_LOG_FIELDS });
  void tick();
  return setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
}

export function makeRunDir(count: number, now = new Date()): string {
  return path.join(TMP_ROOT, `agent-moebius-${now.toISOString()}-c${count}`);
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
  start();
}
