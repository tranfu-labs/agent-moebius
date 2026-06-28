import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEV_WORKSPACE_PRE_SCRIPT_PATH,
  runDevWorkspacePreScript,
  safePathSegment,
} from "../src/agent-prescripts/dev-workspace.js";
import {
  loadAgentContextStateStore,
  saveAgentContextStateStore,
  type AgentContextState,
} from "../src/agent-context-state.js";
import type { AgentPreScriptInput } from "../src/agent-prescripts/types.js";

describe("dev workspace pre script", () => {
  it("creates a repo cache and issue-specific worktree on first run", async () => {
    const root = await makeTempDir();
    const commands: string[][] = [];
    const input = makeInput(root);

    const result = await runDevWorkspacePreScript(input, {
      ...makeFsDependencies(),
      runGit: async (args) => {
        commands.push(args);
        if (args[0] === "clone") {
          await fs.mkdir(args[3] as string, { recursive: true });
          return;
        }

        await fs.mkdir(args[4] as string, { recursive: true });
      },
    });

    const expectedWorktreePath = path.join(root, "worktrees", "tranfu-labs__agent-moebius__4__dev");
    expect(result).toEqual({ ok: true, codexCwd: expectedWorktreePath });
    expect(commands).toEqual([
      ["clone", "--bare", "https://github.com/tranfu-labs/agent-moebius.git", path.join(root, "repos", "tranfu-labs__agent-moebius.git")],
      ["--git-dir", path.join(root, "repos", "tranfu-labs__agent-moebius.git"), "worktree", "add", expectedWorktreePath, "HEAD"],
    ]);

    await expect(loadAgentContextStateStore(input.contextStatePath)).resolves.toEqual({
      "tranfu-labs/agent-moebius#4": {
        dev: {
          preScript: DEV_WORKSPACE_PRE_SCRIPT_PATH,
          owner: "tranfu-labs",
          repo: "agent-moebius",
          issueNumber: 4,
          worktreePath: expectedWorktreePath,
          preparedFromMessageIndex: 7,
        },
      },
    });
  });

  it("reuses an existing context without running git", async () => {
    const root = await makeTempDir();
    const input = makeInput(root);
    const worktreePath = path.join(root, "worktrees", "existing");
    await fs.mkdir(worktreePath, { recursive: true });
    await saveAgentContextStateStore(
      {
        "tranfu-labs/agent-moebius#4": {
          dev: {
            preScript: DEV_WORKSPACE_PRE_SCRIPT_PATH,
            owner: "tranfu-labs",
            repo: "agent-moebius",
            issueNumber: 4,
            worktreePath,
            preparedFromMessageIndex: 2,
          },
        },
      },
      input.contextStatePath,
    );

    const result = await runDevWorkspacePreScript(input, {
      ...makeFsDependencies(),
      runGit: async () => {
        throw new Error("git should not run");
      },
    });

    expect(result).toEqual({ ok: true, codexCwd: worktreePath });
  });

  it("fetches an existing repo cache before creating a new issue worktree", async () => {
    const root = await makeTempDir();
    const commands: string[][] = [];
    const input = makeInput(root);
    await fs.mkdir(path.join(root, "repos", "tranfu-labs__agent-moebius.git"), { recursive: true });

    const result = await runDevWorkspacePreScript(input, {
      ...makeFsDependencies(),
      runGit: async (args) => {
        commands.push(args);
        if (args[2] === "worktree") {
          await fs.mkdir(args[4] as string, { recursive: true });
        }
      },
    });

    expect(result.ok).toBe(true);
    expect(commands).toEqual([
      ["--git-dir", path.join(root, "repos", "tranfu-labs__agent-moebius.git"), "fetch", "--prune"],
      [
        "--git-dir",
        path.join(root, "repos", "tranfu-labs__agent-moebius.git"),
        "worktree",
        "add",
        path.join(root, "worktrees", "tranfu-labs__agent-moebius__4__dev"),
        "HEAD",
      ],
    ]);
  });

  it("fails closed when an existing context points to a missing worktree", async () => {
    const root = await makeTempDir();
    const input = makeInput(root);
    await saveAgentContextStateStore(
      {
        "tranfu-labs/agent-moebius#4": {
          dev: {
            preScript: DEV_WORKSPACE_PRE_SCRIPT_PATH,
            owner: "tranfu-labs",
            repo: "agent-moebius",
            issueNumber: 4,
            worktreePath: path.join(root, "missing"),
            preparedFromMessageIndex: 2,
          },
        },
      },
      input.contextStatePath,
    );

    const result = await runDevWorkspacePreScript(input, {
      ...makeFsDependencies(),
      runGit: async () => {
        throw new Error("git should not run");
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toContain("missing-worktree:");
  });

  it("sanitizes path segments", () => {
    expect(safePathSegment("owner/repo name")).toBe("owner_repo_name");
  });
});

function makeInput(root: string): AgentPreScriptInput {
  return {
    role: "dev",
    preScript: DEV_WORKSPACE_PRE_SCRIPT_PATH,
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
  };
}

function makeFsDependencies(): {
  access(path: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<void>;
  pathExists(path: string): Promise<boolean>;
  loadState(filePath: string): Promise<Record<string, Record<string, AgentContextState>>>;
  saveState(store: Record<string, Record<string, AgentContextState>>, filePath: string): Promise<void>;
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
    loadState: loadAgentContextStateStore,
    saveState: saveAgentContextStateStore,
  };
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-dev-workspace-test-"));
}
