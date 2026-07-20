import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serializeTeamDefinition, type TeamDefinition } from "../src/team-model.js";
import {
  addTeamMember,
  BuiltInTeamReadOnlyError,
  createUserTeam,
  determineTeamOwnership,
  duplicateBuiltInTeamDirectory,
  getSystemTeamsRoot,
  getTeamsRoot,
  listTeamLocations,
  readTeamSnapshot,
  resolveTeamLocation,
  setTeamPrimaryAgent,
  updateTeamInformation,
  writeMemberAgentMarkdown,
  writeTeamDefinition,
} from "../src/team-store.js";

const temporaryRoots: string[] = [];
const usableDefinition: TeamDefinition = {
  name: "开发团队",
  description: "负责软件开发任务",
  primaryAgentSlug: "manager",
  memberOrder: ["manager", "developer"],
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("team disk store", () => {
  it("separates .system built-in teams from direct user-team siblings", async () => {
    const dataRoot = await makeDataRoot();
    const builtIn = resolveTeamLocation({ dataRoot, teamId: "development", ownership: "system" });
    const user = resolveTeamLocation({ dataRoot, teamId: "my-development", ownership: "user" });

    expect(getTeamsRoot(dataRoot)).toBe(path.join(dataRoot, "teams"));
    expect(getSystemTeamsRoot(dataRoot)).toBe(path.join(dataRoot, "teams", ".system"));
    expect(builtIn.directory).toBe(path.join(dataRoot, "teams", ".system", "development"));
    expect(user.directory).toBe(path.join(dataRoot, "teams", "my-development"));
    expect(determineTeamOwnership(dataRoot, path.join(builtIn.directory, "members", "manager", "AGENT.md"))).toBe(
      "system",
    );
    expect(determineTeamOwnership(dataRoot, path.join(user.directory, "team.json"))).toBe("user");
  });

  it("lists built-in teams first and user teams without treating .system as a team", async () => {
    const dataRoot = await makeDataRoot();
    await Promise.all([
      fs.mkdir(path.join(dataRoot, "teams", ".system", "development"), { recursive: true }),
      fs.mkdir(path.join(dataRoot, "teams", "z-team"), { recursive: true }),
      fs.mkdir(path.join(dataRoot, "teams", "a-team"), { recursive: true }),
    ]);

    const locations = await listTeamLocations(dataRoot);

    expect(locations.map(({ id, ownership }) => ({ id, ownership }))).toEqual([
      { id: "development", ownership: "system" },
      { id: "a-team", ownership: "user" },
      { id: "z-team", ownership: "user" },
    ]);
  });

  it("reads team identity from team.json and member identity only from each AGENT.md", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "my-development", ownership: "user" });
    await writeTeamDefinition(location, usableDefinition);
    await writeMemberAgentMarkdown(location, "manager", "# 开发经理\n\n默认接单并组织团队推进\n");
    await writeMemberAgentMarkdown(location, "developer", "# 开发\n\n负责实现并验证代码\n");

    const snapshot = await readTeamSnapshot(location);

    expect(snapshot.status).toBe("usable");
    expect(snapshot.canCreateConversation).toBe(true);
    expect(snapshot.definition).toEqual(usableDefinition);
    expect(snapshot.members.map(({ slug, displayName, description }) => ({ slug, displayName, description }))).toEqual([
      { slug: "manager", displayName: "开发经理", description: "默认接单并组织团队推进" },
      { slug: "developer", displayName: "开发", description: "负责实现并验证代码" },
    ]);
    expect(JSON.parse(await fs.readFile(path.join(location.directory, "team.json"), "utf8"))).toEqual(usableDefinition);
  });

  it("rejects direct data-layer writes to a built-in team before changing any file", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "development", ownership: "system" });
    const manifestPath = path.join(location.directory, "team.json");
    const agentPath = path.join(location.directory, "members", "manager", "AGENT.md");
    await fs.mkdir(path.dirname(agentPath), { recursive: true });
    await fs.writeFile(manifestPath, serializeTeamDefinition(usableDefinition), "utf8");
    await fs.writeFile(agentPath, "# 原始经理\n\n原始描述\n", "utf8");

    await expect(writeTeamDefinition(location, { ...usableDefinition, name: "已修改" })).rejects.toBeInstanceOf(
      BuiltInTeamReadOnlyError,
    );
    await expect(writeMemberAgentMarkdown(location, "manager", "# 已修改\n")).rejects.toMatchObject({
      code: "BUILT_IN_TEAM_READ_ONLY",
    });
    expect(await fs.readFile(manifestPath, "utf8")).toBe(serializeTeamDefinition(usableDefinition));
    expect(await fs.readFile(agentPath, "utf8")).toBe("# 原始经理\n\n原始描述\n");
  });

  it("switches the primary Agent only to a current member with a readable AGENT.md", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "my-development", ownership: "user" });
    await writeTeamDefinition(location, usableDefinition);
    await writeMemberAgentMarkdown(location, "manager", "# 开发经理\n\n默认接单\n");
    await writeMemberAgentMarkdown(location, "developer", "# 开发\n\n负责实现\n");

    await expect(setTeamPrimaryAgent(location, "developer")).resolves.toMatchObject({
      definition: { primaryAgentSlug: "developer", memberOrder: ["manager", "developer"] },
      status: "usable",
    });
    await expect(setTeamPrimaryAgent(location, "reviewer")).rejects.toMatchObject({
      code: "TEAM_PRIMARY_AGENT_INVALID",
    });

    await fs.rm(path.join(location.directory, "members", "manager", "AGENT.md"));
    await expect(setTeamPrimaryAgent(location, "manager")).rejects.toMatchObject({
      code: "TEAM_PRIMARY_AGENT_INVALID",
    });
    expect(JSON.parse(await fs.readFile(path.join(location.directory, "team.json"), "utf8"))).toMatchObject({
      primaryAgentSlug: "developer",
    });
  });

  it("keeps externally modified files under .system owned and read-only", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "development", ownership: "system" });
    const agentPath = path.join(location.directory, "members", "manager", "AGENT.md");
    await fs.mkdir(path.dirname(agentPath), { recursive: true });
    await fs.writeFile(path.join(location.directory, "team.json"), serializeTeamDefinition(usableDefinition), "utf8");
    await fs.writeFile(agentPath, "# 外部修改的经理\n\n仍然是内置内容\n", "utf8");

    const [listed] = await listTeamLocations(dataRoot);
    expect(listed?.ownership).toBe("system");
    expect(determineTeamOwnership(dataRoot, agentPath)).toBe("system");
    await expect(writeMemberAgentMarkdown(location, "manager", "# UI 绕过写入\n")).rejects.toMatchObject({
      code: "BUILT_IN_TEAM_READ_ONLY",
    });
    expect(await fs.readFile(agentPath, "utf8")).toBe("# 外部修改的经理\n\n仍然是内置内容\n");
  });

  it("copies a usable built-in team into an editable user team that can add Agents", async () => {
    const dataRoot = await makeDataRoot();
    const source = resolveTeamLocation({ dataRoot, teamId: "development", ownership: "system" });
    await fs.mkdir(path.join(source.directory, "members", "manager", "references"), { recursive: true });
    await fs.mkdir(path.join(source.directory, "playbooks"), { recursive: true });
    await fs.writeFile(path.join(source.directory, "team.json"), serializeTeamDefinition(usableDefinition), "utf8");
    await fs.writeFile(path.join(source.directory, "members", "manager", "AGENT.md"), "# 开发经理\n\n默认接单\n", "utf8");
    await fs.mkdir(path.join(source.directory, "members", "developer"), { recursive: true });
    await fs.writeFile(path.join(source.directory, "members", "developer", "AGENT.md"), "# 开发\n\n负责实现\n", "utf8");
    await fs.writeFile(path.join(source.directory, "members", "manager", "references", "rules.md"), "规则\n", "utf8");
    await fs.writeFile(path.join(source.directory, "playbooks", "checklist.txt"), "check\n", "utf8");
    await fs.writeFile(path.join(source.directory, ".team-note"), "hidden\n", "utf8");
    const lastUsedSentinel = path.join(dataRoot, "last-used-team.json");
    await fs.writeFile(lastUsedSentinel, JSON.stringify({ teamId: "another-team" }), "utf8");

    const destination = await duplicateBuiltInTeamDirectory(source);

    expect(destination).toMatchObject({ id: "development-copy", ownership: "user" });
    expect(destination.directory).toBe(path.join(dataRoot, "teams", "development-copy"));
    expect(await readFileTree(destination.directory)).toEqual(await readFileTree(source.directory));
    expect(await fs.readFile(lastUsedSentinel, "utf8")).toBe(JSON.stringify({ teamId: "another-team" }));

    await fs.writeFile(path.join(destination.directory, "playbooks", "checklist.txt"), "copied team edit\n", "utf8");
    expect(await fs.readFile(path.join(source.directory, "playbooks", "checklist.txt"), "utf8")).toBe("check\n");
    await expect(writeMemberAgentMarkdown(destination, "manager", "# 可编辑副本\n")).resolves.toBeUndefined();

    await expect(readTeamSnapshot(destination)).resolves.toMatchObject({
      status: "usable",
      canCreateConversation: true,
      definition: { primaryAgentSlug: "manager", memberOrder: ["manager", "developer"] },
    });
    await expect(addTeamMember(destination)).resolves.toMatchObject({
      member: { slug: "agent" },
      team: {
        status: "usable",
        canCreateConversation: true,
        definition: { primaryAgentSlug: "manager", memberOrder: ["manager", "developer", "agent"] },
      },
    });
  });

  it("marks a new team with no primary agent as an unfinished draft, not a repair", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "draft", ownership: "user" });
    await writeTeamDefinition(location, {
      name: "新的开发团队",
      description: "还没有可接收任务的 Agent",
      primaryAgentSlug: null,
      memberOrder: [],
    });

    await expect(readTeamSnapshot(location)).resolves.toMatchObject({
      status: "unfinished-draft",
      canCreateConversation: false,
      issues: [],
    });
  });

  it("retains a newly created team as an unfinished draft until its first Agent is successfully added", async () => {
    const dataRoot = await makeDataRoot();
    const draft = await createUserTeam(dataRoot, {
      name: "  新的开发团队  ",
      description: "  负责新产品开发  ",
    });

    expect(draft).toMatchObject({
      definition: {
        name: "新的开发团队",
        description: "负责新产品开发",
        primaryAgentSlug: null,
        memberOrder: [],
      },
      status: "unfinished-draft",
      canCreateConversation: false,
      issues: [],
    });
    await expect(readTeamSnapshot(draft.location)).resolves.toMatchObject({
      status: "unfinished-draft",
      canCreateConversation: false,
    });

    const first = await addTeamMember(draft.location);
    expect(first.member).toMatchObject({
      slug: "agent",
      displayName: "新 Agent",
      description: "描述这个 Agent 负责什么。",
    });
    expect(first.team).toMatchObject({
      definition: { primaryAgentSlug: "agent", memberOrder: ["agent"] },
      status: "usable",
      canCreateConversation: true,
    });
  });

  it("keeps member slugs stable when display names change and gives later members unique slugs", async () => {
    const dataRoot = await makeDataRoot();
    const draft = await createUserTeam(dataRoot, { name: "写作团队", description: "负责内容" });
    const first = await addTeamMember(draft.location);
    await writeMemberAgentMarkdown(draft.location, first.member.slug, "# 主编\n\n负责内容方向\n");

    const renamed = await readTeamSnapshot(draft.location);
    expect(renamed.definition).toMatchObject({ primaryAgentSlug: "agent", memberOrder: ["agent"] });
    expect(renamed.members[0]).toMatchObject({ slug: "agent", displayName: "主编" });

    const second = await addTeamMember(draft.location);
    expect(second.member.slug).toBe("agent-2");
    expect(second.team.definition).toMatchObject({
      primaryAgentSlug: "agent",
      memberOrder: ["agent", "agent-2"],
    });
  });

  it("updates only team name and description without changing members or the primary Agent", async () => {
    const dataRoot = await makeDataRoot();
    const draft = await createUserTeam(dataRoot, { name: "旧名称", description: "旧描述" });
    const first = await addTeamMember(draft.location);

    const updated = await updateTeamInformation(draft.location, { name: "新名称", description: "新描述" });

    expect(updated.definition).toEqual({
      name: "新名称",
      description: "新描述",
      primaryAgentSlug: first.member.slug,
      memberOrder: [first.member.slug],
    });
    expect(updated.members.map((member) => member.slug)).toEqual([first.member.slug]);
  });

  it("marks missing AGENT.md as needing repair and clears the state after restoration", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "repairable", ownership: "user" });
    await writeTeamDefinition(location, { ...usableDefinition, memberOrder: ["manager"] });

    const broken = await readTeamSnapshot(location);
    expect(broken.status).toBe("needs-repair");
    expect(broken.issues).toMatchObject([{ code: "member-agent-missing", slug: "manager" }]);

    await writeMemberAgentMarkdown(location, "manager", "# 开发经理\n\n默认接单\n");
    await expect(readTeamSnapshot(location)).resolves.toMatchObject({
      status: "usable",
      canCreateConversation: true,
      issues: [],
    });
  });

  it("marks duplicate and missing slugs from externally edited team.json as needing repair", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "broken-slugs", ownership: "user" });
    await fs.mkdir(location.directory, { recursive: true });
    await fs.writeFile(
      path.join(location.directory, "team.json"),
      JSON.stringify({ ...usableDefinition, primaryAgentSlug: null, memberOrder: ["developer", "", "developer"] }),
      "utf8",
    );
    await writeMemberAgentMarkdown(location, "developer", "# 开发\n\n负责实现\n");

    const snapshot = await readTeamSnapshot(location);

    expect(snapshot.status).toBe("needs-repair");
    expect(snapshot.issues.map((issue) => issue.code)).toEqual(["member-slug-missing", "member-slug-duplicate"]);
  });

  it("represents a missing team directory as needing repair", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "moved-team", ownership: "user" });

    await expect(readTeamSnapshot(location)).resolves.toMatchObject({
      status: "needs-repair",
      canCreateConversation: false,
      issues: [{ code: "team-directory-missing" }],
    });
  });
});

async function makeDataRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-team-store-"));
  temporaryRoots.push(root);
  return root;
}

async function readFileTree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else {
        result[path.relative(root, absolutePath)] = await fs.readFile(absolutePath, "utf8");
      }
    }
  };
  await visit(root);
  return result;
}
