import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAgentContextState,
  loadAgentContextStateStore,
  saveAgentContextStateStore,
  withAgentContextState,
} from "../src/agent-context-state.js";

describe("agent context state store", () => {
  it("returns an empty store when the state file does not exist", async () => {
    const filePath = path.join(await makeTempDir(), "missing", "agent-contexts.json");

    await expect(loadAgentContextStateStore(filePath)).resolves.toEqual({});
  });

  it("saves and loads agent context state", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "agent-contexts.json");
    const store = withAgentContextState({}, "tranfu-labs/agent-moebius#4", "dev", {
      preScript: "src/agent-prescripts/dev-workspace.ts",
      owner: "tranfu-labs",
      repo: "agent-moebius",
      issueNumber: 4,
      worktreePath: "/tmp/worktree",
      preparedFromMessageIndex: 3,
    });

    await saveAgentContextStateStore(store, filePath);

    await expect(loadAgentContextStateStore(filePath)).resolves.toEqual(store);
    expect(getAgentContextState(store, "tranfu-labs/agent-moebius#4", "dev")).toEqual({
      preScript: "src/agent-prescripts/dev-workspace.ts",
      owner: "tranfu-labs",
      repo: "agent-moebius",
      issueNumber: 4,
      worktreePath: "/tmp/worktree",
      preparedFromMessageIndex: 3,
    });
    expect(getAgentContextState(store, "tranfu-labs/agent-moebius#4", "product-manager")).toBeNull();
  });

  it("fails safely on invalid state shape", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "agent-contexts.json");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ issue: { dev: { worktreePath: "" } } }), "utf8");

    await expect(loadAgentContextStateStore(filePath)).rejects.toThrow(/Invalid agent context state file/);
  });
});

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-agent-context-test-"));
}
