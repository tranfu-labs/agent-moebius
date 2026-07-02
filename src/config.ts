import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMergedLocalConfig } from "./local-config.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONFIG_PATH = path.join(PROJECT_ROOT, "config.toml");
export const LOCAL_CONFIG_PATH = path.join(PROJECT_ROOT, "config.local.toml");
const LOCAL_CONFIG = loadMergedLocalConfig({ configPath: CONFIG_PATH, localConfigPath: LOCAL_CONFIG_PATH });

export const WATCH_REPOSITORIES = LOCAL_CONFIG.watchRepositories;

export const TICK_INTERVAL_MS = 1 * 60 * 1000;
export const IDLE_REPOSITORY_SCAN_INTERVAL_MS = 5 * 60 * 1000;
export const ACTIVE_ISSUE_POLL_INTERVAL_MS = 1 * 60 * 1000;
export const RUNNING_AGENT_INTERRUPT_POLL_INTERVAL_MS = 15 * 1000;
export const ACTIVE_ISSUE_NO_CHANGE_LIMIT = 5;
export const ISSUE_DISCOVERY_LIMIT = 20;
export const MAX_ACTIVE_ISSUES = 20;
export const CODEX_DRIVER_POOL_MAX_CONCURRENT = 5;
export const AGENTS_DIR = "agents";
export const TMP_ROOT = "/tmp";
export const ROLE_THREADS_STATE_PATH = ".state/role-threads.json";
export const AGENT_CONTEXTS_STATE_PATH = ".state/agent-contexts.json";
export const GITHUB_RESPONSE_INTAKE_STATE_PATH = ".state/github-response-intake.json";
export const WORKDIR_ROOT = path.resolve(
  process.env.AGENT_MOEBIUS_WORKDIR_ROOT ?? path.join(PROJECT_ROOT, "..", "agent-moebius-workdir"),
);

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
  configPath: CONFIG_PATH,
  localConfigPath: LOCAL_CONFIG_PATH,
  watchedRepositories: WATCH_REPOSITORIES,
  tickIntervalMs: TICK_INTERVAL_MS,
  idleRepositoryScanIntervalMs: IDLE_REPOSITORY_SCAN_INTERVAL_MS,
  activeIssuePollIntervalMs: ACTIVE_ISSUE_POLL_INTERVAL_MS,
  runningAgentInterruptPollIntervalMs: RUNNING_AGENT_INTERRUPT_POLL_INTERVAL_MS,
  activeIssueNoChangeLimit: ACTIVE_ISSUE_NO_CHANGE_LIMIT,
  issueDiscoveryLimit: ISSUE_DISCOVERY_LIMIT,
  maxActiveIssues: MAX_ACTIVE_ISSUES,
  codexDriverPoolMaxConcurrent: CODEX_DRIVER_POOL_MAX_CONCURRENT,
  agentsDir: AGENTS_DIR,
  tmpRoot: TMP_ROOT,
  roleThreadsStatePath: ROLE_THREADS_STATE_PATH,
  agentContextsStatePath: AGENT_CONTEXTS_STATE_PATH,
  githubResponseIntakeStatePath: GITHUB_RESPONSE_INTAKE_STATE_PATH,
  workdirRoot: WORKDIR_ROOT,
};
