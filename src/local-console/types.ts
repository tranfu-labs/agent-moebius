export const LOCAL_CONSOLE_DEFAULT_SESSION_ID = "default";
export const LOCAL_CONSOLE_PROJECT_ID = "local";
export const LOCAL_CONSOLE_PROJECT_SOURCE_TYPE = "local-folder";

export type LocalConsoleSpeaker = "user" | "agent" | "system";
export type LocalConsoleMessageStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "interrupted"
  | "stuck"
  | "displayed";

export interface LocalConsoleMessage {
  id: number;
  sessionId: string;
  speaker: LocalConsoleSpeaker;
  role: string | null;
  body: string;
  status: LocalConsoleMessageStatus;
  runId: string | null;
  runDir: string | null;
  error: string | null;
  failureCount: number;
  lastFailureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LocalRouteDecisionOutcome = "append" | "no_action" | "fail_open" | "dead_letter";

export interface LocalRouteDecisionRecord {
  sessionId: string;
  messageId: number;
  routeKey: string;
  outcome: LocalRouteDecisionOutcome;
  targetRole: string | null;
  reason: string;
  createdAt: string;
}

export type LocalConsoleSessionStatus = "idle" | "running" | "waiting" | "stuck" | "failed" | "interrupted";
export const LOCAL_CONSOLE_AWAITS_HUMAN_REASONS = [
  "answer",
  "confirmation",
  "acceptance",
  "exception",
] as const;
export type LocalConsoleAwaitsHumanReason = (typeof LOCAL_CONSOLE_AWAITS_HUMAN_REASONS)[number];
export type LocalConsoleProjectSourceType = typeof LOCAL_CONSOLE_PROJECT_SOURCE_TYPE;
export type LocalConsoleWorkspaceMode = "direct" | "worktree";

export interface LocalConsoleSessionWorkspaceSource {
  projectId: string;
  title: string;
  folderPath: string;
  worktreeMode: boolean;
}

export interface LocalConsoleSessionSummary {
  sessionId: string;
  projectId: string;
  parentSessionId?: string | null;
  title: string;
  status: LocalConsoleSessionStatus;
  awaitsHumanReason: LocalConsoleAwaitsHumanReason | null;
  unreadSince: string | null;
  runningCount: number;
  waitingCount: number;
  stuckCount: number;
  errorCount: number;
  interruptedCount: number;
  childCount?: number;
  createdAt: string;
  updatedAt: string;
}

export const LOCAL_SESSION_PROJECT_ERROR_CODES = [
  "LOCAL_SESSION_NOT_FOUND",
  "LOCAL_PROJECT_NOT_FOUND",
  "SESSION_PROJECT_LOCKED",
] as const;

export type LocalConsoleSessionProjectErrorCode = (typeof LOCAL_SESSION_PROJECT_ERROR_CODES)[number];

export class LocalConsoleSessionProjectError extends Error {
  constructor(readonly code: LocalConsoleSessionProjectErrorCode) {
    super(localSessionProjectErrorMessage(code));
    this.name = "LocalConsoleSessionProjectError";
  }
}

export type MoveEmptySessionResult =
  | { ok: true; session: LocalConsoleSessionSummary }
  | { ok: false; code: LocalConsoleSessionProjectErrorCode };

export interface LocalConsoleProjectSummary {
  projectId: string;
  sourceType: LocalConsoleProjectSourceType;
  title: string;
  folderPath: string;
  worktreeMode: boolean;
  workspaceCwd: string | null;
  workspaceMode: LocalConsoleWorkspaceMode | null;
  worktreePath: string | null;
  worktreeUnavailableReason: string | null;
  workspaceUpdatedAt: string | null;
  directoryAvailable?: boolean;
  directoryUnavailableReason?: string | null;
  newConversationDisabledReason?: string | null;
  sessions: LocalConsoleSessionSummary[];
  runningCount: number;
  waitingCount: number;
  stuckCount: number;
  errorCount: number;
}

export const LOCAL_PROJECT_FOLDER_ERROR_CODES = [
  "PROJECT_DIRECTORY_UNAVAILABLE",
  "PROJECT_FOLDER_ALREADY_BOUND",
  "LOCAL_PROJECT_NOT_FOUND",
] as const;

export type LocalConsoleProjectFolderErrorCode = (typeof LOCAL_PROJECT_FOLDER_ERROR_CODES)[number];

export class LocalConsoleProjectFolderError extends Error {
  constructor(
    readonly code: LocalConsoleProjectFolderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LocalConsoleProjectFolderError";
  }
}

export interface LocalConsoleProjectRemovalResult {
  projectId: string;
  archivedSessionIds: string[];
}

export interface LocalConsoleSessionArchiveResult {
  sessionId: string;
  projectId: string;
  selectedSessionId: string | null;
}

export class LocalConsoleProjectRunningError extends Error {
  readonly code = "PROJECT_HAS_RUNNING_AGENTS";

