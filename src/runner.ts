import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_MD_PATH, CONFIG_LOG_FIELDS, INTERVAL_MS, TMP_ROOT } from "./config.js";
import { buildPrompt, countMessages, shouldRespond } from "./conversation.js";
import { run as runCodex } from "./codex.js";
import { fetchIssueWithComments, postComment } from "./github.js";
import { log } from "./log.js";
import { read as readState, write as writeState } from "./state.js";

let running = false;

export async function tick(): Promise<void> {
  if (running) {
    log({ event: "skip-overlap" });
    return;
  }

  running = true;
  try {
    const issue = await fetchIssueWithComments();
    const count = countMessages(issue.comments.length);
    const state = await readState();

    if (!shouldRespond(count, state.maxRespondedCount)) {
      log({ event: "skip", count, maxRespondedCount: state.maxRespondedCount });
      return;
    }

    const runDir = makeRunDir(count);
    log({ event: "trigger", count, runDir });

    const agentMarkdown = await fs.readFile(AGENT_MD_PATH, "utf8");
    const prompt = buildPrompt(
      agentMarkdown,
      issue.body,
      issue.comments.map((comment) => comment.body),
    );

    const result = await runCodex({ prompt, runDir });
    if (!result.ok) {
      log({ event: "codex-failed", count, runDir: result.runDir, reason: result.reason });
      return;
    }

    await postComment(result.finalText);
    await writeState({ maxRespondedCount: count });
    log({ event: "commented", count, runDir });
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
