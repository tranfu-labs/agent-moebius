import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TeamDefinition } from "../src/team-model.js";
import {
  addAgentTeamMember,
  createAgentTeam,
  duplicateAgentTeamMember,
  duplicateBuiltInAgentTeam,
  duplicateUserAgentTeam,
  listAgentTeams,
  readAgentTeamMember,
  setAgentTeamPrimaryAgent,
  trashAgentTeamMember,
  trashUserAgentTeam,
  updateAgentTeamInformation,
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

  it("creates a durable unfinished draft, then makes its first added Agent primary and usable", async () => {
    const dataRoot = await makeDataRoot();
    const builtIn = resolveTeamLocation({ dataRoot, teamId: "development", ownership: "system" });
    await createUsableTeam(builtIn);

    const draft = await createAgentTeam(dataRoot, {
      name: "新的开发团队",
      description: "负责下一代产品",
    });
    expect(draft).toMatchObject({
      ownership: "user",
      status: "unfinished-draft",
      canCreateConversation: false,
      definition: { primaryAgentSlug: null, memberOrder: [] },
    });
    await expect(listAgentTeams({ dataRoot, seedPending: false })).resolves.toMatchObject({
      status: "ready",
      teams: [
        { id: "development", ownership: "system" },
        { id: draft.id, status: "unfinished-draft", canCreateConversation: false },
      ],
    });

    const added = await addAgentTeamMember(dataRoot, { teamId: draft.id, ownership: "user" });
    expect(added).toMatchObject({
      member: {
        slug: "agent",
        displayName: "新 Agent",
        description: "描述这个 Agent 负责什么。",
        agentMarkdown: "# 新 Agent\n\n描述这个 Agent 负责什么。\n",
      },
      team: {
        status: "usable",
        canCreateConversation: true,
        definition: { primaryAgentSlug: "agent", memberOrder: ["agent"] },
      },
    });
  });

  it("changes only user-team identity fields through the information endpoint", async () => {
    const dataRoot = await makeDataRoot();
    const user = resolveTeamLocation({ dataRoot, teamId: "my-team", ownership: "user" });
    await createUsableTeam(user);

    await expect(updateAgentTeamInformation(dataRoot, {
      teamId: "my-team",
      ownership: "user",
      name: "新团队名",
      description: "新的团队描述",
      primaryAgentSlug: "attempted-overwrite",
      memberOrder: [],
    })).resolves.toMatchObject({
      definition: {
        name: "新团队名",
        description: "新的团队描述",
        primaryAgentSlug: "manager",
        memberOrder: ["manager"],
      },
    });
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

  it("persists a user primary Agent and rejects a direct built-in write without changing its manifest", async () => {
    const dataRoot = await makeDataRoot();
    const builtIn = resolveTeamLocation({ dataRoot, teamId: "development", ownership: "system" });
    const user = resolveTeamLocation({ dataRoot, teamId: "my-team", ownership: "user" });
    const twoMemberDefinition = { ...usableDefinition, memberOrder: ["manager", "developer"] };
    await Promise.all([
      createUsableTeam(builtIn, twoMemberDefinition),
      createUsableTeam(user, twoMemberDefinition),
    ]);
    const builtInManifest = await fs.readFile(path.join(builtIn.directory, "team.json"), "utf8");

    await expect(setAgentTeamPrimaryAgent(dataRoot, {
      teamId: "my-team",
      ownership: "user",
      primaryAgentSlug: "developer",
    })).resolves.toMatchObject({
      definition: { primaryAgentSlug: "developer" },
    });
    await expect(setAgentTeamPrimaryAgent(dataRoot, {
      teamId: "development",
      ownership: "system",
      primaryAgentSlug: "developer",
    })).rejects.toMatchObject({ code: "BUILT_IN_TEAM_READ_ONLY" });
    expect(await fs.readFile(path.join(builtIn.directory, "team.json"), "utf8")).toBe(builtInManifest);
  });

  it("duplicates a built-in team as a user-team list item and rejects user-team sources", async () => {
    const dataRoot = await makeDataRoot();
    const builtIn = resolveTeamLocation({ dataRoot, teamId: "development", ownership: "system" });
    await createUsableTeam(builtIn);
    await fs.writeFile(path.join(builtIn.directory, "related.txt"), "copied too\n", "utf8");

    await expect(duplicateBuiltInAgentTeam(dataRoot, {
      teamId: "development",
      ownership: "system",
    })).resolves.toMatchObject({
      id: "development-copy",
      ownership: "user",
      definition: usableDefinition,
      members: [{ slug: "manager", displayName: "开发经理" }],
    });
    await expect(fs.readFile(path.join(dataRoot, "teams", "development-copy", "related.txt"), "utf8"))
      .resolves.toBe("copied too\n");
    await expect(duplicateBuiltInAgentTeam(dataRoot, {
      teamId: "development-copy",
      ownership: "user",
    })).rejects.toMatchObject({ code: "AGENT_TEAM_IPC_REQUEST_INVALID" });
  });

  it("exposes separate user-team and member duplication operations", async () => {
    const dataRoot = await makeDataRoot();
    const user = resolveTeamLocation({ dataRoot, teamId: "my-team", ownership: "user" });
    await createUsableTeam(user, {
      ...usableDefinition,
      primaryAgentSlug: "manager",
      memberOrder: ["manager", "developer"],
    });
    await fs.writeFile(path.join(user.directory, "members", "developer", "related.txt"), "copy me\n", "utf8");

    await expect(duplicateUserAgentTeam(dataRoot, { teamId: "my-team", ownership: "user" }))
      .resolves.toMatchObject({ id: "my-team-copy", ownership: "user", status: "usable" });
    await expect(duplicateAgentTeamMember(dataRoot, {
      teamId: "my-team",
      ownership: "user",
      memberSlug: "developer",
    })).resolves.toMatchObject({
      member: { slug: "developer-2", displayName: "开发" },
      team: { definition: { memberOrder: ["manager", "developer", "developer-2"] } },
    });
    await expect(fs.readFile(path.join(user.directory, "members", "developer-2", "related.txt"), "utf8"))
      .resolves.toBe("copy me\n");
    await expect(duplicateUserAgentTeam(dataRoot, { teamId: "my-team", ownership: "system" }))
      .rejects.toMatchObject({ code: "AGENT_TEAM_IPC_REQUEST_INVALID" });
  });

  it("moves member and team paths through the injected system-trash boundary", async () => {
    const dataRoot = await makeDataRoot();
    const user = resolveTeamLocation({ dataRoot, teamId: "my-team", ownership: "user" });
    await createUsableTeam(user, {
      ...usableDefinition,
      primaryAgentSlug: "manager",
      memberOrder: ["manager", "developer"],
    });
    const movedPaths: string[] = [];
    const trashRoot = path.join(dataRoot, "trash");
    const moveToTrash = async (targetPath: string) => {
      movedPaths.push(targetPath);
      await fs.mkdir(trashRoot, { recursive: true });
      await fs.rename(targetPath, path.join(trashRoot, `${movedPaths.length}-${path.basename(targetPath)}`));
    };

    await expect(trashAgentTeamMember(dataRoot, {
      teamId: "my-team",
      ownership: "user",
      memberSlug: "developer",
    }, moveToTrash)).resolves.toMatchObject({ status: "usable", definition: { memberOrder: ["manager"] } });
    await expect(trashUserAgentTeam(dataRoot, {
      teamId: "my-team",
      ownership: "user",
    }, moveToTrash)).resolves.toBeUndefined();

    expect(movedPaths).toEqual([
      path.join(user.directory, "members", "developer"),
      user.directory,
    ]);
    expect(await fs.readdir(trashRoot)).toEqual(["1-developer", "2-my-team"]);
  });
});

async function makeDataRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-team-ipc-"));
  temporaryRoots.push(root);
  return root;
}

async function createUsableTeam(
  location: ReturnType<typeof resolveTeamLocation>,
  definition: TeamDefinition = usableDefinition,
): Promise<void> {
  await fs.mkdir(location.directory, { recursive: true });
  await fs.writeFile(path.join(location.directory, "team.json"), `${JSON.stringify(definition, null, 2)}\n`, "utf8");
  if (location.ownership === "user") {
    await writeTeamDefinition(location, definition);
  }
  for (const slug of definition.memberOrder) {
    const markdown = slug === "manager" ? "# 开发经理\n\n默认接单\n" : "# 开发\n\n负责实现\n";
    await fs.mkdir(path.join(location.directory, "members", slug), { recursive: true });
    if (location.ownership === "user") {
      await writeMemberAgentMarkdown(location, slug, markdown);
    } else {
      await fs.writeFile(path.join(location.directory, "members", slug, "AGENT.md"), markdown, "utf8");
    }
  }
}
