import { describe, expect, it } from "vitest";
import { RunnerSupervisor, type RunnerProcess } from "../src/runner-supervisor.js";

describe("runner supervisor", () => {
  it("restarts abnormal exits and stops after the crash limit", () => {
    const timers: Array<() => void> = [];
    const states: string[] = [];
    const processes: FakeRunnerProcess[] = [];
    const supervisor = new RunnerSupervisor({
      spawn: () => {
        const process = new FakeRunnerProcess(100 + processes.length);
        processes.push(process);
        return process;
      },
      restartDelayMs: () => 10,
      setTimeout: (callback) => {
        timers.push(callback);
        return callback;
      },
      clearTimeout: () => undefined,
      maxCrashCount: 3,
      onStateChange: (state) => {
        states.push(`${state.status}:${state.crashCount}`);
      },
    });

    supervisor.start();
    processes[0]?.exit(1);
    expect(supervisor.state()).toMatchObject({ status: "crashed", crashCount: 1, nextRestartDelayMs: 10 });
    timers.shift()?.();
    expect(processes).toHaveLength(2);
    processes[1]?.exit(1);
    timers.shift()?.();
    processes[2]?.exit(1);

    expect(supervisor.state()).toMatchObject({ status: "crashed", crashCount: 3 });
    expect(supervisor.state()).not.toHaveProperty("nextRestartDelayMs");
    expect(processes).toHaveLength(3);
    expect(states).toContain("running:0");
    expect(states).toContain("crashed:3");
  });

  it("does not restart after manual stop", () => {
    const timers: Array<() => void> = [];
    const processes: FakeRunnerProcess[] = [];
    const supervisor = new RunnerSupervisor({
      spawn: () => {
        const process = new FakeRunnerProcess(200);
        processes.push(process);
        return process;
      },
      setTimeout: (callback) => {
        timers.push(callback);
        return callback;
      },
      clearTimeout: () => undefined,
    });

    supervisor.start();
    supervisor.stop();
    expect(processes[0]?.terminatedWith).toBe("SIGTERM");
    processes[0]?.exit(0, "SIGTERM");

    expect(supervisor.state()).toMatchObject({ status: "stopped", reason: "manual-stop" });
    expect(timers).toHaveLength(1);
  });
});

class FakeRunnerProcess implements RunnerProcess {
  readonly pid: number;
  terminatedWith: NodeJS.Signals | undefined;
  private listener: Parameters<RunnerProcess["onExit"]>[0] | undefined;

  constructor(pid: number) {
    this.pid = pid;
  }

  onExit(listener: Parameters<RunnerProcess["onExit"]>[0]): void {
    this.listener = listener;
  }

  terminate(signal: NodeJS.Signals): void {
    this.terminatedWith = signal;
  }

  kill(): void {
    this.terminatedWith = "SIGKILL";
  }

  exit(exitCode: number | null, signal: string | null = null): void {
    this.listener?.({ reason: "exit", exitCode, signal });
  }
}
