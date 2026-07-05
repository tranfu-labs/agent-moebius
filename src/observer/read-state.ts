import fs from "node:fs/promises";
import path from "node:path";
import type {
  AcceptanceFactStatus,
  AcceptanceStatementResult,
  GoalLedgerState,
  GoalRecord,
  IntegrationAcceptanceRecord,
  IntegrationAcceptanceStatus,
  IssueReference,
  IssueReferenceStatus,
  LedgerProvenance,
  LedgerReadinessStatus,
  MilestoneRecord,
  MissingGoalField,
  PhaseOwner,
  PhaseRecord,
  PhaseStatus,
  QualityBaseline,
  RunManifestReference,
  RunManifestStage,
  TaskAcceptanceRecord,
  TaskRecord,
} from "../goal-ledger.js";
import { parseLocalConfig } from "../local-config.js";
import type { RepositoryRef } from "../issue-source.js";

export type ObserverSourceStatus = "ok" | "missing" | "error" | "partial" | "timeout";

export interface ObserverDiagnostic {
  source: string;
  status: ObserverSourceStatus;
  message: string;
  line?: number;
}

export interface ObserverIntakeIssueState {
  owner: string;
  repo: string;
  issueNumber: number;
  updatedAt: string;
  mode: "idle" | "active";
  activeNoChangeCount: number;
  nextPollAt: string | null;
  failureCount?: number;
  lastFailureReason?: string;
  lastOutcome?: ObserverIntakeLastOutcome;
}

export interface ObserverIntakeState {
  issues: Record<string, ObserverIntakeIssueState>;
}

export interface ObserverIntakeLastOutcome {
  result: "triggered-success" | "no-trigger" | "failed" | "dead-lettered" | "interrupted";
  reason: string;
  recordedAt: string;
  targetRole?: string;
  failureCount?: number;
}

export interface ObserverRoleThreadState {
  threadId: string;
  lastSeenIndex: number;
}

export type ObserverRoleThreadStore = Record<string, Record<string, ObserverRoleThreadState>>;

export interface ObserverAgentContextState {
  preScript: string;
  owner: string;
  repo: string;
  issueNumber: number;
  worktreePath: string;
  preparedFromMessageIndex: number;
}

export type ObserverAgentContextStore = Record<string, Record<string, ObserverAgentContextState>>;

export type ObserverRunManifestStage = "plan-written" | "code-verified" | "in-progress" | "unknown";

export interface ObserverRunManifestRecord {
  issue: {
    owner: string;
    repo: string;
    number: number;
  };
  lineNumber?: number;
  runDir?: string;
  role: string;
  stage: ObserverRunManifestStage;
  artifacts: Array<{
    path: string;
    publishedUrl: string | null;
  }>;
  startedAt: string;
  completedAt: string;
  promptMode?: string;
  trigger?: ObserverRunManifestTrigger;
  detailLocators?: ObserverRunDetailLocators;
  usage?: ObserverRunUsage;
  details?: ObserverRunDetails;
}

export interface ObserverRunManifestTrigger {
  source: string;
  messageIndex?: number;
  reason?: string;
  targetRole?: string;
}

export interface ObserverRunDetailLocators {
  inputContextPath?: string;
  outputPath?: string;
  stdoutPath?: string;
  stderrPath?: string;
}

export interface ObserverRunUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

export interface ObserverRunDetails {
  inputContext: ObserverRunDetailReadResult;
  output: ObserverRunDetailReadResult;
}

export type ObserverRunDetailStatus = "ok" | "missing" | "error" | "timeout" | "escaped" | "unavailable";

export interface ObserverRunDetailReadResult {
  status: ObserverRunDetailStatus;
  source: string;
  content?: string;
  message?: string;
}

export type ObserverGoalLedgerStatus = "ok" | "missing" | "timeout" | "error";

export interface ObserverStateSnapshot {
  projectRoot: string;
  watchRepositories: RepositoryRef[];
  configUsable: boolean;
  goalLedgerStatus: ObserverGoalLedgerStatus;
  goalLedger: GoalLedgerState;
  intakeState: ObserverIntakeState;
  roleThreads: ObserverRoleThreadStore;
  agentContexts: ObserverAgentContextStore;
  runManifests: ObserverRunManifestRecord[];
  diagnostics: ObserverDiagnostic[];
}

export interface ReadObserverStateInput {
  projectRoot?: string;
  goalLedgerReadTimeoutMs?: number;
  runDetailReadTimeoutMs?: number;
  readGoalLedgerFile?: (filePath: string) => Promise<string>;
  readRunDetailFile?: (filePath: string) => Promise<string>;
}

interface ValidationResult<T> {
  data: T;
  diagnostics: ObserverDiagnostic[];
  fatal?: string;
}

interface ConfigReadResult {
  repositories: RepositoryRef[];
  configUsable: boolean;
  diagnostics: ObserverDiagnostic[];
}

