import { describe, expect, it } from "vitest";
import {
  evaluateTeamStatus,
  parseAgentMarkdownIdentity,
  parseTeamDefinitionJson,
  serializeTeamDefinition,
  type TeamDefinition,
} from "../src/team-model.js";

const usableDefinition: TeamDefinition = {
  name: "开发团队",
  description: "负责软件开发任务",
  primaryAgentSlug: "manager",
  memberOrder: ["manager", "developer"],
};

describe("team model", () => {
  it("round-trips only team identity, primary slug, and member order", () => {
    const encoded = serializeTeamDefinition(usableDefinition);

    expect(JSON.parse(encoded)).toEqual(usableDefinition);
    expect(encoded).not.toContain("displayName");
    expect(parseTeamDefinitionJson(encoded)).toEqual(usableDefinition);
  });

  it("rejects member summary fields in team.json", () => {
    expect(() =>
      parseTeamDefinitionJson(
        JSON.stringify({
          ...usableDefinition,
          members: [{ slug: "manager", displayName: "开发经理" }],
        }),
      ),
    ).toThrow(/unsupported field: members/);
  });

  it("parses display name and one-line description from AGENT.md after optional frontmatter", () => {
    expect(
      parseAgentMarkdownIdentity(`---\nworkspaceAccess: write\n---\n\n# 开发经理\n\n默认接单并组织团队推进\n\n## 规则\n更多内容`),
    ).toEqual({
      displayName: "开发经理",
      description: "默认接单并组织团队推进",
    });
  });

  it("does not make missing identity prose a structural failure", () => {
    expect(parseAgentMarkdownIdentity("没有一级标题，但仍然是可读的自然语言内容")).toEqual({
      displayName: "",
      description: "",
    });
    expect(evaluateTeamStatus({ definition: usableDefinition })).toMatchObject({ status: "usable" });
  });

  it("marks a valid single-member team usable", () => {
    expect(
      evaluateTeamStatus({
        definition: { ...usableDefinition, memberOrder: ["manager"] },
      }),
    ).toEqual({ status: "usable", canCreateConversation: true, issues: [] });
  });

  it("marks a team without a primary agent as an unfinished draft", () => {
    expect(
      evaluateTeamStatus({
        definition: { ...usableDefinition, primaryAgentSlug: null, memberOrder: [] },
      }),
    ).toEqual({ status: "unfinished-draft", canCreateConversation: false, issues: [] });
  });

  it("normalizes an empty primary slug from disk to the no-primary draft shape", () => {
    const definition = parseTeamDefinitionJson(JSON.stringify({ ...usableDefinition, primaryAgentSlug: "" }));

    expect(definition.primaryAgentSlug).toBeNull();
    expect(evaluateTeamStatus({ definition }).status).toBe("unfinished-draft");
  });

  it("prioritizes repair over draft when slugs are missing or duplicated", () => {
    const result = evaluateTeamStatus({
      definition: {
        ...usableDefinition,
        primaryAgentSlug: null,
        memberOrder: ["developer", "", "developer"],
      },
    });

    expect(result.status).toBe("needs-repair");
    expect(result.canCreateConversation).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(["member-slug-missing", "member-slug-duplicate"]);
  });

  it("marks a primary agent outside the current members as needing repair", () => {
    expect(
      evaluateTeamStatus({
        definition: { ...usableDefinition, primaryAgentSlug: "reviewer" },
      }),
    ).toMatchObject({
      status: "needs-repair",
      canCreateConversation: false,
      issues: [{ code: "primary-agent-not-member", slug: "reviewer" }],
    });
  });
});
