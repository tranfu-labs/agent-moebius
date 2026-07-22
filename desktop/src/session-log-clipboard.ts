export const COPY_SESSION_LOG_PATH_IPC_CHANNEL = "session-log:copy-path";

export type CopySessionLogPathFailureReason =
  | "invalid-session"
  | "service-unavailable"
  | "record-unavailable"
  | "clipboard-unavailable";

export type CopySessionLogPathResult =
  | { ok: true }
  | { ok: false; reason: CopySessionLogPathFailureReason };

export interface SessionFactLogPathSource {
  getSessionFactLogPath(sessionId: string): string;
}

export interface SessionLogClipboardIpcMain {
  handle(
    channel: string,
    listener: (event: unknown, sessionId: unknown) => Promise<CopySessionLogPathResult>,
  ): void;
}

export interface SessionLogClipboardWriter {
  writeText(text: string): void;
}

export interface RegisterSessionLogClipboardIpcOptions {
  ipcMain: SessionLogClipboardIpcMain;
  getPathSource(): SessionFactLogPathSource | null;
  clipboard: SessionLogClipboardWriter;
  access(path: string): Promise<void>;
}

export function registerSessionLogClipboardIpc(options: RegisterSessionLogClipboardIpcOptions): void {
  options.ipcMain.handle(COPY_SESSION_LOG_PATH_IPC_CHANNEL, async (_event, sessionId) =>
    copySessionLogPath({
      sessionId,
      pathSource: options.getPathSource(),
      clipboard: options.clipboard,
      access: options.access,
    }));
}

export async function copySessionLogPath(input: {
  sessionId: unknown;
  pathSource: SessionFactLogPathSource | null;
  clipboard: SessionLogClipboardWriter;
  access(path: string): Promise<void>;
}): Promise<CopySessionLogPathResult> {
  if (typeof input.sessionId !== "string" || input.sessionId.trim() === "") {
    return { ok: false, reason: "invalid-session" };
  }
  if (input.pathSource === null) {
    return { ok: false, reason: "service-unavailable" };
  }

  let logPath: string;
  try {
    logPath = input.pathSource.getSessionFactLogPath(input.sessionId);
    await input.access(logPath);
  } catch {
    return { ok: false, reason: "record-unavailable" };
  }

  try {
    input.clipboard.writeText(logPath);
    return { ok: true };
  } catch {
    return { ok: false, reason: "clipboard-unavailable" };
  }
}