const EMPTY_INTAKE_STATE: ObserverIntakeState = { issues: {} };
const EMPTY_ROLE_THREADS: ObserverRoleThreadStore = {};
const EMPTY_AGENT_CONTEXTS: ObserverAgentContextStore = {};
const EMPTY_RUN_MANIFESTS: ObserverRunManifestRecord[] = [];
const EMPTY_GOAL_LEDGER: GoalLedgerState = {
  schemaVersion: 1,
  goals: {},
  milestones: {},
  tasks: {},
  phases: {},
};
const DEFAULT_GOAL_LEDGER_READ_TIMEOUT_MS = 1_000;
const DEFAULT_RUN_DETAIL_READ_TIMEOUT_MS = 250;
const RUN_MANIFEST_STAGES = new Set<ObserverRunManifestStage>([
  "plan-written",
  "code-verified",
  "in-progress",
  "unknown",
]);
const INTAKE_OUTCOME_RESULTS = new Set<ObserverIntakeLastOutcome["result"]>([
  "triggered-success",
  "no-trigger",
  "failed",
  "dead-lettered",
  "interrupted",
]);
const QUALITY_BASELINES = new Set<QualityBaseline>(["demo", "data-correct", "production"]);
const READINESS_STATUSES = new Set<LedgerReadinessStatus>(["draft", "pending", "ready"]);
const ISSUE_REFERENCE_STATUSES = new Set<IssueReferenceStatus>(["planned", "open", "closed", "unknown"]);
const ISSUE_RELATIONS = new Set(["source", "parent", "child", "acceptance", "implementation"]);
const MISSING_GOAL_FIELDS = new Set<MissingGoalField>([
  "scope",
  "acceptanceStatements",
  "dependencies",
  "qualityBaseline",
]);
const PHASE_STATUSES = new Set<PhaseStatus>(["pending", "active", "completed"]);
const ACCEPTANCE_FACT_STATUSES = new Set<AcceptanceFactStatus>(["passed", "failed"]);
const INTEGRATION_ACCEPTANCE_STATUSES = new Set<IntegrationAcceptanceStatus>([
  "requested",
  "passed",
  "failed",
  "blocked",
]);

export async function readObserverState(input: ReadObserverStateInput = {}): Promise<ObserverStateSnapshot> {
  const projectRoot = path.resolve(input.projectRoot ?? process.cwd());
  const config = await readObserverConfig(projectRoot);
  const goalLedger = await readGoalLedgerState({
    filePath: path.join(projectRoot, ".state", "goal-ledger.json"),
    timeoutMs: input.goalLedgerReadTimeoutMs ?? DEFAULT_GOAL_LEDGER_READ_TIMEOUT_MS,
    readFile: input.readGoalLedgerFile ?? ((filePath) => fs.readFile(filePath, "utf8")),
  });
  const intake = await readJsonState({
    source: ".state/github-response-intake.json",
    filePath: path.join(projectRoot, ".state", "github-response-intake.json"),
    empty: EMPTY_INTAKE_STATE,
    validate: validateIntakeState,
  });
  const roleThreads = await readJsonState({
    source: ".state/role-threads.json",
    filePath: path.join(projectRoot, ".state", "role-threads.json"),
    empty: EMPTY_ROLE_THREADS,
    validate: validateRoleThreadStore,
  });
  const agentContexts = await readJsonState({
    source: ".state/agent-contexts.json",
    filePath: path.join(projectRoot, ".state", "agent-contexts.json"),
    empty: EMPTY_AGENT_CONTEXTS,
    validate: validateAgentContextStore,
  });
  const runManifests = await readRunManifestJsonl({
    filePath: path.join(projectRoot, ".state", "run-manifests.jsonl"),
    timeoutMs: input.runDetailReadTimeoutMs ?? DEFAULT_RUN_DETAIL_READ_TIMEOUT_MS,
    readDetailFile: input.readRunDetailFile ?? ((filePath) => fs.readFile(filePath, "utf8")),
  });

  return {
    projectRoot,
    watchRepositories: config.repositories,
    configUsable: config.configUsable,
    goalLedgerStatus: goalLedger.status,
    goalLedger: goalLedger.data,
    intakeState: intake.data,
    roleThreads: roleThreads.data,
    agentContexts: agentContexts.data,
    runManifests: runManifests.data,
    diagnostics: [
      ...config.diagnostics,
      ...goalLedger.diagnostics,
      ...intake.diagnostics,
      ...roleThreads.diagnostics,
      ...agentContexts.diagnostics,
      ...runManifests.diagnostics,
    ],
  };
}

async function readGoalLedgerState(input: {
  filePath: string;
  timeoutMs: number;
  readFile: (filePath: string) => Promise<string>;
}): Promise<{ status: ObserverGoalLedgerStatus; data: GoalLedgerState; diagnostics: ObserverDiagnostic[] }> {
  const source = ".state/goal-ledger.json";
  let raw: string;
  try {
    raw = await withTimeout(input.readFile(input.filePath), input.timeoutMs);
  } catch (error) {
    if (error instanceof TimeoutError) {
      return {
        status: "timeout",
        data: EMPTY_GOAL_LEDGER,
        diagnostics: [{ source, status: "timeout", message: `读取超时：超过 ${input.timeoutMs}ms` }],
      };
    }
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        status: "missing",
        data: EMPTY_GOAL_LEDGER,
        diagnostics: [{ source, status: "missing", message: "目标账本缺失" }],
      };
    }

    return {
      status: "error",
      data: EMPTY_GOAL_LEDGER,
      diagnostics: [{ source, status: "error", message: `读取失败：${formatError(error)}` }],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      status: "error",
      data: EMPTY_GOAL_LEDGER,
      diagnostics: [{ source, status: "error", message: `读取失败：JSON 解析失败：${formatError(error)}` }],
    };
  }

  const validated = validateGoalLedgerState(parsed, source);
  if (validated.fatal !== undefined) {
    return {
      status: "error",
      data: EMPTY_GOAL_LEDGER,
      diagnostics: [{ source, status: "error", message: `读取失败：${validated.fatal}` }],
    };
  }

  return {
    status: "ok",
    data: validated.data,
    diagnostics:
      validated.diagnostics.length === 0
        ? [{ source, status: "ok", message: "目标账本读取成功" }]
        : validated.diagnostics,
  };
}

