import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_CONTEXTS_STATE_PATH, AGENTS_DIR, CONFIG_LOG_FIELDS, INTERVAL_MS, ISSUE_KEY, ISSUE_SOURCE, TMP_ROOT, WORKDIR_ROOT } from "./config.js";
import { parseAgentManifest } from "./agent-manifest.js";
import { runAgentPreScript } from "./agent-prescripts/index.js";
import {
  buildFallbackFullPrompt,
  buildRolePromptPlan,
  buildTimeline,
  countMessages,
  formatAgentComment,
  getLatestTimelineMessage,
  resolveNextRoleThreadState,
  selectMentionedAgent,
} from "./conversation.js";
import { run as runCodex } from "./codex.js";
import { fetchIssueWithComments, isGitHubIssueNotFoundError, postComment } from "./github.js";
import { log } from "./log.js";
import {
  getRoleThreadState,
  loadRoleThreadStateStore,
  saveRoleThreadStateStore,
  withRoleThreadState,
} from "./state.js";

let running = false;

interface AgentFile {
  name: string;
  path: string;
}

export async function tick(): Promise<void> {
  if (running) {
    log({ event: "skip-overlap" });
    return;
  }

  running = true;
  try {
    const issue = await fetchIssueWithComments();
    const count = countMessages(issue.comments.length);
    const agentFiles = await listAgentFiles();
    const agentNames = agentFiles.map((agent) => agent.name);
    const timeline = buildTimeline(issue.body, issue.comments, agentNames);
    const latestMessage = getLatestTimelineMessage(timeline);
    const selectedAgentName = selectMentionedAgent(
      latestMessage?.body ?? "",
      agentNames,
    );

    if (selectedAgentName === null) {
      log({ event: "skip", count, reason: "no-valid-agent-mention" });
      return;
    }

    const selectedAgent = agentFiles.find((agent) => agent.name === selectedAgentName);
    if (selectedAgent === undefined) {
      log({ event: "skip", count, reason: "selected-agent-missing", agent: selectedAgentName });
      return;
    }

    const runDir = makeRunDir(count);
    log({ event: "trigger", count, runDir, agent: selectedAgent.name, issueKey: ISSUE_KEY });

    const agentMarkdown = await fs.readFile(selectedAgent.path, "utf8");
    const agentManifest = parseAgentManifest(agentMarkdown);
    const stateStore = await loadRoleThreadStateStore();
    const existingState = getRoleThreadState(stateStore, ISSUE_KEY, selectedAgent.name);
    const plan = buildRolePromptPlan({
      role: selectedAgent.name,
      agentMarkdown: agentManifest.body,
      timeline,
      state: existingState,
    });

    if (plan.kind === "skip") {
      log({ event: "skip", count, reason: plan.reason, agent: selectedAgent.name, issueKey: ISSUE_KEY });
      return;
    }

    let codexCwd: string | undefined;
    if (agentManifest.preScript !== null) {
      const preScriptResult = await runAgentPreScript({
        role: selectedAgent.name,
        preScript: agentManifest.preScript,
        latestIndex: plan.latestIndex,
        issueSource: ISSUE_SOURCE,
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
        });
        return;
      }

      codexCwd = preScriptResult.codexCwd;
      log({
        event: "agent-prescript-completed",
        count,
        runDir,
        agent: selectedAgent.name,
        preScript: agentManifest.preScript,
        codexCwd,
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
      return;
    }

    const nextState = resolveNextRoleThreadState({
      currentThreadId,
      resultThreadId: result.threadId,
      latestIndex: plan.latestIndex,
    });

    if (nextState === null) {
      log({ event: "codex-failed", count, runDir: result.runDir, reason: "no-thread-id", agent: selectedAgent.name });
      return;
    }

    await postComment(formatAgentComment(selectedAgent.name, result.finalText));
    await saveRoleThreadStateStore(withRoleThreadState(stateStore, ISSUE_KEY, selectedAgent.name, nextState));
    log({
      event: "commented",
      count,
      runDir: finalRunDir,
      agent: selectedAgent.name,
      threadId: nextState.threadId,
      cachedInputTokens: result.cachedInputTokens,
    });
  } catch (error) {
    if (isGitHubIssueNotFoundError(error)) {
      log({ event: "skip", reason: "issue-not-found", issueKey: error.issueKey, detail: error.detail.trim() });
      return;
    }

    log({ event: "cycle-error", error: formatError(error) });
  } finally {
    running = false;
  }
}

export function start(): NodeJS.Timeout {
  log({ event: "start", config: CONFIG_LOG_FIELDS });
  void tick();
  return setInterval(() => {
    void tick();
  }, INTERVAL_MS);
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
