import fs from "node:fs/promises";
import path from "node:path";
import { parseLocalConfig } from "../local-config.js";
import type { RepositoryRef } from "../issue-source.js";

export type ObserverSourceStatus = "ok" | "missing" | "error" | "partial";

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
}

export interface ObserverIntakeState {
  issues: Record<string, ObserverIntakeIssueState>;
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
  role: string;
  stage: ObserverRunManifestStage;
  artifacts: Array<{
    path: string;
    publishedUrl: string | null;
  }>;
  startedAt: string;
  completedAt: string;
}

export interface ObserverStateSnapshot {
  projectRoot: string;
  watchRepositories: RepositoryRef[];
  configUsable: boolean;
  intakeState: ObserverIntakeState;
  roleThreads: ObserverRoleThreadStore;
  agentContexts: ObserverAgentContextStore;
  runManifests: ObserverRunManifestRecord[];
  diagnostics: ObserverDiagnostic[];
}

interface ReadObserverStateInput {
  projectRoot?: string;
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
const RUN_MANIFEST_STAGES = new Set<ObserverRunManifestStage>([
  "plan-written",
  "code-verified",
  "in-progress",
  "unknown",
]);

export async function readObserverState(input: ReadObserverStateInput = {}): Promise<ObserverStateSnapshot> {
  const projectRoot = path.resolve(input.projectRoot ?? process.cwd());
  const config = await readObserverConfig(projectRoot);
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
  const runManifests = await readRunManifestJsonl(path.join(projectRoot, ".state", "run-manifests.jsonl"));

  return {
    projectRoot,
    watchRepositories: config.repositories,
    configUsable: config.configUsable,
    intakeState: intake.data,
    roleThreads: roleThreads.data,
    agentContexts: agentContexts.data,
    runManifests: runManifests.data,
    diagnostics: [
      ...config.diagnostics,
      ...intake.diagnostics,
      ...roleThreads.diagnostics,
      ...agentContexts.diagnostics,
      ...runManifests.diagnostics,
    ],
  };
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

async function readRunManifestJsonl(
  filePath: string,
): Promise<{ data: ObserverRunManifestRecord[]; diagnostics: ObserverDiagnostic[] }> {
  const source = ".state/run-manifests.jsonl";
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
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
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim().length === 0) {
      return;
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
      return;
    }

    const manifest = validateRunManifestRecord(parsed);
    if (!manifest.ok) {
      diagnostics.push({
        source,
        status: "partial",
        line: lineNumber,
        message: `第 ${lineNumber} 行跳过：${manifest.reason}`,
      });
      return;
    }

    records.push(manifest.record);
  });

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

  return {
    ok: true,
    record: {
      issue: { owner: issue.owner, repo: issue.repo, number: issue.number },
      role: value.role,
      stage: value.stage as ObserverRunManifestStage,
      artifacts,
      startedAt: value.startedAt,
      completedAt: value.completedAt,
    },
  };
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
      (typeof value.lastFailureReason === "string" && value.lastFailureReason.length > 0))
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