class TimeoutError extends Error {
  constructor() {
    super("timeout");
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new TimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

async function readObserverConfig(projectRoot: string): Promise<ConfigReadResult> {
  const defaultConfig = await readConfigFile(path.join(projectRoot, "config.toml"), "config.toml");
  const localConfig = await readConfigFile(path.join(projectRoot, "config.local.toml"), "config.local.toml");
  const configUsable = defaultConfig.status !== "error" && localConfig.status !== "error";
  const repositories = configUsable
    ? localConfig.status === "ok"
      ? localConfig.repositories
      : defaultConfig.status === "ok"
        ? defaultConfig.repositories
        : []
    : [];

  return {
    repositories,
    configUsable,
    diagnostics: [...defaultConfig.diagnostics, ...localConfig.diagnostics],
  };
}

async function readConfigFile(
  filePath: string,
  source: string,
): Promise<
  | { status: "ok"; repositories: RepositoryRef[]; diagnostics: ObserverDiagnostic[] }
  | { status: "missing"; repositories: RepositoryRef[]; diagnostics: ObserverDiagnostic[] }
  | { status: "error"; repositories: RepositoryRef[]; diagnostics: ObserverDiagnostic[] }
> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        status: "missing",
        repositories: [],
        diagnostics: [{ source, status: "missing", message: "配置文件缺失" }],
      };
    }

    return {
      status: "error",
      repositories: [],
      diagnostics: [{ source, status: "error", message: `配置读取失败：${formatError(error)}` }],
    };
  }

  try {
    return {
      status: "ok",
      repositories: parseLocalConfig(raw, source).watchRepositories,
      diagnostics: [{ source, status: "ok", message: "配置读取成功" }],
    };
  } catch (error) {
    return {
      status: "error",
      repositories: [],
      diagnostics: [{ source, status: "error", message: `配置读取失败：${formatError(error)}` }],
    };
  }
}

async function readJsonState<T>(input: {
  source: string;
  filePath: string;
  empty: T;
  validate: (value: unknown, source: string) => ValidationResult<T>;
}): Promise<{ data: T; diagnostics: ObserverDiagnostic[] }> {
  let raw: string;
  try {
    raw = await fs.readFile(input.filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        data: input.empty,
        diagnostics: [{ source: input.source, status: "missing", message: "状态文件缺失" }],
      };
    }

    return {
      data: input.empty,
      diagnostics: [{ source: input.source, status: "error", message: `读取失败：${formatError(error)}` }],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      data: input.empty,
      diagnostics: [{ source: input.source, status: "error", message: `读取失败：JSON 解析失败：${formatError(error)}` }],
    };
  }

  const validated = input.validate(parsed, input.source);
  if (validated.fatal !== undefined) {
    return {
      data: input.empty,
      diagnostics: [{ source: input.source, status: "error", message: `读取失败：${validated.fatal}` }],
    };
  }

  return {
    data: validated.data,
    diagnostics:
      validated.diagnostics.length === 0
        ? [{ source: input.source, status: "ok", message: "状态文件读取成功" }]
        : validated.diagnostics,
  };
}

async function readRunManifestJsonl(input: {
  filePath: string;
  timeoutMs: number;
  readDetailFile: (filePath: string) => Promise<string>;
}): Promise<{ data: ObserverRunManifestRecord[]; diagnostics: ObserverDiagnostic[] }> {
  const source = ".state/run-manifests.jsonl";
  let raw: string;
  try {
    raw = await fs.readFile(input.filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        data: EMPTY_RUN_MANIFESTS,
        diagnostics: [{ source, status: "missing", message: "manifest 文件缺失" }],
      };
    }

    return {
      data: EMPTY_RUN_MANIFESTS,
      diagnostics: [{ source, status: "error", message: `读取失败：${formatError(error)}` }],
    };
  }

  const records: ObserverRunManifestRecord[] = [];
  const diagnostics: ObserverDiagnostic[] = [];
  const lines = raw.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (line.trim().length === 0) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      diagnostics.push({
        source,
        status: "partial",
        line: lineNumber,
        message: `第 ${lineNumber} 行跳过：JSON 解析失败：${formatError(error)}`,
      });
      continue;
    }

    const manifest = validateRunManifestRecord(parsed, lineNumber);
    if (!manifest.ok) {
      diagnostics.push({
        source,
        status: "partial",
        line: lineNumber,
        message: `第 ${lineNumber} 行跳过：${manifest.reason}`,
      });
      continue;
    }

    records.push(await attachRunDetails(manifest.record, input));
  }

  return {
    data: records,
    diagnostics:
      diagnostics.length === 0
        ? [{ source, status: "ok", message: "manifest 读取成功" }]
        : diagnostics,
  };
}

