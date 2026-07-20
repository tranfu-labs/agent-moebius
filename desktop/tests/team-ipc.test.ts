import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TeamDefinition } from "../src/team-model.js";
import {
  listAgentTeams,
  readAgentTeamMember,
  writeAgentTeamMember,
} from "../src/team-ipc.js";
import {
  resolveTeamLocation,
  writeMemberAgentMarkdown,
  writeTeamDefinition,
} from "../src/team-store.js";

const temporaryRoots: string[] = [];
const usableDefinition: TeamDefinition = {
  name: "开发团队",
  description: "负责软件开发任务",
  primaryAgentSlug: "manager",
  memberOrder: ["manager"],
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("Agent team IPC service", () => {
  it("reports loading without touching team storage while built-in seeding is pending", async () => {
    await expect(listAgentTeams({ dataRoot: "/path/that/does/not/exist", seedPending: true })).resolves.toEqual({
      status: "loading",
    });
  });

  it("reports an application configuration error when no readable built-in team exists", async () => {
    const dataRoot = await makeDataRoot();
    const userLocation = resolveTeamLocation({ dataRoot, teamId: "user-team", ownership: "user" });
    await createUsableTeam(userLocation);

    await expect(listAgentTeams({ dataRoot, seedPending: false })).resolves.toEqual({
      status: "configuration-error",
    });
  });

  it("returns safe list data from built-in and user teams without exposing disk paths or markdown bodies", async () => {
    const dataRoot = await makeDataRoot();
    const builtIn = resolveTeamLocation({ dataRoot, teamId: "development", ownership: "system" });
    const user = resolveTeamLocation({ dataRoot, teamId: "my-team", ownership: "user" });
    await Promise.all([createUsableTeam(builtIn), createUsableTeam(user)]);

    const result = await listAgentTeams({ dataRoot, seedPending: false });

    expect(result).toMatchObject({
      status: "ready",
      teams: [
        {
          id: "development",
          ownership: "system",
          definition: usableDefinition,
          members: [{ slug: "manager", displayName: "开发经理", description: "默认接单" }],
        },
        { id: "my-team", ownership: "user" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(dataRoot);
    expect(JSON.stringify(result)).not.toContain("# 开发经理");
  });

  it("reads and writes user member documents while preserving the store's built-in write rejection", async () => {
    const dataRoot = await makeDataRoot();
    const builtIn = resolveTeamLocation({ dataRoot, teamId: "development", ownership: "system" });
    const user = resolveTeamLocation({ dataRoot, teamId: "my-team", ownership: "user" });
    await Promise.all([createUsableTeam(builtIn), createUsableTeam(user)]);

    const request = { teamId: "my-team", ownership: "user" as const, memberSlug: "manager" };
    await expect(readAgentTeamMember(dataRoot, request)).resolves.toMatchObject({
      slug: "manager",
      displayName: "开发经理",
      agentMarkdown: "# 开发经理\n\n默认接单\n",
    });
    await expect(writeAgentTeamMember(dataRoot, {
      ...request,
      agentMarkdown: "# 新经理\n\n新的职责\n",
    })).resolves.toMatchObject({ displayName: "新经理", description: "新的职责" });

    await expect(writeAgentTeamMember(dataRoot, {
      teamId: "development",
      ownership: "system",
      memberSlug: "manager",
      agentMarkdown: "# 不应写入\n",
    })).rejects.toMatchObject({ code: "BUILT_IN_TEAM_READ_ONLY" });
  });

  it("rejects malformed member requests before resolving a disk location", async () => {
    const dataRoot = await makeDataRoot();
    await expect(readAgentTeamMember(dataRoot, {
      teamId: "team",
      ownership: "external",
      memberSlug: "manager",
    })).rejects.toMatchObject({ code: "AGENT_TEAM_IPC_REQUEST_INVALID" });
  });
});

async function makeDataRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-team-ipc-"));
  temporaryRoots.push(root);
  return root;
}

async function createUsableTeam(location: ReturnType<typeof resolveTeamLocation>): Promise<void> {
  await fs.mkdir(location.directory, { recursive: true });
  await fs.writeFile(path.join(location.directory, "team.json"), `${JSON.stringify(usableDefinition, null, 2)}\n`, "utf8");
  if (location.ownership === "user") {
    await writeTeamDefinition(location, usableDefinition);
  }
  await fs.mkdir(path.join(location.directory, "members", "manager"), { recursive: true });
  if (location.ownership === "user") {
    await writeMemberAgentMarkdown(location, "manager", "# 开发经理\n\n默认接单\n");
    return;
  }
  await fs.writeFile(
    path.join(location.directory, "members", "manager", "AGENT.md"),
    "# 开发经理\n\n默认接单\n",
    "utf8",
  );
}
