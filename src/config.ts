import path from "node:path";

export const OWNER = "tranfu-labs";
export const REPO = "agent-moebius";
export const ISSUE_NUMBER = 1;
export const INTERVAL_MS = 5 * 60 * 1000;
export const AGENT_MD_PATH = "agents/product-manager.md";
export const TMP_ROOT = "/tmp";
export const STATE_DIR = ".state";
export const STATE_FILE = path.join(STATE_DIR, `${OWNER}-${REPO}-${ISSUE_NUMBER}.json`);

export const CODEX_ARGS = [
  "exec",
  "--ephemeral",
  "--yolo",
  "--json",
  "-m",
  "gpt-5.5",
  "-c",
  'service_tier="fast"',
  "-c",
  "features.fast_mode=true",
  "-c",
  'model_reasoning_effort="xhigh"',
] as const;

export const CONFIG_LOG_FIELDS = {
  owner: OWNER,
  repo: REPO,
  issueNumber: ISSUE_NUMBER,
  intervalMs: INTERVAL_MS,
  agentMdPath: AGENT_MD_PATH,
  tmpRoot: TMP_ROOT,
  stateFile: STATE_FILE,
};
