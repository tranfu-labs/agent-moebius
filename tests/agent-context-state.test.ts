import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAgentContextState,
  loadAgentContextStateStore,
  saveAgentContextStateEntry,
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

  it("loads issue workspace context fields and rejects invalid optional values", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "agent-contexts.json");
    const validEntry = {
      preScript: "workspaceAccess:issue-worktree",
      owner: "tranfu-labs",
      repo: "agent-moebius",
      issueNumber: 4,
      worktreePath: "/tmp/worktree",
      preparedFromMessageIndex: 3,
      workspaceAccess: "read-run",
      migratedFromRole: "dev",
      mainStatus: "behind-main",
      lastCheckedAt: "2026-07-04T00:00:00.000Z",
    } as const;
    const validStore = withAgentContextState({}, "tranfu-labs/agent-moebius#4", "__issue-worktree", validEntry);

    await saveAgentContextStateStore(validStore, filePath);

    await expect(loadAgentContextStateStore(filePath)).resolves.toEqual(validStore);

    await fs.writeFile(
      filePath,
      JSON.stringify({
        "tranfu-labs/agent-moebius#4": {
          "__issue-worktree": {
            ...validEntry,
            workspaceAccess: "admin",
          },
        },
      }),
      "utf8",
    );
    await expect(loadAgentContextStateStore(filePath)).resolves.toEqual(validStore);

    const invalidLegacyPath = path.join(await makeTempDir(), ".state", "agent-contexts.json");
    await fs.mkdir(path.dirname(invalidLegacyPath), { recursive: true });
    await fs.writeFile(
      invalidLegacyPath,
      JSON.stringify({
        "tranfu-labs/agent-moebius#4": {
          "__issue-worktree": {
            ...validEntry,
            workspaceAccess: "admin",
          },
        },
      }),
      "utf8",
    );
    await expect(loadAgentContextStateStore(invalidLegacyPath)).rejects.toThrow(/Invalid agent context state file/);
  });

  it("merges concurrent entry saves without overwriting other issue contexts", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "agent-contexts.json");

    await Promise.all([
      saveAgentContextStateEntry(
        "tranfu-labs/agent-moebius#4",
        "dev",
        {
          preScript: "src/agent-prescripts/dev-workspace.ts",
          owner: "tranfu-labs",
          repo: "agent-moebius",
          issueNumber: 4,
          worktreePath: "/tmp/worktree-4",
          preparedFromMessageIndex: 3,
        },
        filePath,
      ),
      saveAgentContextStateEntry(
        "tranfu-labs/agent-moebius#5",
        "dev",
        {
          preScript: "src/agent-prescripts/dev-workspace.ts",
          owner: "tranfu-labs",
          repo: "agent-moebius",
          issueNumber: 5,
          worktreePath: "/tmp/worktree-5",
          preparedFromMessageIndex: 8,
        },
        filePath,
      ),
    ]);

    await expect(loadAgentContextStateStore(filePath)).resolves.toEqual({
      "tranfu-labs/agent-moebius#4": {
        dev: {
          preScript: "src/agent-prescripts/dev-workspace.ts",
          owner: "tranfu-labs",
          repo: "agent-moebius",
          issueNumber: 4,
          worktreePath: "/tmp/worktree-4",
          preparedFromMessageIndex: 3,
        },
      },
      "tranfu-labs/agent-moebius#5": {
        dev: {
          preScript: "src/agent-prescripts/dev-workspace.ts",
          owner: "tranfu-labs",
          repo: "agent-moebius",
          issueNumber: 5,
          worktreePath: "/tmp/worktree-5",
          preparedFromMessageIndex: 8,
        },
      },
    });
  });
});

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-agent-context-test-"));
}
