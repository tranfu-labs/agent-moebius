import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentTeamFileManagerError,
  getAgentTeamFileManagerLabel,
  openAgentTeamLocationInFileManager,
} from "../src/team-file-manager.js";
import { getMemberDirectory, resolveTeamLocation } from "../src/team-store.js";

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("Agent team file manager", () => {
  it("uses platform-appropriate action labels", () => {
    expect(getAgentTeamFileManagerLabel("darwin")).toBe("在 Finder 中打开");
    expect(getAgentTeamFileManagerLabel("win32")).toBe("在文件资源管理器中显示");
    expect(getAgentTeamFileManagerLabel("linux")).toBe("在文件管理器中打开");
  });

  it("opens the team directory and the selected member directory", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "my-team", ownership: "user" });
    const memberDirectory = getMemberDirectory(location, "manager");
    await fs.mkdir(memberDirectory, { recursive: true });
    const openPath = vi.fn().mockResolvedValue("");

    await openAgentTeamLocationInFileManager({
      dataRoot,
      request: { teamId: "my-team", ownership: "user" },
      shell: { openPath },
    });
    await openAgentTeamLocationInFileManager({
      dataRoot,
      request: { teamId: "my-team", ownership: "user", memberSlug: "manager" },
      shell: { openPath },
    });

    expect(openPath).toHaveBeenNthCalledWith(1, location.directory);
    expect(openPath).toHaveBeenNthCalledWith(2, memberDirectory);
  });

  it("allows a built-in location to be viewed without modifying its contents", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "development", ownership: "system" });
    const memberDirectory = getMemberDirectory(location, "manager");
    await fs.mkdir(memberDirectory, { recursive: true });
    const agentPath = path.join(memberDirectory, "AGENT.md");
    await fs.writeFile(agentPath, "# 开发经理\n", "utf8");
    const openPath = vi.fn().mockResolvedValue("");

    await openAgentTeamLocationInFileManager({
      dataRoot,
      request: { teamId: "development", ownership: "system", memberSlug: "manager" },
      shell: { openPath },
    });

    expect(openPath).toHaveBeenCalledWith(memberDirectory);
    await expect(fs.readFile(agentPath, "utf8")).resolves.toBe("# 开发经理\n");
  });

  it("replaces missing, inaccessible, and shell errors with a user-facing message", async () => {
    const dataRoot = await makeDataRoot();
    const openPath = vi.fn().mockRejectedValue(new Error("EACCES /private/internal/path"));

    await expect(openAgentTeamLocationInFileManager({
      dataRoot,
      request: { teamId: "missing", ownership: "user" },
      shell: { openPath },
    })).rejects.toMatchObject({
      name: "AgentTeamFileManagerError",
      code: "AGENT_TEAM_FILE_MANAGER_OPEN_FAILED",
      message: "暂时无法打开这个位置。请确认相关文件仍然存在，并检查访问权限后重试。",
    } satisfies Partial<AgentTeamFileManagerError>);
    expect(openPath).not.toHaveBeenCalled();

    const location = resolveTeamLocation({ dataRoot, teamId: "my-team", ownership: "user" });
    await fs.mkdir(location.directory, { recursive: true });
    const shellFailure = await openAgentTeamLocationInFileManager({
      dataRoot,
      request: { teamId: "my-team", ownership: "user" },
      shell: { openPath },
    }).catch((error: unknown) => error);
    expect(shellFailure).toBeInstanceOf(AgentTeamFileManagerError);
    expect((shellFailure as Error).message).toBe(
      "暂时无法打开这个位置。请确认相关文件仍然存在，并检查访问权限后重试。",
    );
    expect((shellFailure as Error).message).not.toMatch(/EACCES|private|internal/u);
  });
});

async function makeDataRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-team-file-manager-"));
  cleanupRoots.push(root);
  return root;
}
