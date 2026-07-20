import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serializeTeamDefinition, type TeamDefinition } from "../src/team-model.js";
import {
  listRecordedUserTeamSnapshots,
  relocateUserTeamRecord,
  removeUserTeamRecord,
  resolveRecordedTeamLocation,
} from "../src/team-record-store.js";
import { resolveTeamLocation } from "../src/team-store.js";

const temporaryRoots: string[] = [];
const definition: TeamDefinition = {
  name: "开发团队",
  description: "负责软件开发任务",
  primaryAgentSlug: "manager",
  memberOrder: ["manager"],
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("user team application records", () => {
  it("keeps a renamed team visible, rejects a different team, and relinks the matching valid location", async () => {
    const dataRoot = await makeDataRoot();
    const original = resolveTeamLocation({ dataRoot, teamId: "my-team", ownership: "user" });
    await createTeamDirectory(original.directory, definition, "# 开发经理\n\n默认接单\n");

    const [recorded] = await listRecordedUserTeamSnapshots(dataRoot);
    expect(recorded?.snapshot.status).toBe("usable");

    const renamedDirectory = path.join(dataRoot, "teams", "renamed-team");
    await fs.rename(original.directory, renamedDirectory);
    const [missing] = await listRecordedUserTeamSnapshots(dataRoot);
    expect(missing).toMatchObject({
      record: {
        id: "my-team",
        directoryName: "my-team",
        lastKnownDefinition: definition,
      },
      snapshot: {
        status: "needs-repair",
        canCreateConversation: false,
        issues: [{ code: "team-directory-missing" }],
      },
    });

    const differentDirectory = path.join(dataRoot, "teams", "different-team");
    await createTeamDirectory(differentDirectory, { ...definition, name: "另一支团队" }, "# 另一位经理\n\n接其他任务\n");
    await expect(relocateUserTeamRecord({
      dataRoot,
      teamId: "my-team",
      directory: differentDirectory,
    })).rejects.toMatchObject({
      code: "TEAM_RELOCATION_REJECTED",
      message: expect.stringContaining("与原记录不一致"),
    });
    await expect(resolveRecordedTeamLocation(dataRoot, "my-team")).resolves.toMatchObject({
      directory: original.directory,
    });

    await expect(relocateUserTeamRecord({
      dataRoot,
      teamId: "my-team",
      directory: renamedDirectory,
    })).resolves.toMatchObject({ status: "usable", canCreateConversation: true });
    await expect(resolveRecordedTeamLocation(dataRoot, "my-team")).resolves.toMatchObject({
      id: "my-team",
      directory: renamedDirectory,
    });
  });

  it("removes only the invalid application record and leaves team files and session history untouched", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "broken-team", ownership: "user" });
    await createTeamDirectory(location.directory, definition, "# 开发经理\n\n默认接单\n");
    await listRecordedUserTeamSnapshots(dataRoot);
    await fs.writeFile(path.join(location.directory, "team.json"), serializeTeamDefinition({
      ...definition,
      memberOrder: ["manager", "manager"],
    }), "utf8");
    const teamFilesBefore = await readFileTree(location.directory);
    const sessionHistory = path.join(dataRoot, ".state", "local-console.sqlite");
    await fs.mkdir(path.dirname(sessionHistory), { recursive: true });
    await fs.writeFile(sessionHistory, "session-history-sentinel", "utf8");

    await removeUserTeamRecord({ dataRoot, teamId: "broken-team" });

    expect(await readFileTree(location.directory)).toEqual(teamFilesBefore);
    expect(await fs.readFile(sessionHistory, "utf8")).toBe("session-history-sentinel");
    await expect(listRecordedUserTeamSnapshots(dataRoot)).resolves.toEqual([]);
  });

  it("automatically clears repair after a missing AGENT.md is restored and records are rechecked", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "repairable", ownership: "user" });
    await createTeamDirectory(location.directory, definition, "# 开发经理\n\n默认接单\n");
    await listRecordedUserTeamSnapshots(dataRoot);
    const agentFile = path.join(location.directory, "members", "manager", "AGENT.md");
    await fs.rm(agentFile);

    await expect(listRecordedUserTeamSnapshots(dataRoot)).resolves.toMatchObject([
      { snapshot: { status: "needs-repair", canCreateConversation: false } },
    ]);

    await fs.writeFile(agentFile, "# 开发经理\n\n默认接单\n", "utf8");
    await expect(listRecordedUserTeamSnapshots(dataRoot)).resolves.toMatchObject([
      { snapshot: { status: "usable", canCreateConversation: true, issues: [] } },
    ]);
  });
});

async function makeDataRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-team-record-"));
  temporaryRoots.push(root);
  return root;
}

async function createTeamDirectory(directory: string, teamDefinition: TeamDefinition, markdown: string): Promise<void> {
  await fs.mkdir(path.join(directory, "members", "manager"), { recursive: true });
  await fs.writeFile(path.join(directory, "team.json"), serializeTeamDefinition(teamDefinition), "utf8");
  await fs.writeFile(path.join(directory, "members", "manager", "AGENT.md"), markdown, "utf8");
}

async function readFileTree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
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
