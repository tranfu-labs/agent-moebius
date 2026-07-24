import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CURRENT_REPO_WORKSPACE_PRE_SCRIPT_PATH,
  resolveCurrentRepoRoot,
  runCurrentRepoWorkspacePreScript,
} from "../src/agent-prescripts/current-repo-workspace.js";
import type { AgentPreScriptInput } from "../src/agent-prescripts/types.js";

describe("current repo workspace pre script", () => {
  it("returns the moebius repository root as Codex cwd", async () => {
    const expectedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

    await expect(runCurrentRepoWorkspacePreScript(makeInput())).resolves.toEqual({
      ok: true,
      codexCwd: expectedRoot,
    });
  });

  it("resolves the repository root from the source file location", () => {
    const moduleUrl = new URL("../src/agent-prescripts/current-repo-workspace.ts", import.meta.url).href;

    expect(resolveCurrentRepoRoot(moduleUrl)).toBe(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  });
});

function makeInput(): AgentPreScriptInput {
  return {
    role: "secretary",
    preScript: CURRENT_REPO_WORKSPACE_PRE_SCRIPT_PATH,
    latestIndex: 3,
    issueSource: {
      owner: "tranfu-labs",
      repo: "moebius",
      issueNumber: 4,
      issueKey: "tranfu-labs/moebius#4",
      cloneUrl: "https://github.com/tranfu-labs/moebius.git",
    },
    workdirRoot: "/tmp/unused",
    contextStatePath: "/tmp/unused/.state/agent-contexts.json",
  };
}