function validateIntakeState(value: unknown, source: string): ValidationResult<ObserverIntakeState> {
  if (!isPlainObject(value)) {
    return { data: EMPTY_INTAKE_STATE, diagnostics: [], fatal: "顶层不是对象" };
  }

  if (!isPlainObject(value.issues)) {
    return { data: EMPTY_INTAKE_STATE, diagnostics: [], fatal: "缺少 issues 对象" };
  }

  const issues: Record<string, ObserverIntakeIssueState> = {};
  const diagnostics: ObserverDiagnostic[] = [];
  for (const [issueKey, issue] of Object.entries(value.issues)) {
    if (isIntakeIssueState(issue)) {
      issues[issueKey] = issue;
      continue;
    }

    diagnostics.push({
      source,
      status: "partial",
      message: `issue ${issueKey} 跳过：字段不完整或类型错误`,
    });
  }

  return { data: { issues }, diagnostics };
}

function validateGoalLedgerState(value: unknown, source: string): ValidationResult<GoalLedgerState> {
  if (!isPlainObject(value)) {
    return { data: EMPTY_GOAL_LEDGER, diagnostics: [], fatal: "顶层不是对象" };
  }
  if (value.schemaVersion !== 1) {
    return { data: EMPTY_GOAL_LEDGER, diagnostics: [], fatal: "schemaVersion 不支持" };
  }
  if (!isPlainObject(value.goals) || !isPlainObject(value.milestones) || !isPlainObject(value.tasks) || !isPlainObject(value.phases)) {
    return { data: EMPTY_GOAL_LEDGER, diagnostics: [], fatal: "缺少实体集合" };
  }

  const diagnostics: ObserverDiagnostic[] = [];
  const goals = collectRecord(value.goals, source, "goal", isGoalRecord, diagnostics);
  const milestones = collectRecord(value.milestones, source, "milestone", isMilestoneRecord, diagnostics);
  const tasks = collectRecord(value.tasks, source, "task", isTaskRecord, diagnostics);
  const phases = collectRecord(value.phases, source, "phase", isPhaseRecord, diagnostics);

  for (const [id, milestone] of Object.entries(milestones)) {
    if (goals[milestone.goalId] === undefined) {
      diagnostics.push({ source, status: "partial", message: `milestone ${id} 跳过：goalId 不存在` });
      delete milestones[id];
    }
  }

  for (const [id, task] of Object.entries(tasks)) {
    if (goals[task.goalId] === undefined) {
      diagnostics.push({ source, status: "partial", message: `task ${id} 跳过：goalId 不存在` });
      delete tasks[id];
      continue;
    }
    if (task.milestoneId !== undefined) {
      const milestone = milestones[task.milestoneId];
      if (milestone === undefined || milestone.goalId !== task.goalId) {
        diagnostics.push({ source, status: "partial", message: `task ${id} 跳过：milestoneId 无效` });
        delete tasks[id];
      }
    }
  }

  for (const [id, phase] of Object.entries(phases)) {
    if (!hasOwner({ goals, milestones, tasks }, phase.owner)) {
      diagnostics.push({ source, status: "partial", message: `phase ${id} 跳过：owner 不存在` });
      delete phases[id];
    }
  }

  return {
    data: {
      schemaVersion: 1,
      goals,
      milestones,
      tasks,
      phases,
    },
    diagnostics,
  };
}

function collectRecord<T>(
  value: Record<string, unknown>,
  source: string,
  label: string,
  guard: (candidate: unknown) => candidate is T & { id: string },
  diagnostics: ObserverDiagnostic[],
): Record<string, T> {
  const records: Record<string, T> = {};
  for (const [id, candidate] of Object.entries(value)) {
    if (!guard(candidate) || candidate.id !== id) {
      diagnostics.push({ source, status: "partial", message: `${label} ${id} 跳过：字段不完整或类型错误` });
      continue;
    }
    records[id] = candidate;
  }
  return records;
}

function hasOwner(
  state: Pick<GoalLedgerState, "goals" | "milestones" | "tasks">,
  owner: PhaseOwner,
): boolean {
  if (owner.kind === "goal") {
    return state.goals[owner.id] !== undefined;
  }
  if (owner.kind === "milestone") {
    return state.milestones[owner.id] !== undefined;
  }
  return state.tasks[owner.id] !== undefined;
}

