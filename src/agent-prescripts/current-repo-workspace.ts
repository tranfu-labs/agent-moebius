import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentPreScriptInput, AgentPreScriptResult } from "./types.js";

export const CURRENT_REPO_WORKSPACE_PRE_SCRIPT_PATH = "src/agent-prescripts/current-repo-workspace.ts";

export async function runCurrentRepoWorkspacePreScript(
  _input: AgentPreScriptInput,
): Promise<AgentPreScriptResult> {
  return { ok: true, codexCwd: resolveCurrentRepoRoot() };
}

export function resolveCurrentRepoRoot(moduleUrl = import.meta.url): string {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "../..");
}
