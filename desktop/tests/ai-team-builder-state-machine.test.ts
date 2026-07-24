import { describe, expect, it } from "vitest";
import {
  acceptAiTeamBuilderProposal,
  beginAiTeamBuilderCommit,
  beginAiTeamBuilderTurn,
  createAiTeamBuilderDraft,
} from "../src/ai-team-builder/state-machine.js";

const proposal = {
  team: { name: "团队", purpose: "用途" },
  members: [
    {
      slug: "lead",
      name: "负责人",
      role: "负责收尾",
      responsibilities: ["拆解"],
      handoffs: ["writer"],
    },
    {
      slug: "writer",
      name: "作者",
      role: "负责内容",
      responsibilities: ["写作"],
      handoffs: ["lead"],
    },
  ],
  primaryAgentSlug: "lead",
  relayBeats: [{ speakerSlug: "lead", message: "派工" }],
};

describe("AI team builder state machine", () => {
  it("accepts only the current proposal revision for commit", () => {
    const running = beginAiTeamBuilderTurn(createAiTeamBuilderDraft("draft"), "目标", {
      appendUserMessage: true,
    });
    const current = acceptAiTeamBuilderProposal(running, proposal, "thread");

    expect(() => beginAiTeamBuilderCommit(current, 0)).toThrowError(
      expect.objectContaining({ staleCode: "AI_TEAM_BUILDER_STALE_REVISION" }),
    );
    expect(beginAiTeamBuilderCommit(current, 1)).toMatchObject({
      phase: "committing",
      proposalRevision: 1,
    });
  });
});
