import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ISSUE_WORKTREE_CONTEXT_PRE_SCRIPT,
  ISSUE_WORKTREE_CONTEXT_ROLE,
  buildIssueLocalBranchName,
  buildLegacyRoleWorktreePath,
  runIssueWorktreeCapability,
  safePathSegment,
} from "../src/agent-prescripts/issue-worktree.js";
import {
  loadAgentContextStateStore,
  saveAgentContextStateEntry,
  saveAgentContextStateStore,
  type AgentContextState,
} from "../src/agent-context-state.js";
import type { IssueWorktreeCapabilityInput } from "../src/agent-prescripts/issue-worktree.js";

const REMOTE_MAIN_REF = "refs/remotes/origin/main";
const FETCH_REMOTE_MAIN_REFSPEC = `+refs/heads/main:${REMOTE_MAIN_REF}`;
const LEGACY_DEV_WORKSPACE_PRE_SCRIPT_PATH = "src/agent-prescripts/dev-workspace.ts";

describe("issue worktree capability", () => {
  it("creates a role-free issue worktree on first run", async () => {
    const root = await makeTempDir();
    const commands: string[][] = [];
    const input = makeInput(root);

    const result = await runIssueWorktreeCapability(input, {
      ...makeFsDependencies(),
      runGit: async (args) => {
        commands.push(args);
        if (args[0] === "clone") {
          await fs.mkdir(args[3] as string, { recursive: true });
        }
        if (args[2] === "worktree" && args[3] === "add") {
          await fs.mkdir(worktreePathFromWorktreeAdd(args), { recursive: true });
        }
      },
    });

    const repoCachePath = expectedRepoCachePath(root);
    const worktreePath = expectedIssueWorktreePath(root);
    expect(result).toEqual({
      ok: true,
      codexCwd: worktreePath,
      promptContext: expect.stringContaining("workspaceAccess: write"),
    });
    expect(commands).toEqual([
      ["clone", "--bare", "https://github.com/tranfu-labs/agent-moebius.git", repoCachePath],
      ["--git-dir", repoCachePath, "fetch", "--prune", "origin", FETCH_REMOTE_MAIN_REFSPEC],
      [
        "--git-dir",
        repoCachePath,
        "worktree",
        "add",
        "-B",
        "agent/tranfu-labs__agent-moebius__4",
        worktreePath,
        REMOTE_MAIN_REF,
      ],
    ]);

    await expect(loadAgentContextStateStore(input.contextStatePath)).resolves.toMatchObject({
      "tranfu-labs/agent-moebius#4": {
        [ISSUE_WORKTREE_CONTEXT_ROLE]: {
          preScript: ISSUE_WORKTREE_CONTEXT_PRE_SCRIPT,
          owner: "tranfu-labs",
          repo: "agent-moebius",
          issueNumber: 4,
          worktreePath,
          preparedFromMessageIndex: 7,
          workspaceAccess: "write",
          mainStatus: "fresh",
        },
      },
    });
  });

  it("reuses an existing issue workspace without rebuilding when main has advanced", async () => {
    const root = await makeTempDir();
    const input = makeInput(root, { role: "qa", workspaceAccess: "read-run" });
    const worktreePath = expectedIssueWorktreePath(root);
    const repoCachePath = expectedRepoCachePath(root);
    const commands: string[][] = [];
    await fs.mkdir(worktreePath, { recursive: true });
    await fs.mkdir(repoCachePath, { recursive: true });
    await saveAgentContextStateEntry(
      input.issueSource.issueKey,
      ISSUE_WORKTREE_CONTEXT_ROLE,
      makeIssueWorkspaceState(worktreePath),
      input.contextStatePath,
    );

    const result = await runIssueWorktreeCapability(input, {
      ...makeFsDependencies(),
      runGit: async (args) => {
        commands.push(args);
      },
      isGitAncestor: async () => false,
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.codexCwd : "").toBe(worktreePath);
    expect(result.ok ? result.promptContext : "").toContain("mainStatus: behind-main");
    expect(commands).toEqual([
      ["--git-dir", repoCachePath, "fetch", "--prune", "origin", FETCH_REMOTE_MAIN_REFSPEC],
    ]);
    await expect(loadAgentContextStateStore(input.contextStatePath)).resolves.toMatchObject({
      "tranfu-labs/agent-moebius#4": {
        [ISSUE_WORKTREE_CONTEXT_ROLE]: {
          mainStatus: "behind-main",
          workspaceAccess: "read-run",
        },
      },
    });
  });

  it("lazily migrates a legacy dev context without moving the worktree", async () => {
    const root = await makeTempDir();
    const input = makeInput(root, { role: "qa", workspaceAccess: "read-run" });
    const legacyPath = buildLegacyRoleWorktreePath(input, "dev");
    const repoCachePath = expectedRepoCachePath(root);
    await fs.mkdir(legacyPath, { recursive: true });
    await fs.mkdir(repoCachePath, { recursive: true });
    await saveAgentContextStateStore(
      {
        "tranfu-labs/agent-moebius#4": {
          dev: {
            preScript: LEGACY_DEV_WORKSPACE_PRE_SCRIPT_PATH,
            owner: "tranfu-labs",
            repo: "agent-moebius",
            issueNumber: 4,
            worktreePath: legacyPath,
            preparedFromMessageIndex: 2,
          },
        },
      },
      input.contextStatePath,
    );

    const result = await runIssueWorktreeCapability(input, {
      ...makeFsDependencies(),
      runGit: async () => {},
      isGitAncestor: async () => true,
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.codexCwd : "").toBe(legacyPath);
    await expect(loadAgentContextStateStore(input.contextStatePath)).resolves.toMatchObject({
      "tranfu-labs/agent-moebius#4": {
        dev: {
          worktreePath: legacyPath,
        },
        [ISSUE_WORKTREE_CONTEXT_ROLE]: {
          worktreePath: legacyPath,
          migratedFromRole: "dev",
          mainStatus: "fresh",
        },
      },
    });
  });

  it("times out a hanging git fetch and releases the repo lock for another issue", async () => {
    const root = await makeTempDir();
    const inputA = makeInput(root);
    const inputB = makeInput(root, {
      issueSource: {
        owner: "tranfu-labs",
        repo: "agent-moebius",
        issueNumber: 5,
        issueKey: "tranfu-labs/agent-moebius#5",
        cloneUrl: "https://github.com/tranfu-labs/agent-moebius.git",
      },
    });
    const repoCachePath = expectedRepoCachePath(root);
    await fs.mkdir(repoCachePath, { recursive: true });
    let fetchCount = 0;

    const runGit = async (args: string[]) => {
      if (args[2] === "fetch") {
        fetchCount++;
        if (fetchCount === 1) {
          return await new Promise<void>(() => {});
        }
        return;
      }
      if (args[2] === "worktree" && args[3] === "add") {
        await fs.mkdir(worktreePathFromWorktreeAdd(args), { recursive: true });
      }
    };

    const promiseA = runIssueWorktreeCapability(inputA, {
      ...makeFsDependencies(),
      runGit,
      gitTimeoutMs: 10,
    });
    await waitUntil(() => fetchCount === 1);
    const promiseB = runIssueWorktreeCapability(inputB, {
      ...makeFsDependencies(),
      runGit,
      gitTimeoutMs: 10,
    });

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    expect(resultA.ok).toBe(false);
    if (!resultA.ok) {
      expect(resultA.reason).toContain("workspace-git-timeout:fetch:10ms");
    }
    expect(resultB.ok).toBe(true);
    expect(fetchCount).toBe(2);
  });

  it("times out a hanging merge-base check when reusing a workspace", async () => {
    const root = await makeTempDir();
    const input = makeInput(root);
    const worktreePath = expectedIssueWorktreePath(root);
    const repoCachePath = expectedRepoCachePath(root);
    await fs.mkdir(worktreePath, { recursive: true });
    await fs.mkdir(repoCachePath, { recursive: true });
    await saveAgentContextStateEntry(
      input.issueSource.issueKey,
      ISSUE_WORKTREE_CONTEXT_ROLE,
      makeIssueWorkspaceState(worktreePath),
      input.contextStatePath,
    );

    const result = await runIssueWorktreeCapability(input, {
      ...makeFsDependencies(),
      runGit: async () => {},
      isGitAncestor: async () => await new Promise<boolean>(() => {}),
      gitTimeoutMs: 10,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("workspace-git-timeout:merge-base:10ms");
    }
  });

  it("fails closed when an existing workspace context points at a missing worktree", async () => {
    const root = await makeTempDir();
    const input = makeInput(root);
    const worktreePath = expectedIssueWorktreePath(root);
    const repoCachePath = expectedRepoCachePath(root);
    await fs.mkdir(repoCachePath, { recursive: true });
    await saveAgentContextStateEntry(
      input.issueSource.issueKey,
      ISSUE_WORKTREE_CONTEXT_ROLE,
      makeIssueWorkspaceState(worktreePath),
      input.contextStatePath,
    );

    const result = await runIssueWorktreeCapability(input, {
      ...makeFsDependencies(),
      runGit: async () => {
        throw new Error("unexpected git call");
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(`missing-worktree:${worktreePath}`);
    }
  });

  it("builds sanitized branch names", () => {
    const input = makeInput("/tmp/does-not-matter", {
      issueSource: {
        owner: "tranfu labs",
        repo: "agent/moebius",
        issueNumber: 4,
        issueKey: "tranfu labs/agent/moebius#4",
        cloneUrl: "https://example.com/x.git",
      },
    });
    expect(buildIssueLocalBranchName(input)).toBe("agent/tranfu_labs__agent_moebius__4");
    expect(safePathSegment("owner/repo name")).toBe("owner_repo_name");
  });
});

function makeInput(
  root: string,
  overrides: Partial<IssueWorktreeCapabilityInput> = {},
): IssueWorktreeCapabilityInput {
  return {
    role: "dev",
    workspaceAccess: "write",
    latestIndex: 7,
    issueSource: {
      owner: "tranfu-labs",
      repo: "agent-moebius",
      issueNumber: 4,
      issueKey: "tranfu-labs/agent-moebius#4",
      cloneUrl: "https://github.com/tranfu-labs/agent-moebius.git",
    },
    workdirRoot: root,
    contextStatePath: path.join(root, ".state", "agent-contexts.json"),
    ...overrides,
  };
}

function makeIssueWorkspaceState(worktreePath: string): AgentContextState {
  return {
    preScript: ISSUE_WORKTREE_CONTEXT_PRE_SCRIPT,
    owner: "tranfu-labs",
    repo: "agent-moebius",
    issueNumber: 4,
    worktreePath,
    preparedFromMessageIndex: 2,
    workspaceAccess: "write",
    mainStatus: "fresh",
  };
}

function makeFsDependencies(): {
  access(path: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<void>;
  pathExists(path: string): Promise<boolean>;
  runGit(args: string[], options: { label: string; timeoutMs: number; signal?: AbortSignal }): Promise<void>;
  isGitAncestor(
    input: { cwd: string; ancestor: string; descendant: string },
    options: { label: string; timeoutMs: number; signal?: AbortSignal },
  ): Promise<boolean>;
  loadState(filePath: string): Promise<Record<string, Record<string, AgentContextState>>>;
  saveStateEntry(issueKey: string, role: string, state: AgentContextState, filePath: string): Promise<void>;
  now(): Date;
  gitTimeoutMs: number;
} {
  return {
    access: (targetPath) => fs.access(targetPath),
    mkdir: async (targetPath, options) => {
      await fs.mkdir(targetPath, options);
    },
    pathExists: async (targetPath) => {
      try {
        await fs.access(targetPath);
        return true;
      } catch {
        return false;
      }
    },
    runGit: async () => {},
    isGitAncestor: async () => true,
    loadState: loadAgentContextStateStore,
    saveStateEntry: saveAgentContextStateEntry,
    now: () => new Date("2026-07-04T00:00:00.000Z"),
    gitTimeoutMs: 50,
  };
}

function expectedRepoCachePath(root: string): string {
  return path.join(root, "repos", "tranfu-labs__agent-moebius.git");
}

function expectedIssueWorktreePath(root: string): string {
  return path.join(root, "worktrees", "tranfu-labs__agent-moebius__4");
}

function worktreePathFromWorktreeAdd(args: string[]): string {
  return args[args.length - 2] as string;
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-issue-worktree-test-"));
}

async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitUntil timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