function validateRoleThreadStore(value: unknown, source: string): ValidationResult<ObserverRoleThreadStore> {
  if (!isPlainObject(value)) {
    return { data: EMPTY_ROLE_THREADS, diagnostics: [], fatal: "顶层不是对象" };
  }

  const store: ObserverRoleThreadStore = {};
  const diagnostics: ObserverDiagnostic[] = [];
  for (const [issueKey, roles] of Object.entries(value)) {
    if (!isPlainObject(roles)) {
      diagnostics.push({ source, status: "partial", message: `issue ${issueKey} 跳过：role 列表不是对象` });
      continue;
    }

    const validRoles: Record<string, ObserverRoleThreadState> = {};
    for (const [role, state] of Object.entries(roles)) {
      if (isRoleThreadState(state)) {
        validRoles[role] = state;
      } else {
        diagnostics.push({ source, status: "partial", message: `${issueKey}/${role} 跳过：thread 状态无效` });
      }
    }

    if (Object.keys(validRoles).length > 0) {
      store[issueKey] = validRoles;
    }
  }

  return { data: store, diagnostics };
}

function validateAgentContextStore(value: unknown, source: string): ValidationResult<ObserverAgentContextStore> {
  if (!isPlainObject(value)) {
    return { data: EMPTY_AGENT_CONTEXTS, diagnostics: [], fatal: "顶层不是对象" };
  }

  const store: ObserverAgentContextStore = {};
  const diagnostics: ObserverDiagnostic[] = [];
  for (const [issueKey, roles] of Object.entries(value)) {
    if (!isPlainObject(roles)) {
      diagnostics.push({ source, status: "partial", message: `issue ${issueKey} 跳过：context 列表不是对象` });
      continue;
    }

    const validRoles: Record<string, ObserverAgentContextState> = {};
    for (const [role, state] of Object.entries(roles)) {
      if (isAgentContextState(state)) {
        validRoles[role] = state;
      } else {
        diagnostics.push({ source, status: "partial", message: `${issueKey}/${role} 跳过：context 状态无效` });
      }
    }

    if (Object.keys(validRoles).length > 0) {
      store[issueKey] = validRoles;
    }
  }

  return { data: store, diagnostics };
}

function validateRunManifestRecord(
  value: unknown,
  lineNumber: number,
): { ok: true; record: ObserverRunManifestRecord } | { ok: false; reason: string } {
  if (!isPlainObject(value)) {
    return { ok: false, reason: "record 不是对象" };
  }

  if (!isPlainObject(value.issue)) {
    return { ok: false, reason: "缺字段 issue" };
  }

  if (!Array.isArray(value.artifacts)) {
    return { ok: false, reason: "缺字段 artifacts" };
  }

  const issue = value.issue;
  if (
    typeof issue.owner !== "string" ||
    issue.owner.length === 0 ||
    typeof issue.repo !== "string" ||
    issue.repo.length === 0 ||
    !isPositiveInteger(issue.number)
  ) {
    return { ok: false, reason: "issue 字段无效" };
  }

  if (typeof value.role !== "string" || value.role.length === 0) {
    return { ok: false, reason: "缺字段 role" };
  }

  if (typeof value.stage !== "string" || !RUN_MANIFEST_STAGES.has(value.stage as ObserverRunManifestStage)) {
    return { ok: false, reason: "stage 字段无效" };
  }

  if (typeof value.startedAt !== "string" || value.startedAt.length === 0) {
    return { ok: false, reason: "缺字段 startedAt" };
  }

  if (typeof value.completedAt !== "string" || value.completedAt.length === 0) {
    return { ok: false, reason: "缺字段 completedAt" };
  }

  const artifacts: ObserverRunManifestRecord["artifacts"] = [];
  for (const artifact of value.artifacts) {
    if (!isPlainObject(artifact)) {
      return { ok: false, reason: "artifact 不是对象" };
    }

    if (typeof artifact.path !== "string" || artifact.path.length === 0) {
      return { ok: false, reason: "artifact.path 字段无效" };
    }

    if (!(artifact.publishedUrl === null || (typeof artifact.publishedUrl === "string" && artifact.publishedUrl.length > 0))) {
      return { ok: false, reason: "artifact.publishedUrl 字段无效" };
    }

    artifacts.push({ path: artifact.path, publishedUrl: artifact.publishedUrl });
  }

  const runDir = typeof value.runDir === "string" && value.runDir.length > 0 ? value.runDir : undefined;
  const promptMode = typeof value.promptMode === "string" && value.promptMode.length > 0 ? value.promptMode : undefined;
  const trigger = readRunManifestTrigger(value.trigger);
  const detailLocators = readRunDetailLocators(value.detailLocators);
  const usage = readRunUsage(value.usage);

  return {
    ok: true,
    record: {
      issue: { owner: issue.owner, repo: issue.repo, number: issue.number },
      lineNumber,
      ...(runDir === undefined ? {} : { runDir }),
      role: value.role,
      stage: value.stage as ObserverRunManifestStage,
      artifacts,
      startedAt: value.startedAt,
      completedAt: value.completedAt,
      ...(promptMode === undefined ? {} : { promptMode }),
      ...(trigger === undefined ? {} : { trigger }),
      ...(detailLocators === undefined ? {} : { detailLocators }),
      ...(usage === undefined ? {} : { usage }),
    },
  };
}

