import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serializeTeamDefinition, type TeamDefinition } from "../src/team-model.js";
import {
  BuiltInTeamReadOnlyError,
  determineTeamOwnership,
  getSystemTeamsRoot,
  getTeamsRoot,
  listTeamLocations,
  readTeamSnapshot,
  resolveTeamLocation,
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
