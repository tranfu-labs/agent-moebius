export const OWNER = "tranfu-labs";
export const REPO = "agent-moebius";
export const ISSUE_NUMBER = 3;
export const INTERVAL_MS = 5 * 60 * 1000;
export const AGENTS_DIR = "agents";
export const TMP_ROOT = "/tmp";
export const ISSUE_KEY = `${OWNER}/${REPO}#${ISSUE_NUMBER}`;
export const ROLE_THREADS_STATE_PATH = ".state/role-threads.json";

export const CODEX_EXEC_OPTIONS = [
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
  roleThreadsStatePath: ROLE_THREADS_STATE_PATH,
};
