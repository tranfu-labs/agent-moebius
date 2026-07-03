import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEV_WORKSPACE_PRE_SCRIPT_PATH,
  removeWorktreeWithFallback,
  runGit,
  runDevWorkspacePreScript,
  safePathSegment,
} from "../src/agent-prescripts/dev-workspace.js";
import {
  loadAgentContextStateStore,
  saveAgentContextStateEntry,
  saveAgentContextStateStore,
  type AgentContextState,
} from "../src/agent-context-state.js";
import type { AgentPreScriptInput } from "../src/agent-prescripts/types.js";

const REMOTE_MAIN_REF = "refs/remotes/origin/main";
const FETCH_REMOTE_MAIN_REFSPEC = `+refs/heads/main:${REMOTE_MAIN_REF}`;

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

        if (args[2] === "worktree") {
          await fs.mkdir(args[4] as string, { recursive: true });
        }
      },
    });

    const expectedWorktreePath = path.join(root, "worktrees", "tranfu-labs__agent-moebius__4__dev");
    expect(result).toEqual({ ok: true, codexCwd: expectedWorktreePath });
    expect(commands).toEqual([
      ["clone", "--bare", "https://github.com/tranfu-labs/agent-moebius.git", path.join(root, "repos", "tranfu-labs__agent-moebius.git")],
      [
        "--git-dir",
        path.join(root, "repos", "tranfu-labs__agent-moebius.git"),
        "fetch",
        "--prune",
        "origin",
        FETCH_REMOTE_MAIN_REFSPEC,
      ],
      [
        "--git-dir",
        path.join(root, "repos", "tranfu-labs__agent-moebius.git"),
        "worktree",
        "add",
        expectedWorktreePath,
        REMOTE_MAIN_REF,
      ],
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

  it("reuses an existing context after confirming it contains latest main", async () => {
    const root = await makeTempDir();
    const commands: string[][] = [];
    const input = makeInput(root);
    const worktreePath = expectedWorktreePath(root);
    const repoCachePath = path.join(root, "repos", "tranfu-labs__agent-moebius.git");
    await fs.mkdir(worktreePath, { recursive: true });
    await fs.mkdir(repoCachePath, { recursive: true });
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
      runGit: async (args) => {
        commands.push(args);
      },
      isGitAncestor: async (args) => {
        expect(args).toEqual({ cwd: worktreePath, ancestor: REMOTE_MAIN_REF, descendant: "HEAD" });
        return true;
      },
    });

    expect(result).toEqual({ ok: true, codexCwd: worktreePath });
    expect(commands).toEqual([
      ["--git-dir", repoCachePath, "fetch", "--prune", "origin", FETCH_REMOTE_MAIN_REFSPEC],
    ]);
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
      [
        "--git-dir",
        path.join(root, "repos", "tranfu-labs__agent-moebius.git"),
        "fetch",
        "--prune",
        "origin",
        FETCH_REMOTE_MAIN_REFSPEC,
      ],
      [
        "--git-dir",
        path.join(root, "repos", "tranfu-labs__agent-moebius.git"),
        "worktree",
        "add",
        path.join(root, "worktrees", "tranfu-labs__agent-moebius__4__dev"),
        REMOTE_MAIN_REF,
      ],
    ]);
  });

  it("rebuilds an existing worktree when it is behind latest main", async () => {
    const root = await makeTempDir();
    const events: string[] = [];
    const input = makeInput(root);
    const worktreePath = expectedWorktreePath(root);
    const repoCachePath = path.join(root, "repos", "tranfu-labs__agent-moebius.git");
    await fs.mkdir(worktreePath, { recursive: true });
    await fs.mkdir(repoCachePath, { recursive: true });
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
      removeWorktree: async (args) => {
        events.push(`remove:${args.worktreePath}`);
        expect(args).toEqual({ repoCachePath, worktreePath });
        await fs.rm(worktreePath, { recursive: true, force: true });
      },
      runGit: async (args) => {
        if (args[2] === "fetch") {
          events.push("fetch");
          return;
        }

        if (args[2] === "worktree" && args[3] === "add") {
          events.push(`add:${args[4]}`);
          await fs.mkdir(args[4] as string, { recursive: true });
          return;
        }
      },
      isGitAncestor: async () => false,
    });

    expect(result).toEqual({ ok: true, codexCwd: worktreePath });
    expect(events).toEqual(["fetch", `remove:${worktreePath}`, `add:${worktreePath}`]);
    await expect(loadAgentContextStateStore(input.contextStatePath)).resolves.toMatchObject({
      "tranfu-labs/agent-moebius#4": {
        dev: {
          worktreePath,
          preparedFromMessageIndex: 2,
        },
      },
    });
  });

  it("fails closed when rebuilding a stale worktree cannot re-add the worktree", async () => {
    const root = await makeTempDir();
    const input = makeInput(root);
    const worktreePath = expectedWorktreePath(root);
    const repoCachePath = path.join(root, "repos", "tranfu-labs__agent-moebius.git");
    await fs.mkdir(worktreePath, { recursive: true });
    await fs.mkdir(repoCachePath, { recursive: true });
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
      removeWorktree: async () => {
        await fs.rm(worktreePath, { recursive: true, force: true });
      },
      runGit: async (args) => {
        if (args[2] === "worktree" && args[3] === "add") {
          throw new Error("cannot add worktree");
        }
      },
      isGitAncestor: async () => false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toContain("stale-worktree-rebuild-failed:");
    expect(result.reason).toContain("cannot add worktree");
  });

  it("falls back to rm -rf plus worktree prune when git worktree remove fails", async () => {
    const calls: string[] = [];
    const repoCachePath = "/tmp/repo.git";
    const worktreePath = "/tmp/worktree";

    await removeWorktreeWithFallback(
      { repoCachePath, worktreePath },
      {
        runGit: async (args) => {
          calls.push(args.join(" "));
          if (args.includes("remove")) {
            throw new Error("remove failed");
          }
        },
        rm: async (targetPath, options) => {
          calls.push(`rm ${targetPath} ${String(options.recursive)} ${String(options.force)}`);
        },
      },
    );

    expect(calls).toEqual([
      `--git-dir ${repoCachePath} worktree remove --force ${worktreePath}`,
      `rm ${worktreePath} true true`,
      `--git-dir ${repoCachePath} worktree prune`,
    ]);
  });

  it("fails closed before deleting when an existing context points at an unexpected worktree path", async () => {
    const root = await makeTempDir();
    const input = makeInput(root);
    const mismatchedWorktreePath = path.join(root, "worktrees", "unexpected");
    await saveAgentContextStateStore(
      {
        "tranfu-labs/agent-moebius#4": {
          dev: {
            preScript: DEV_WORKSPACE_PRE_SCRIPT_PATH,
            owner: "tranfu-labs",
            repo: "agent-moebius",
            issueNumber: 4,
            worktreePath: mismatchedWorktreePath,
            preparedFromMessageIndex: 2,
          },
        },
      },
      input.contextStatePath,
    );

    const result = await runDevWorkspacePreScript(input, {
      ...makeFsDependencies(),
      access: async () => {
        throw new Error("access should not run");
      },
      removeWorktree: async () => {
        throw new Error("removeWorktree should not run");
      },
      runGit: async () => {
        throw new Error("runGit should not run");
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toBe(`context-worktree-mismatch:${mismatchedWorktreePath}`);
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
            worktreePath: expectedWorktreePath(root),
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

  it("includes git stderr when a git command fails", async () => {
    await expect(runGit(["not-a-real-git-subcommand-for-agent-moebius-test"])).rejects.toThrow(
      /git failed with exit-code-\d+: git: 'not-a-real-git-subcommand-for-agent-moebius-test' is not a git command/,
    );
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

function expectedWorktreePath(root: string): string {
  return path.join(root, "worktrees", "tranfu-labs__agent-moebius__4__dev");
}

function makeFsDependencies(): {
  access(path: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<void>;
  pathExists(path: string): Promise<boolean>;
  removeWorktree(input: { repoCachePath: string; worktreePath: string }): Promise<void>;
  isGitAncestor(input: { cwd: string; ancestor: string; descendant: string }): Promise<boolean>;
  loadState(filePath: string): Promise<Record<string, Record<string, AgentContextState>>>;
  saveStateEntry(issueKey: string, role: string, state: AgentContextState, filePath: string): Promise<void>;
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
    removeWorktree: async () => {
      throw new Error("removeWorktree should not run");
    },
    isGitAncestor: async () => {
      throw new Error("isGitAncestor should not run");
    },
    loadState: loadAgentContextStateStore,
    saveStateEntry: saveAgentContextStateEntry,
  };
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-dev-workspace-test-"));
}
