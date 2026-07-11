import { GITHUB_MODE_FLAG, type RuntimeMode } from "../../src/runtime-mode.js";

export const DESKTOP_RUNNER_MODE: RuntimeMode = "github";
export const DESKTOP_RUNNER_ARGS = [GITHUB_MODE_FLAG] as const;
