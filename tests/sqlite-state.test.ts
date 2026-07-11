import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadAgentContextStateStore, saveAgentContextStateEntry } from "../src/agent-context-state.js";
import { githubRunnerSqlitePathForStateFile } from "../src/github-state-store.js";
import { loadGitHubResponseIntakeState, saveGitHubResponseIntakeState } from "../src/github-intake-state.js";
import { createEmptyGoalLedgerState } from "../src/goal-ledger.js";
import { loadGoalLedgerState, saveGoalLedgerState } from "../src/goal-ledger-state.js";
import { runSqliteStateCommand } from "../src/sqlite-state.js";
import { loadRoleThreadStateStore, saveRoleThreadStateEntry } from "../src/state.js";

const NOW = "2026-07-09T00:00:00.000Z";

describe("sqlite state persistence", () => {
  it("rolls back failed source imports and retries without a successful marker", async () => {
    const sqlitePath = path.join(await makeTempDir(), ".state", "local-console.sqlite");

    await expect(
      runSqliteStateCommand({
        sqlitePath,
        command: {
          kind: "import-role-threads",
          legacyDigest: "digest-bad",
          store: {
            "tranfu-labs/agent-moebius#101": {
              dev: { threadId: "thread-dev", lastSeenIndex: 7 },
              qa: { threadId: "thread-qa", lastSeenIndex: "bad" },
            },
          },
        },
      }),
    ).rejects.toThrow(/last_seen_index|lastSeenIndex/);

    await expect(
      runSqliteStateCommand({
        sqlitePath,
        command: { kind: "get-migration-status", source: "role-threads" },
      }),
    ).resolves.toEqual({ status: null });
    await expect(
      runSqliteStateCommand({
        sqlitePath,
        command: { kind: "load-role-threads" },
      }),
    ).resolves.toEqual({});

    const validStore = {
      "tranfu-labs/agent-moebius#101": {
        dev: { threadId: "thread-dev", lastSeenIndex: 7 },
        qa: { threadId: "thread-qa", lastSeenIndex: 8 },
      },
    };
    await runSqliteStateCommand({
      sqlitePath,
      command: { kind: "import-role-threads", legacyDigest: "digest-good", store: validStore },
    });

    await expect(
      runSqliteStateCommand({
        sqlitePath,
        command: { kind: "get-migration-status", source: "role-threads" },
      }),
    ).resolves.toEqual({ status: "imported" });
    await expect(
      runSqliteStateCommand({
        sqlitePath,
        command: { kind: "load-role-threads" },
      }),
    ).resolves.toEqual(validStore);
  });

  it("leaves legacy JSON untouched after migration while saving all state sources to SQLite", async () => {
    const root = await makeTempDir();
    const stateDir = path.join(root, ".state");
    await fs.mkdir(stateDir, { recursive: true });
    const roleThreadsPath = path.join(stateDir, "role-threads.json");
    const agentContextsPath = path.join(stateDir, "agent-contexts.json");
    const intakePath = path.join(stateDir, "github-response-intake.json");
    const ledgerPath = path.join(stateDir, "goal-ledger.json");

    await writeJson(roleThreadsPath, {
      "tranfu-labs/agent-moebius#101": {
        dev: { threadId: "thread-dev", lastSeenIndex: 7 },
      },
    });
    await writeJson(agentContextsPath, {
      "tranfu-labs/agent-moebius#101": {
        "__issue-worktree": {
          preScript: "workspaceAccess:issue-worktree",
          owner: "tranfu-labs",
          repo: "agent-moebius",
          issueNumber: 101,
          worktreePath: "/tmp/worktree-101",
          preparedFromMessageIndex: 3,
          workspaceAccess: "write",
          mainStatus: "fresh",
          lastCheckedAt: NOW,
        },
      },
    });
    await writeJson(intakePath, {
      repositories: {
        "tranfu-labs/agent-moebius": { lastIdleScanAt: NOW },
      },
      issues: {
        "tranfu-labs/agent-moebius#101": {
          owner: "tranfu-labs",
          repo: "agent-moebius",
          issueNumber: 101,
          updatedAt: NOW,
          mode: "active",
          activeNoChangeCount: 0,
          nextPollAt: null,
        },
      },
    });
    await writeJson(ledgerPath, createEmptyGoalLedgerState());

    const before = await captureLegacyFiles([roleThreadsPath, agentContextsPath, intakePath, ledgerPath]);

    await loadRoleThreadStateStore(roleThreadsPath);
    await loadAgentContextStateStore(agentContextsPath);
    const intake = await loadGitHubResponseIntakeState(intakePath);
    await loadGoalLedgerState(ledgerPath);

    await saveRoleThreadStateEntry(
      "tranfu-labs/agent-moebius#101",
      "qa",
      { threadId: "thread-qa", lastSeenIndex: 8 },
      roleThreadsPath,
    );
    await saveAgentContextStateEntry(
      "tranfu-labs/agent-moebius#102",
      "__issue-worktree",
      {
        preScript: "workspaceAccess:issue-worktree",
        owner: "tranfu-labs",
        repo: "agent-moebius",
        issueNumber: 102,
        worktreePath: "/tmp/worktree-102",
        preparedFromMessageIndex: 4,
      },
      agentContextsPath,
    );
    await saveGitHubResponseIntakeState(
      {
        repositories: intake.repositories,
        issues: {
          ...intake.issues,
          "tranfu-labs/agent-moebius#102": {
            owner: "tranfu-labs",
            repo: "agent-moebius",
            issueNumber: 102,
            updatedAt: NOW,
            mode: "idle",
            activeNoChangeCount: 0,
            nextPollAt: null,
          },
        },
      },
      intakePath,
    );
    await saveGoalLedgerState(createEmptyGoalLedgerState(), ledgerPath);

    expect(await captureLegacyFiles([roleThreadsPath, agentContextsPath, intakePath, ledgerPath])).toEqual(before);
    await expect(loadRoleThreadStateStore(roleThreadsPath)).resolves.toMatchObject({
      "tranfu-labs/agent-moebius#101": {
        dev: { threadId: "thread-dev", lastSeenIndex: 7 },
        qa: { threadId: "thread-qa", lastSeenIndex: 8 },
      },
    });
    await expect(loadAgentContextStateStore(agentContextsPath)).resolves.toMatchObject({
      "tranfu-labs/agent-moebius#102": {
        "__issue-worktree": {
          owner: "tranfu-labs",
          repo: "agent-moebius",
          issueNumber: 102,
        },
      },
    });
    await expect(loadGitHubResponseIntakeState(intakePath)).resolves.toMatchObject({
      issues: {
        "tranfu-labs/agent-moebius#102": {
          owner: "tranfu-labs",
          repo: "agent-moebius",
          issueNumber: 102,
        },
      },
    });
    expect((await fs.stat(githubRunnerSqlitePathForStateFile(roleThreadsPath))).isFile()).toBe(true);
  }, 15_000);
});

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-sqlite-state-test-"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function captureLegacyFiles(filePaths: string[]): Promise<Record<string, { content: string; mtimeMs: number }>> {
  const result: Record<string, { content: string; mtimeMs: number }> = {};
  for (const filePath of filePaths) {
    const stat = await fs.stat(filePath);
    result[path.basename(filePath)] = {
      content: await fs.readFile(filePath, "utf8"),
      mtimeMs: stat.mtimeMs,
    };
  }
  return result;
}
