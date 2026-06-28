export const OWNER = "tranfu-labs";
export const REPO = "agent-moebius";
export const ISSUE_NUMBER = 1;
export const INTERVAL_MS = 5 * 60 * 1000;
export const AGENTS_DIR = "agents";
export const TMP_ROOT = "/tmp";

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
  agentsDir: AGENTS_DIR,
  tmpRoot: TMP_ROOT,
};
