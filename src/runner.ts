import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS_DIR, CONFIG_LOG_FIELDS, INTERVAL_MS, TMP_ROOT } from "./config.js";
import { buildPrompt, countMessages, getLatestMessage, selectMentionedAgent } from "./conversation.js";
import { run as runCodex } from "./codex.js";
import { fetchIssueWithComments, postComment } from "./github.js";
import { log } from "./log.js";

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
    const commentBodies = issue.comments.map((comment) => comment.body);
    const agentFiles = await listAgentFiles();
    const selectedAgentName = selectMentionedAgent(
      getLatestMessage(issue.body, commentBodies),
      agentFiles.map((agent) => agent.name),
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
    log({ event: "trigger", count, runDir, agent: selectedAgent.name });

    const agentMarkdown = await fs.readFile(selectedAgent.path, "utf8");
    const prompt = buildPrompt(agentMarkdown, issue.body, commentBodies);

    const result = await runCodex({ prompt, runDir });
    if (!result.ok) {
      log({ event: "codex-failed", count, runDir: result.runDir, reason: result.reason, agent: selectedAgent.name });
      return;
    }

    await postComment(result.finalText);
    log({ event: "commented", count, runDir, agent: selectedAgent.name });
  } catch (error) {
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
