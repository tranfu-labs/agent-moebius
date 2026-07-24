import { describe, expect, it } from "vitest";
import type { AgentTeamListItem } from "../src/team-ipc.js";
import {
  finishAgentTeamMemberLoad,
  getAgentTeamKey,
  removeAgentTeamDrafts,
  removeAgentTeamMemberDraft,
  reconcileAgentTeamSelection,
  updateAgentTeamMemberDraft,
} from "../src/console-page/team-state.js";

const builtInTeam = team({
  id: "development",
  ownership: "system",
  primaryAgentSlug: "manager",
  memberSlugs: ["manager", "dev"],
});
const userTeam = team({
  id: "development",
  ownership: "user",
  primaryAgentSlug: "lead",
  memberSlugs: ["lead", "qa"],
});

describe("Agent team page selection", () => {
  it("uses ownership and id together so built-in and user team ids cannot collide", () => {
    expect(getAgentTeamKey(builtInTeam)).toBe("system:development");
    expect(getAgentTeamKey(userTeam)).toBe("user:development");
  });

  it("selects the first team's primary Agent after initial loading", () => {
    expect(reconcileAgentTeamSelection([builtInTeam, userTeam], null)).toEqual({
      teamKey: "system:development",
      memberSlug: "manager",
    });
  });

  it("preserves a still-valid team and member selection across reloads", () => {
    expect(reconcileAgentTeamSelection([builtInTeam, userTeam], {
      teamKey: "user:development",
      memberSlug: "qa",
    })).toEqual({ teamKey: "user:development", memberSlug: "qa" });
  });

  it("falls back deterministically when a selected team or member disappears", () => {
    expect(reconcileAgentTeamSelection([builtInTeam], {
      teamKey: "user:development",
      memberSlug: "qa",
    })).toEqual({ teamKey: "system:development", memberSlug: "manager" });
    expect(reconcileAgentTeamSelection([userTeam], {
      teamKey: "user:development",
      memberSlug: "removed",
    })).toEqual({ teamKey: "user:development", memberSlug: "lead" });
    expect(reconcileAgentTeamSelection([], {
      teamKey: "system:development",
      memberSlug: "manager",
    })).toBeNull();
  });

  it("removes deleted member and team drafts so stale unsaved content cannot block later operations", () => {
    const teamKey = "user:development";
    let state = finishAgentTeamMemberLoad({ membersByKey: {} }, teamKey, "lead", "# Lead\n");
    state = finishAgentTeamMemberLoad(state, teamKey, "qa", "# QA\n");
    state = updateAgentTeamMemberDraft(state, teamKey, "qa", "# QA changed\n");

    const withoutMember = removeAgentTeamMemberDraft(state, teamKey, "qa");
    expect(Object.values(withoutMember.membersByKey).map((member) => member.memberSlug)).toEqual(["lead"]);
    expect(removeAgentTeamDrafts(withoutMember, teamKey)).toEqual({ membersByKey: {} });
  });
});

function team(input: {
  id: string;
  ownership: "system" | "user";
  primaryAgentSlug: string | null;
  memberSlugs: string[];
}): AgentTeamListItem {
  return {
    id: input.id,
    ownership: input.ownership,
    definition: {
      name: input.id,
      description: "description",
      primaryAgentSlug: input.primaryAgentSlug,
      memberOrder: input.memberSlugs,
      relayBeats: input.memberSlugs.map((speakerSlug) => ({ speakerSlug, message: `${speakerSlug} 工作` })),
    },
    members: input.memberSlugs.map((slug) => ({ slug, displayName: slug, description: "" })),
    status: input.primaryAgentSlug === null ? "unfinished-draft" : "usable",
    canCreateConversation: input.primaryAgentSlug !== null,
    issues: [],
  };
}