async function attachRunDetails(
  record: ObserverRunManifestRecord,
  input: { timeoutMs: number; readDetailFile: (filePath: string) => Promise<string> },
): Promise<ObserverRunManifestRecord> {
  if (record.runDir === undefined) {
    return record;
  }

  const inputContext = await readRunDetailCandidates({
    runDir: record.runDir,
    explicitPath: record.detailLocators?.inputContextPath,
    fallbackPaths: ["run-details/input-context.md", "input.jsonl"],
    label: "input context",
    timeoutMs: input.timeoutMs,
    readDetailFile: input.readDetailFile,
  });
  const output = await readRunDetailCandidates({
    runDir: record.runDir,
    explicitPath: record.detailLocators?.outputPath ?? record.detailLocators?.stdoutPath,
    fallbackPaths: ["run-details/agent-output.md", "stdout.jsonl"],
    label: "agent output",
    timeoutMs: input.timeoutMs,
    readDetailFile: input.readDetailFile,
  });

  return { ...record, details: { inputContext, output } };
}

async function readRunDetailCandidates(input: {
  runDir: string;
  explicitPath?: string;
  fallbackPaths: string[];
  label: string;
  timeoutMs: number;
  readDetailFile: (filePath: string) => Promise<string>;
}): Promise<ObserverRunDetailReadResult> {
  const candidates = input.explicitPath === undefined ? input.fallbackPaths : [input.explicitPath];
  let lastMissing: ObserverRunDetailReadResult | null = null;

  for (const candidate of candidates) {
    const resolved = resolveRunDetailPath(input.runDir, candidate);
    if (!resolved.ok) {
      return {
        status: "escaped",
        source: candidate,
        message: `${input.label} locator escaped runDir`,
      };
    }

    try {
      const content = await withTimeout(input.readDetailFile(resolved.filePath), input.timeoutMs);
      return {
        status: "ok",
        source: candidate,
        content,
      };
    } catch (error) {
      if (error instanceof TimeoutError) {
        return {
          status: "timeout",
          source: candidate,
          message: `detail-read-timeout:${input.timeoutMs}ms`,
        };
      }

      if (isNodeError(error) && error.code === "ENOENT") {
        lastMissing = {
          status: "missing",
          source: candidate,
          message: "detail-read-missing",
        };
        continue;
      }

      return {
        status: "error",
        source: candidate,
        message: `detail-read-error:${formatError(error)}`,
      };
    }
  }

  return (
    lastMissing ?? {
      status: "unavailable",
      source: candidates.join(", "),
      message: "detail-read-unavailable",
    }
  );
}

function resolveRunDetailPath(runDir: string, locator: string): { ok: true; filePath: string } | { ok: false } {
  if (locator.length === 0 || path.isAbsolute(locator)) {
    return { ok: false };
  }

  const normalized = path.posix.normalize(locator.replaceAll(path.sep, path.posix.sep));
  if (normalized === "." || normalized.startsWith("../") || normalized === "..") {
    return { ok: false };
  }

  const runDirPath = path.resolve(runDir);
  const filePath = path.resolve(runDirPath, normalized);
  const relative = path.relative(runDirPath, filePath);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false };
  }

  return { ok: true, filePath };
}

function readRunManifestTrigger(value: unknown): ObserverRunManifestTrigger | undefined {
  if (!isPlainObject(value) || !isNonEmptyString(value.source)) {
    return undefined;
  }

  return {
    source: value.source,
    ...(isNonNegativeInteger(value.messageIndex) ? { messageIndex: value.messageIndex } : {}),
    ...(isNonEmptyString(value.reason) ? { reason: value.reason } : {}),
    ...(isNonEmptyString(value.targetRole) ? { targetRole: value.targetRole } : {}),
  };
}

function readRunDetailLocators(value: unknown): ObserverRunDetailLocators | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const locators: ObserverRunDetailLocators = {};
  if (isNonEmptyString(value.inputContextPath)) {
    locators.inputContextPath = value.inputContextPath;
  }
  if (isNonEmptyString(value.outputPath)) {
    locators.outputPath = value.outputPath;
  }
  if (isNonEmptyString(value.stdoutPath)) {
    locators.stdoutPath = value.stdoutPath;
  }
  if (isNonEmptyString(value.stderrPath)) {
    locators.stderrPath = value.stderrPath;
  }

  return Object.keys(locators).length === 0 ? undefined : locators;
}

function readRunUsage(value: unknown): ObserverRunUsage | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const usage: ObserverRunUsage = {};
  const inputTokens = readFiniteNumber(value.inputTokens) ?? readFiniteNumber(value.input_tokens);
  const outputTokens = readFiniteNumber(value.outputTokens) ?? readFiniteNumber(value.output_tokens);
  const cachedInputTokens = readFiniteNumber(value.cachedInputTokens) ?? readFiniteNumber(value.cached_input_tokens);
  if (inputTokens !== undefined) {
    usage.inputTokens = inputTokens;
  }
  if (outputTokens !== undefined) {
    usage.outputTokens = outputTokens;
  }
  if (cachedInputTokens !== undefined) {
    usage.cachedInputTokens = cachedInputTokens;
  }

  return Object.keys(usage).length === 0 ? undefined : usage;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function isIntakeIssueState(value: unknown): value is ObserverIntakeIssueState {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.owner === "string" &&
    value.owner.length > 0 &&
    typeof value.repo === "string" &&
    value.repo.length > 0 &&
    isPositiveInteger(value.issueNumber) &&
    typeof value.updatedAt === "string" &&
    value.updatedAt.length > 0 &&
    (value.mode === "idle" || value.mode === "active") &&
    isNonNegativeInteger(value.activeNoChangeCount) &&
    (value.nextPollAt === null || (typeof value.nextPollAt === "string" && value.nextPollAt.length > 0)) &&
    (value.failureCount === undefined || isNonNegativeInteger(value.failureCount)) &&
    (value.lastFailureReason === undefined ||
      (typeof value.lastFailureReason === "string" && value.lastFailureReason.length > 0)) &&
    (value.lastOutcome === undefined || isIntakeLastOutcome(value.lastOutcome))
  );
}

