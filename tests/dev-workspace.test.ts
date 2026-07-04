import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEV_WORKSPACE_PRE_SCRIPT_PATH,
  buildLocalBranchName,
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
          await fs.mkdir(worktreePathFromWorktreeAdd(args), { recursive: true });
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
        "-B",
        "agent/dev/tranfu-labs__agent-moebius__4",
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
          await fs.mkdir(worktreePathFromWorktreeAdd(args), { recursive: true });
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
        "-B",
        "agent/dev/tranfu-labs__agent-moebius__4",
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
          const target = worktreePathFromWorktreeAdd(args);
          events.push(`add:${target}`);
          await fs.mkdir(target, { recursive: true });
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

  it("derives a controlled local branch name from role/owner/repo/issue", () => {
    const input = makeInput("/tmp/does-not-matter");
    expect(buildLocalBranchName(input)).toBe("agent/dev/tranfu-labs__agent-moebius__4");
  });

  it("normalizes owner/repo characters when building the local branch name", () => {
    const input = makeInput("/tmp/does-not-matter", {
      issueSource: {
        owner: "tranfu labs",
        repo: "agent/moebius",
        issueNumber: 4,
        issueKey: "tranfu labs/agent/moebius#4",
        cloneUrl: "https://example.com/x.git",
      },
    });
    expect(buildLocalBranchName(input)).toBe("agent/dev/tranfu_labs__agent_moebius__4");
  });

  it("serializes calls sharing the same repo cache key", async () => {
    const root = await makeTempDir();
    const inputA = makeInput(root, {
      issueSource: {
        owner: "tranfu-labs",
        repo: "agent-moebius",
        issueNumber: 4,
        issueKey: "tranfu-labs/agent-moebius#4",
        cloneUrl: "https://github.com/tranfu-labs/agent-moebius.git",
      },
    });
    const inputB = makeInput(root, {
      issueSource: {
        owner: "tranfu-labs",
        repo: "agent-moebius",
        issueNumber: 5,
        issueKey: "tranfu-labs/agent-moebius#5",
        cloneUrl: "https://github.com/tranfu-labs/agent-moebius.git",
      },
    });

    const events: string[] = [];
    let releaseAWorktreeAdd: () => void = () => {};
    const aGate = new Promise<void>((resolve) => {
      releaseAWorktreeAdd = resolve;
    });

    const makeRunGit = (label: "A" | "B") => async (args: string[]) => {
      const phase = args[0] === "clone" ? "clone" : `${args[2]}${args[3] ? ":" + args[3] : ""}`;
      events.push(`${label}:${phase}:enter`);
      if (args[0] === "clone") {
        await fs.mkdir(args[3] as string, { recursive: true });
      } else if (args[2] === "worktree" && args[3] === "add") {
        if (label === "A") {
          await aGate;
        }
        await fs.mkdir(worktreePathFromWorktreeAdd(args), { recursive: true });
      }
      events.push(`${label}:${phase}:exit`);
    };

    const promiseA = runDevWorkspacePreScript(inputA, {
      ...makeFsDependencies(),
      runGit: makeRunGit("A"),
    });
    const promiseB = runDevWorkspacePreScript(inputB, {
      ...makeFsDependencies(),
      runGit: makeRunGit("B"),
    });

    await waitUntil(() => events.includes("A:worktree:add:enter"));
    await new Promise((resolve) => setTimeout(resolve, 30));

    const aEnterBeforeRelease = events.indexOf("A:worktree:add:enter");
    const bEnterBeforeRelease = events.findIndex((event) => event.startsWith("B:") && event.endsWith(":enter"));
    const bExitBeforeRelease = events.findIndex((event) => event.startsWith("B:") && event.endsWith(":exit"));

    if (bEnterBeforeRelease > aEnterBeforeRelease) {
      expect(events.filter((event) => event.startsWith("B:"))).toEqual([]);
    } else if (bEnterBeforeRelease >= 0) {
      expect(bExitBeforeRelease).toBeGreaterThan(bEnterBeforeRelease);
      expect(bExitBeforeRelease).toBeLessThan(aEnterBeforeRelease);
    }
    expect(events.filter((event) => event.startsWith("A:"))).not.toContain("A:worktree:add:exit");

    releaseAWorktreeAdd();
    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
    const aExit = events.indexOf("A:worktree:add:exit");
    const bFirst = events.findIndex((event) => event.startsWith("B:") && event.endsWith(":enter"));
    let bLastExit = -1;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index]?.startsWith("B:") && events[index]?.endsWith(":exit")) {
        bLastExit = index;
        break;
      }
    }
    expect(aExit).toBeGreaterThanOrEqual(0);
    if (bFirst > aEnterBeforeRelease) {
      expect(bFirst).toBeGreaterThan(aExit);
    } else {
      expect(bLastExit).toBeLessThan(aEnterBeforeRelease);
    }
  });

  it("runs different repo cache keys in parallel", async () => {
    const root = await makeTempDir();
    const inputA = makeInput(root, {
      issueSource: {
        owner: "tranfu-labs",
        repo: "agent-moebius",
        issueNumber: 4,
        issueKey: "tranfu-labs/agent-moebius#4",
        cloneUrl: "https://github.com/tranfu-labs/agent-moebius.git",
      },
    });
    const inputB = makeInput(root, {
      issueSource: {
        owner: "tranfu-labs",
        repo: "tranfucom",
        issueNumber: 4,
        issueKey: "tranfu-labs/tranfucom#4",
        cloneUrl: "https://github.com/tranfu-labs/tranfucom.git",
      },
    });

    const events: string[] = [];
    let releaseAWorktreeAdd: () => void = () => {};
    const aGate = new Promise<void>((resolve) => {
      releaseAWorktreeAdd = resolve;
    });

    const makeRunGit = (label: "A" | "B") => async (args: string[]) => {
      const phase = args[0] === "clone" ? "clone" : `${args[2]}${args[3] ? ":" + args[3] : ""}`;
      events.push(`${label}:${phase}:enter`);
      if (args[0] === "clone") {
        await fs.mkdir(args[3] as string, { recursive: true });
      } else if (args[2] === "worktree" && args[3] === "add") {
        if (label === "A") {
          await aGate;
        }
        await fs.mkdir(worktreePathFromWorktreeAdd(args), { recursive: true });
      }
      events.push(`${label}:${phase}:exit`);
    };

    const promiseA = runDevWorkspacePreScript(inputA, {
      ...makeFsDependencies(),
      runGit: makeRunGit("A"),
    });
    const promiseB = runDevWorkspacePreScript(inputB, {
      ...makeFsDependencies(),
      runGit: makeRunGit("B"),
    });

    await waitUntil(
      () => events.includes("A:worktree:add:enter") && events.includes("B:worktree:add:enter"),
    );

    releaseAWorktreeAdd();
    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);
    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
  });

  it("releases the repo lock when the critical section throws", async () => {
    const root = await makeTempDir();
    const inputA = makeInput(root, {
      issueSource: {
        owner: "tranfu-labs",
        repo: "agent-moebius",
        issueNumber: 4,
        issueKey: "tranfu-labs/agent-moebius#4",
        cloneUrl: "https://github.com/tranfu-labs/agent-moebius.git",
      },
    });
    const inputB = makeInput(root, {
      issueSource: {
        owner: "tranfu-labs",
        repo: "agent-moebius",
        issueNumber: 5,
        issueKey: "tranfu-labs/agent-moebius#5",
        cloneUrl: "https://github.com/tranfu-labs/agent-moebius.git",
      },
    });

    let aCalls = 0;
    const runGitA = async (args: string[]) => {
      aCalls++;
      if (args[0] === "clone") {
        await fs.mkdir(args[3] as string, { recursive: true });
        return;
      }
      if (args[2] === "fetch") {
        throw new Error("boom: A refresh failed");
      }
      if (args[2] === "worktree" && args[3] === "add") {
        await fs.mkdir(worktreePathFromWorktreeAdd(args), { recursive: true });
      }
    };
    const runGitB = async (args: string[]) => {
      if (args[0] === "clone") {
        await fs.mkdir(args[3] as string, { recursive: true });
        return;
      }
      if (args[2] === "worktree" && args[3] === "add") {
        await fs.mkdir(worktreePathFromWorktreeAdd(args), { recursive: true });
      }
    };

    const resultA = await runDevWorkspacePreScript(inputA, {
      ...makeFsDependencies(),
      runGit: runGitA,
    });
    const resultB = await runDevWorkspacePreScript(inputB, {
      ...makeFsDependencies(),
      runGit: runGitB,
    });

    expect(resultA.ok).toBe(false);
    if (resultA.ok) return;
    expect(resultA.reason).toContain("boom: A refresh failed");
    expect(aCalls).toBeGreaterThan(0);
    expect(resultB.ok).toBe(true);
  });

  it("rebuilds a stale worktree with -B and the derived local branch name", async () => {
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
      removeWorktree: async () => {
        await fs.rm(worktreePath, { recursive: true, force: true });
      },
      runGit: async (args) => {
        if (args[2] === "worktree" && args[3] === "add") {
          events.push(args.join(" "));
          await fs.mkdir(worktreePathFromWorktreeAdd(args), { recursive: true });
        }
      },
      isGitAncestor: async () => false,
    });

    expect(result.ok).toBe(true);
    expect(events).toEqual([
      `--git-dir ${repoCachePath} worktree add -B agent/dev/tranfu-labs__agent-moebius__4 ${worktreePath} ${REMOTE_MAIN_REF}`,
    ]);
  });
});

function makeInput(root: string, overrides: Partial<AgentPreScriptInput> = {}): AgentPreScriptInput {
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
    ...overrides,
  };
}

function worktreePathFromWorktreeAdd(args: string[]): string {
  return args[args.length - 2] as string;
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
