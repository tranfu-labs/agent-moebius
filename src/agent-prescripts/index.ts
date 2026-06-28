import type { AgentPreScript, AgentPreScriptInput, AgentPreScriptResult } from "./types.js";
import { DEV_WORKSPACE_PRE_SCRIPT_PATH, runDevWorkspacePreScript } from "./dev-workspace.js";

const PRE_SCRIPTS: Record<string, AgentPreScript> = {
  [DEV_WORKSPACE_PRE_SCRIPT_PATH]: runDevWorkspacePreScript,
};

export async function runAgentPreScript(input: AgentPreScriptInput): Promise<AgentPreScriptResult> {
  const preScript = PRE_SCRIPTS[input.preScript];
  if (preScript === undefined) {
    return {
      ok: false,
      reason: `unknown-prescript:${input.preScript}`,
    };
  }

  return preScript(input);
}