function isIntakeLastOutcome(value: unknown): value is ObserverIntakeLastOutcome {
  return (
    isPlainObject(value) &&
    typeof value.result === "string" &&
    INTAKE_OUTCOME_RESULTS.has(value.result as ObserverIntakeLastOutcome["result"]) &&
    isNonEmptyString(value.reason) &&
    isNonEmptyString(value.recordedAt) &&
    (value.targetRole === undefined || isNonEmptyString(value.targetRole)) &&
    (value.failureCount === undefined || isNonNegativeInteger(value.failureCount))
  );
}

function isRoleThreadState(value: unknown): value is ObserverRoleThreadState {
  return (
    isPlainObject(value) &&
    typeof value.threadId === "string" &&
    value.threadId.length > 0 &&
    isNonNegativeInteger(value.lastSeenIndex)
  );
}

function isAgentContextState(value: unknown): value is ObserverAgentContextState {
  return (
    isPlainObject(value) &&
    typeof value.preScript === "string" &&
    value.preScript.length > 0 &&
    typeof value.owner === "string" &&
    value.owner.length > 0 &&
    typeof value.repo === "string" &&
    value.repo.length > 0 &&
    isPositiveInteger(value.issueNumber) &&
    typeof value.worktreePath === "string" &&
    value.worktreePath.length > 0 &&
    isNonNegativeInteger(value.preparedFromMessageIndex)
  );
}

function isGoalRecord(value: unknown): value is GoalRecord {
  return (
    isPlainObject(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    isReadinessStatus(value.status) &&
    isOptionalString(value.summary) &&
    isOptionalString(value.scope) &&
    isOptionalNonEmptyStringArray(value.acceptanceStatements) &&
    isOptionalStringArray(value.dependencies) &&
    isOptionalQualityBaseline(value.qualityBaseline) &&
    isIssueReferenceArray(value.issueRefs) &&
    isStringArray(value.milestoneIds) &&
    isLedgerProvenanceArray(value.provenance) &&
    Array.isArray(value.missingFields) &&
    value.missingFields.every((field) => typeof field === "string" && MISSING_GOAL_FIELDS.has(field as MissingGoalField)) &&
    isStringArray(value.nextQuestions) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt)
  );
}

function isMilestoneRecord(value: unknown): value is MilestoneRecord {
  return (
    isPlainObject(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.goalId) &&
    isNonEmptyString(value.title) &&
    isQualityBaseline(value.qualityBaseline) &&
    isStringArray(value.taskIds) &&
    isStringArray(value.phaseIds) &&
    isIssueReferenceArray(value.issueRefs) &&
    isLedgerProvenanceArray(value.provenance) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt)
  );
}

function isTaskRecord(value: unknown): value is TaskRecord {
  return (
    isPlainObject(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.goalId) &&
    isOptionalString(value.milestoneId) &&
    isNonEmptyString(value.title) &&
    isReadinessStatus(value.status) &&
    isOptionalString(value.scope) &&
    isOptionalNonEmptyStringArray(value.acceptanceStatements) &&
    isOptionalStringArray(value.dependencies) &&
    isOptionalQualityBaseline(value.qualityBaseline) &&
    isStringArray(value.phaseIds) &&
    (value.parentIssueRef === undefined || isIssueReference(value.parentIssueRef)) &&
    isIssueReferenceArray(value.childIssueRefs) &&
    (value.acceptanceFacts === undefined || (Array.isArray(value.acceptanceFacts) && value.acceptanceFacts.every(isTaskAcceptanceRecord))) &&
    Array.isArray(value.runManifestRefs) &&
    value.runManifestRefs.every(isRunManifestReference) &&
    isLedgerProvenanceArray(value.provenance) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt)
  );
}

function isPhaseRecord(value: unknown): value is PhaseRecord {
  return (
    isPlainObject(value) &&
    isNonEmptyString(value.id) &&
    isPhaseOwner(value.owner) &&
    isNonEmptyString(value.name) &&
    typeof value.status === "string" &&
    PHASE_STATUSES.has(value.status as PhaseStatus) &&
    isQualityBaseline(value.qualityBaseline) &&
    isOptionalString(value.objective) &&
    isOptionalNonEmptyStringArray(value.acceptanceStatements) &&
    isOptionalStringArray(value.dependencies) &&
    (value.integrationAcceptance === undefined ||
      (Array.isArray(value.integrationAcceptance) && value.integrationAcceptance.every(isIntegrationAcceptanceRecord))) &&
    isOptionalString(value.archiveSummary) &&
    isOptionalString(value.archivedAt) &&
    isOptionalString(value.startedAt) &&
    isOptionalString(value.completedAt) &&
    isLedgerProvenanceArray(value.provenance)
  );
}

