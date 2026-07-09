export const LOCAL_CONSOLE_DEFAULT_SESSION_ID = "default";

export type LocalConsoleSpeaker = "user" | "agent" | "system";
export type LocalConsoleMessageStatus = "pending" | "running" | "completed" | "failed" | "displayed";

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

export interface LocalConsoleSnapshot {
  sessionId: string;
  status: "idle" | "running" | "failed";
  messages: LocalConsoleMessage[];
  sqlitePath: string;
  lastError: string | null;
}

export interface LocalConsoleStore {
  readonly sqlitePath: string;
  init(): Promise<void>;
  close(): Promise<void>;
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
  recordFailure(input: {
    userMessageId: number;
    sessionId: string;
    error: string;
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
