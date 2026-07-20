import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkAgentTeamMemberExternalChange } from "../src/team-external-change.js";
import { getMemberAgentPath, resolveTeamLocation } from "../src/team-store.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("Agent team external AGENT.md change detection", () => {
  it("checks only the requested user-team AGENT.md", async () => {
    const dataRoot = await makeDataRoot();
    const location = resolveTeamLocation({ dataRoot, teamId: "my-team", ownership: "user" });
    const agentFile = getMemberAgentPath(location, "manager");
    const referencedFile = path.join(location.directory, "members", "manager", "notes.md");
    const original = "# 开发经理\n\n负责推进，参考 notes.md。\n";
    await fs.mkdir(path.dirname(agentFile), { recursive: true });
    await fs.writeFile(agentFile, original, "utf8");
    await fs.writeFile(referencedFile, "第一版\n", "utf8");

    const request = {
      teamId: "my-team",
      ownership: "user" as const,
      memberSlug: "manager",
      knownAgentMarkdown: original,
    };
    await fs.writeFile(referencedFile, "外部更新，但不应触发\n", "utf8");
    await expect(checkAgentTeamMemberExternalChange(dataRoot, request)).resolves.toEqual({ status: "unchanged" });

    const external = "# 新开发经理\n\n外部更新的职责。\n";
    await fs.writeFile(agentFile, external, "utf8");
    await expect(checkAgentTeamMemberExternalChange(dataRoot, request)).resolves.toEqual({
      status: "changed",
      document: {
        slug: "manager",
        displayName: "新开发经理",
        description: "外部更新的职责。",
        agentMarkdown: external,
      },
    });
  });

  it("ignores built-in teams without reading or exposing an updated state", async () => {
    const dataRoot = await makeDataRoot();

    await expect(checkAgentTeamMemberExternalChange(dataRoot, {
      teamId: "development",
      ownership: "system",
      memberSlug: "manager",
      knownAgentMarkdown: "# old\n",
    })).resolves.toEqual({ status: "ignored" });
  });
});

async function makeDataRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-team-external-change-"));
  temporaryRoots.push(root);
  return root;
}