  constructor() {
    super("Project has running agents");
    this.name = "LocalConsoleProjectRunningError";
  }
}

export class LocalConsoleSessionRunningError extends Error {
  readonly code = "SESSION_HAS_RUNNING_AGENT";

  constructor() {
    super("Running sessions cannot be archived");
    this.name = "LocalConsoleSessionRunningError";
  }
}

export interface LocalConsoleRunSnapshot {
  sessionId: string;
  runId: string;
  role: string | null;
  status: "running";
  startedAt: string;
  elapsedMs: number;
  runDir: string | null;
  cwd: string | null;
  workspaceMode: LocalConsoleWorkspaceMode | null;
  worktreeUnavailableReason: string | null;
  branchName?: string | null;
  baseRef?: string | null;
  stdoutTail: string | null;
  stderrTail: string | null;
  lastOutputSummary: string;
  tailDiagnostic: string | null;
  interruptible: boolean;
}

export interface LocalConsoleSnapshot {
  sessionId: string;
  status: "idle" | "running" | "failed" | "stuck";
  messages: LocalConsoleMessage[];
  sqlitePath: string;
  lastError: string | null;
  activeRun: LocalConsoleRunSnapshot | null;
}

export interface LocalConsoleStateSnapshot {
  projects: LocalConsoleProjectSummary[];
  project: LocalConsoleProjectSummary;
  selectedProjectId: string;
  selectedSessionId: string;
  selectedSession: LocalConsoleSessionSummary | null;
  messages: LocalConsoleMessage[];
  activeRun: LocalConsoleRunSnapshot | null;
  sqlitePath: string;
  lastError: string | null;
}

export interface LocalConsoleStore {
  readonly sqlitePath: string;
  init(): Promise<void>;
  close(): Promise<void>;
  createProject(input: { folderPath: string; worktreeMode: boolean; now: string }): Promise<LocalConsoleProjectSummary>;
  updateProject(input: { projectId: string; worktreeMode: boolean; now: string }): Promise<LocalConsoleProjectSummary>;
  renameProject?(input: { projectId: string; title: string; now: string }): Promise<LocalConsoleProjectSummary>;
  repairProjectFolder?(input: { projectId: string; folderPath: string; now: string }): Promise<LocalConsoleProjectSummary>;
  removeProject?(input: { projectId: string; force: boolean; now: string }): Promise<LocalConsoleProjectRemovalResult>;
  reorderProjects(projectIds: string[]): Promise<LocalConsoleProjectSummary[]>;
  listProjects(): Promise<LocalConsoleProjectSummary[]>;
  getSessionWorkspace(sessionId: string): Promise<LocalConsoleSessionWorkspaceSource>;
  recordProjectWorkspaceStatus(input: {
    projectId: string;
    cwd: string;
    mode: LocalConsoleWorkspaceMode;
    worktreePath: string | null;
    worktreeUnavailableReason: string | null;
    now: string;
  }): Promise<void>;
  createSession(input: { sessionId: string; projectId?: string; title: string; now: string }): Promise<LocalConsoleSessionSummary>;
  moveEmptySessionToProject(input: {
    sessionId: string;
    projectId: string;
    now: string;
  }): Promise<LocalConsoleSessionSummary>;
  archiveSession?(input: { sessionId: string; now: string }): Promise<LocalConsoleSessionArchiveResult>;
  restoreSession?(input: { sessionId: string; now: string }): Promise<LocalConsoleSessionSummary>;
  listSessions(): Promise<LocalConsoleSessionSummary[]>;
  markSessionResultRead(input: { sessionId: string; unreadSince: string; now: string }): Promise<boolean>;
  appendUserMessage(input: { sessionId: string; body: string; now: string }): Promise<LocalConsoleMessage>;
  listMessages(sessionId: string): Promise<LocalConsoleMessage[]>;
  hasRunningMessage(sessionId: string): Promise<boolean>;
  claimNextPendingMessage(input: {
    sessionId: string;
    runId: string;
    now: string;
  }): Promise<LocalConsoleMessage | null>;
  setRunDir(input: { id: number; runDir: string; now: string }): Promise<void>;
  recordAgentResponse(input: {
    userMessageId: number;
    sessionId: string;
    role: string;
    body: string;
    runId: string;
    runDir: string;
    now: string;
  }): Promise<void>;
  recordSystemAndComplete(input: {
    userMessageId: number;
    sessionId: string;
    body: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void>;
  recordSystemMessage(input: {
    sessionId: string;
    body: string;
    runId: string | null;
    runDir: string | null;
    error: string | null;
    status?: "displayed" | "failed" | "stuck";
    now: string;
  }): Promise<void>;
  recordMessageProcessed(input: {
    userMessageId: number;
    sessionId: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void>;
  findRouteDecision(input: {
    sessionId: string;
    routeKey: string;
  }): Promise<LocalRouteDecisionRecord | null>;
  recordRouteAppend(input: {
    userMessageId: number;
    sessionId: string;
    routeKey: string;
    body: string;
    targetRole: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void>;
  recordRouteNoAction(input: {
    userMessageId: number;
    sessionId: string;
    routeKey: string;
    outcome: Exclude<LocalRouteDecisionOutcome, "append">;
    reason: string;
    runId: string;
    runDir: string | null;
    now: string;
  }): Promise<void>;
  releaseMessageForRetry(input: {
    userMessageId: number;
    sessionId: string;
    now: string;
  }): Promise<void>;
  recordFailure(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void>;
  recordRetryableFailure(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<LocalConsoleMessage>;
  recordDeadLetter(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
    runId: string | null;
    runDir: string | null;
    failureCount: number;
    now: string;
  }): Promise<void>;
  recordInterrupted(input: {
    userMessageId: number;
    sessionId: string;
    reason: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void>;
  recordStuck(input: {
    userMessageId: number;
    sessionId: string;
    reason: string;
    runId: string | null;
    runDir: string | null;
    now: string;
  }): Promise<void>;
  markStaleRunning(input: {
    sessionId: string;
    cutoffIso: string;
    now: string;
    reason: string;
  }): Promise<number>;
}

function localSessionProjectErrorMessage(code: LocalConsoleSessionProjectErrorCode): string {
  switch (code) {
    case "LOCAL_SESSION_NOT_FOUND":
      return "Local session not found";
    case "LOCAL_PROJECT_NOT_FOUND":
      return "Local project not found";
    case "SESSION_PROJECT_LOCKED":
      return "Session project is locked after activity or orchestration";
  }
}

export class LocalConsoleStoreTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly timeoutMs: number,
  ) {
    super(`${label}-timeout:${timeoutMs}ms`);
    this.name = "LocalConsoleStoreTimeoutError";
  }
}

export class LocalConsoleBusyError extends Error {
  constructor(message = "local console session is running") {
    super(message);
    this.name = "LocalConsoleBusyError";
  }
}
