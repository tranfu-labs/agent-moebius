export type RunnerProcessExitReason = "exit" | "error";

export interface RunnerProcess {
  pid?: number;
  onExit(listener: (event: { reason: RunnerProcessExitReason; exitCode: number | null; signal: string | null; error?: string }) => void): void;
  terminate(signal: NodeJS.Signals): void;
  kill(): void;
}

export interface RunnerSupervisorState {
  status: "stopped" | "starting" | "running" | "crashed";
  crashCount: number;
  maxCrashCount: number;
  pid?: number;
  reason?: string;
  nextRestartDelayMs?: number;
  logPath?: string;
}

export interface RunnerSupervisorOptions {
  spawn: () => RunnerProcess;
  onStateChange?: (state: RunnerSupervisorState) => void;
  maxCrashCount?: number;
  restartDelayMs?: (crashCount: number) => number;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  stopTimeoutMs?: number;
  logPath?: string;
}

export class RunnerSupervisor {
  private readonly spawnRunner: () => RunnerProcess;
  private readonly onStateChange?: (state: RunnerSupervisorState) => void;
  private readonly maxCrashCount: number;
  private readonly restartDelayMs: (crashCount: number) => number;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly stopTimeoutMs: number;
  private readonly logPath?: string;
  private process: RunnerProcess | null = null;
  private restartTimer: unknown;
  private stopTimer: unknown;
  private stopping = false;
  private stateValue: RunnerSupervisorState;

  constructor(options: RunnerSupervisorOptions) {
    this.spawnRunner = options.spawn;
    this.onStateChange = options.onStateChange;
    this.maxCrashCount = options.maxCrashCount ?? 3;
    this.restartDelayMs = options.restartDelayMs ?? ((crashCount) => Math.min(30_000, 1_000 * 2 ** Math.max(0, crashCount - 1)));
    this.setTimer = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
    this.stopTimeoutMs = options.stopTimeoutMs ?? 5_000;
    this.logPath = options.logPath;
    this.stateValue = { status: "stopped", crashCount: 0, maxCrashCount: this.maxCrashCount, logPath: this.logPath };
  }

  state(): RunnerSupervisorState {
    return { ...this.stateValue };
  }

  start(): void {
    if (this.process !== null || this.stateValue.status === "starting" || this.stateValue.status === "running") {
      return;
    }

    this.stopping = false;
    this.setState({ ...this.stateValue, status: "starting", reason: undefined, nextRestartDelayMs: undefined });
    const child = this.spawnRunner();
    this.process = child;
    child.onExit((event) => {
      this.handleExit(event);
    });
    this.setState({ ...this.stateValue, status: "running", pid: child.pid });
  }

  stop(): void {
    this.stopping = true;
    if (this.restartTimer !== undefined) {
      this.clearTimer(this.restartTimer);
      this.restartTimer = undefined;
    }

    if (this.process === null) {
      this.setState({ ...this.stateValue, status: "stopped", pid: undefined, reason: "manual-stop" });
      return;
    }

    this.process.terminate("SIGTERM");
    this.stopTimer = this.setTimer(() => {
      this.process?.kill();
    }, this.stopTimeoutMs);
  }

  private handleExit(event: {
    reason: RunnerProcessExitReason;
    exitCode: number | null;
    signal: string | null;
    error?: string;
  }): void {
    this.process = null;
    if (this.stopTimer !== undefined) {
      this.clearTimer(this.stopTimer);
      this.stopTimer = undefined;
    }

    if (this.stopping) {
      this.setState({ status: "stopped", crashCount: this.stateValue.crashCount, maxCrashCount: this.maxCrashCount, reason: "manual-stop", logPath: this.logPath });
      return;
    }

    const crashCount = this.stateValue.crashCount + 1;
    const reason = formatExitReason(event);
    if (crashCount >= this.maxCrashCount) {
      this.setState({ status: "crashed", crashCount, maxCrashCount: this.maxCrashCount, reason, logPath: this.logPath });
      return;
    }

    const delayMs = this.restartDelayMs(crashCount);
    this.setState({
      status: "crashed",
      crashCount,
      maxCrashCount: this.maxCrashCount,
      reason,
      nextRestartDelayMs: delayMs,
      logPath: this.logPath,
    });
    this.restartTimer = this.setTimer(() => {
      this.restartTimer = undefined;
      this.start();
    }, delayMs);
  }

  private setState(state: RunnerSupervisorState): void {
    this.stateValue = state;
    this.onStateChange?.(this.state());
  }
}

function formatExitReason(event: {
  reason: RunnerProcessExitReason;
  exitCode: number | null;
  signal: string | null;
  error?: string;
}): string {
  if (event.reason === "error") {
    return event.error ?? "process error";
  }
  if (event.signal !== null) {
    return `signal ${event.signal}`;
  }
  return `exit code ${event.exitCode ?? "unknown"}`;
}
