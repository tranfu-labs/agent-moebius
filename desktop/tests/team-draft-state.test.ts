import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_AGENT_TEAM_DRAFT_STATE,
  failAgentTeamMemberSave,
  finishAgentTeamMemberLoad,
  finishAgentTeamMemberSave,
  getAgentTeamMemberDraft,
  getDirtyAgentTeamMemberSlugs,
  isAgentTeamMemberDirty,
  saveAllAgentTeamDrafts,
  startAgentTeamMemberSave,
  updateAgentTeamMemberDraft,
} from "../src/console-page/team-state.js";

const teamKey = "user:development";

describe("Agent team per-member draft state", () => {
  it("keeps independent drafts for multiple members while the selection changes elsewhere", () => {
    let state = loadMember(EMPTY_AGENT_TEAM_DRAFT_STATE, "manager", "# 经理\n\n负责推进\n");
    state = loadMember(state, "dev", "# 开发\n\n负责实现\n");
    state = updateAgentTeamMemberDraft(state, teamKey, "manager", "# 经理\n\n负责方案与推进\n");
    state = updateAgentTeamMemberDraft(state, teamKey, "dev", "# 开发\n\n负责实现与自测\n");

    expect(getAgentTeamMemberDraft(state, teamKey, "manager")?.draftMarkdown).toContain("方案与推进");
    expect(getAgentTeamMemberDraft(state, teamKey, "dev")?.draftMarkdown).toContain("实现与自测");
    expect(getDirtyAgentTeamMemberSlugs(state, teamKey)).toEqual(["manager", "dev"]);
  });

  it("clears only the saved member and retains content plus the reason when another save fails", () => {
    let state = loadDirtyMembers();
    state = startAgentTeamMemberSave(state, teamKey, "manager");
    state = finishAgentTeamMemberSave(state, teamKey, "manager", "# 经理\n\n新职责\n");
    state = startAgentTeamMemberSave(state, teamKey, "dev");
    state = failAgentTeamMemberSave(state, teamKey, "dev", "磁盘空间不足");

    expect(isAgentTeamMemberDirty(getAgentTeamMemberDraft(state, teamKey, "manager"))).toBe(false);
    expect(getAgentTeamMemberDraft(state, teamKey, "dev")).toMatchObject({
      draftMarkdown: "# 开发\n\n新职责\n",
      saveStatus: "failed",
      saveError: "磁盘空间不足",
    });
  });

  it("saves all drafts sequentially and commits successes when a later member fails", async () => {
    const transitions: string[][] = [];
    const saveMember = vi.fn(async (memberSlug: string, markdown: string) => {
      if (memberSlug === "dev") {
        throw new Error("文件被占用");
      }
      return markdown;
    });

    const result = await saveAllAgentTeamDrafts({
      state: loadDirtyMembers(),
      teamKey,
      saveMember,
      onTransition: (state) => transitions.push(getDirtyAgentTeamMemberSlugs(state, teamKey)),
    });

    expect(saveMember.mock.calls.map(([memberSlug]) => memberSlug)).toEqual(["manager", "dev"]);
    expect(result.failures).toEqual([{ memberSlug: "dev", reason: "文件被占用" }]);
    expect(isAgentTeamMemberDirty(getAgentTeamMemberDraft(result.state, teamKey, "manager"))).toBe(false);
    expect(getAgentTeamMemberDraft(result.state, teamKey, "dev")).toMatchObject({
      draftMarkdown: "# 开发\n\n新职责\n",
      saveStatus: "failed",
      saveError: "文件被占用",
    });
    expect(transitions.at(-1)).toEqual(["dev"]);
  });

  it("preserves edits made after a save began instead of clearing the newer draft", () => {
    let state = loadMember(EMPTY_AGENT_TEAM_DRAFT_STATE, "manager", "# 经理\n\n旧职责\n");
    state = updateAgentTeamMemberDraft(state, teamKey, "manager", "# 经理\n\n准备保存\n");
    state = startAgentTeamMemberSave(state, teamKey, "manager");
    state = updateAgentTeamMemberDraft(state, teamKey, "manager", "# 经理\n\n保存期间继续编辑\n");
    state = finishAgentTeamMemberSave(state, teamKey, "manager", "# 经理\n\n准备保存\n");

    const member = getAgentTeamMemberDraft(state, teamKey, "manager");
    expect(member?.draftMarkdown).toContain("保存期间继续编辑");
    expect(isAgentTeamMemberDirty(member)).toBe(true);
  });

  it("does not issue a duplicate write for a member that is already saving", async () => {
    let state = loadDirtyMembers();
    state = startAgentTeamMemberSave(state, teamKey, "manager");
    const saveMember = vi.fn(async (_memberSlug: string, markdown: string) => markdown);

    const result = await saveAllAgentTeamDrafts({ state, teamKey, saveMember });

    expect(saveMember.mock.calls.map(([memberSlug]) => memberSlug)).toEqual(["dev"]);
    expect(result.failures).toContainEqual({
      memberSlug: "manager",
      reason: "该成员仍在保存，请稍后重试。",
    });
  });
});

function loadMember(
  state: typeof EMPTY_AGENT_TEAM_DRAFT_STATE,
  memberSlug: string,
  markdown: string,
): typeof EMPTY_AGENT_TEAM_DRAFT_STATE {
  return finishAgentTeamMemberLoad(state, teamKey, memberSlug, markdown);
}

function loadDirtyMembers(): typeof EMPTY_AGENT_TEAM_DRAFT_STATE {
  let state = loadMember(EMPTY_AGENT_TEAM_DRAFT_STATE, "manager", "# 经理\n\n旧职责\n");
  state = loadMember(state, "dev", "# 开发\n\n旧职责\n");
  state = updateAgentTeamMemberDraft(state, teamKey, "manager", "# 经理\n\n新职责\n");
  return updateAgentTeamMemberDraft(state, teamKey, "dev", "# 开发\n\n新职责\n");
}