function isIssueReferenceArray(value: unknown): value is IssueReference[] {
  return Array.isArray(value) && value.every(isIssueReference);
}

function isIssueReference(value: unknown): value is IssueReference {
  if (!isPlainObject(value) || !isIssueLike(value)) {
    return false;
  }
  const reference = value as Record<string, unknown>;

  return (
    typeof reference.relation === "string" &&
    ISSUE_RELATIONS.has(reference.relation) &&
    typeof reference.status === "string" &&
    ISSUE_REFERENCE_STATUSES.has(reference.status as IssueReferenceStatus) &&
    isOptionalString(reference.note)
  );
}

function isLedgerProvenanceArray(value: unknown): value is LedgerProvenance[] {
  return Array.isArray(value) && value.every(isLedgerProvenance);
}

function isLedgerProvenance(value: unknown): value is LedgerProvenance {
  return (
    isPlainObject(value) &&
    isIssueLike(value.issue) &&
    isNonNegativeInteger(value.messageIndex) &&
    isOptionalString(value.commentId) &&
    isNonEmptyString(value.capturedAt) &&
    isOptionalString(value.note)
  );
}

function isTaskAcceptanceRecord(value: unknown): value is TaskAcceptanceRecord {
  return (
    isPlainObject(value) &&
    isNonEmptyString(value.factKey) &&
    isIssueLike(value.issue) &&
    isNonEmptyString(value.role) &&
    typeof value.status === "string" &&
    ACCEPTANCE_FACT_STATUSES.has(value.status as AcceptanceFactStatus) &&
    Array.isArray(value.statementResults) &&
    value.statementResults.every(isAcceptanceStatementResult) &&
    isNonNegativeInteger(value.messageIndex) &&
    isOptionalString(value.commentId) &&
    isNonEmptyString(value.capturedAt) &&
    isOptionalString(value.note)
  );
}

function isAcceptanceStatementResult(value: unknown): value is AcceptanceStatementResult {
  return (
    isPlainObject(value) &&
    isNonEmptyString(value.id) &&
    typeof value.status === "string" &&
    ACCEPTANCE_FACT_STATUSES.has(value.status as AcceptanceFactStatus) &&
    isOptionalString(value.statement)
  );
}

function isIntegrationAcceptanceRecord(value: unknown): value is IntegrationAcceptanceRecord {
  return (
    isPlainObject(value) &&
    isNonEmptyString(value.joinKey) &&
    isNonEmptyString(value.phaseId) &&
    isIssueLike(value.parentIssue) &&
    isNonEmptyString(value.reviewerRole) &&
    typeof value.status === "string" &&
    INTEGRATION_ACCEPTANCE_STATUSES.has(value.status as IntegrationAcceptanceStatus) &&
    isNonEmptyString(value.childPassDigest) &&
    isNonEmptyString(value.targetAcceptanceDigest) &&
    isOptionalStringArray(value.failedStatementIds) &&
    isOptionalStringArray(value.repairTaskIds) &&
    isNonEmptyString(value.capturedAt) &&
    isOptionalString(value.note)
  );
}

function isRunManifestReference(value: unknown): value is RunManifestReference {
  if (!isPlainObject(value) || !isIssueLike(value.issue) || !isNonEmptyString(value.role) || !isNonEmptyString(value.completedAt)) {
    return false;
  }
  if (!(typeof value.stage === "string" && RUN_MANIFEST_STAGES.has(value.stage as RunManifestStage))) {
    return false;
  }
  if (value.resolution === "unresolved") {
    return value.locator === undefined;
  }
  if (!(value.resolution === "linked" || value.resolution === "missing")) {
    return false;
  }
  return isRunManifestLocator(value.locator);
}

function isRunManifestLocator(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  if (value.kind === "jsonl-line") {
    return value.path === ".state/run-manifests.jsonl" && isPositiveInteger(value.line);
  }
  return value.kind === "run-dir" && isNonEmptyString(value.runDir);
}

function isPhaseOwner(value: unknown): value is PhaseOwner {
  return (
    isPlainObject(value) &&
    (value.kind === "goal" || value.kind === "milestone" || value.kind === "task") &&
    isNonEmptyString(value.id)
  );
}

function isIssueLike(value: unknown): value is { owner: string; repo: string; number: number } {
  return (
    isPlainObject(value) &&
    isNonEmptyString(value.owner) &&
    isNonEmptyString(value.repo) &&
    isPositiveInteger(value.number)
  );
}

function isReadinessStatus(value: unknown): value is LedgerReadinessStatus {
  return typeof value === "string" && READINESS_STATUSES.has(value as LedgerReadinessStatus);
}

function isQualityBaseline(value: unknown): value is QualityBaseline {
  return typeof value === "string" && QUALITY_BASELINES.has(value as QualityBaseline);
}

function isOptionalQualityBaseline(value: unknown): value is QualityBaseline | undefined {
  return value === undefined || isQualityBaseline(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || isStringArray(value);
}

function isOptionalNonEmptyStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(isNonEmptyString));
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
