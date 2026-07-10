export const LOCAL_CONSOLE_DEFAULT_SESSION_ID = "default";
export const LOCAL_CONSOLE_PROJECT_ID = "local";

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
  createdAt: string;
  updatedAt: string;
}

export type LocalConsoleSessionStatus = "idle" | "running" | "waiting" | "stuck" | "failed" | "interrupted";

export interface LocalConsoleSessionSummary {
  sessionId: string;
  title: string;
  status: LocalConsoleSessionStatus;
  runningCount: number;
  waitingCount: number;
  stuckCount: number;
  errorCount: number;
  interruptedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalConsoleProjectSummary {
  projectId: string;
  title: string;
  sessions: LocalConsoleSessionSummary[];
  runningCount: number;
  waitingCount: number;
  stuckCount: number;
  errorCount: number;
}

export interface LocalConsoleRunSnapshot {
  sessionId: string;
  runId: string;
  role: string | null;
  status: "running";
  startedAt: string;
  elapsedMs: number;
  runDir: string | null;
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
  project: LocalConsoleProjectSummary;
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
  createSession(input: { sessionId: string; title: string; now: string }): Promise<LocalConsoleSessionSummary>;
  listSessions(): Promise<LocalConsoleSessionSummary[]>;
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
  recordMessageProcessed(input: {
    userMessageId: number;
    sessionId: string;
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
