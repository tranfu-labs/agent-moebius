import type { DesktopDoctorResult } from "./env-doctor.js";
import type { RunnerSupervisorState } from "./runner-supervisor.js";
import type { ShellPathResult } from "./shell-path.js";
import type { UpdateDecision } from "./updater.js";

export interface DesktopStatusSnapshot {
  appVersion: string;
  dataRoot: string;
  observer: {
    status: "starting" | "running" | "error" | "stopped";
    url?: string;
    error?: string;
  };
  localConsole: {
    status: "starting" | "running" | "error" | "stopped";
    url?: string;
    sqlitePath?: string;
    error?: string;
  };
  runner: RunnerSupervisorState;
  doctor: DesktopDoctorResult | null;
  shellPath: ShellPathResult | null;
  seed: {
    status: "pending" | "ok" | "error";
    copied: number;
    skipped: number;
    error?: string;
  };
  update: UpdateDecision | null;
}
