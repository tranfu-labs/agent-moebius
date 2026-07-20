import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { type AgentTeamDetailState } from "./agent-team-detail";
import { AgentTeamsPage, type OperatorAgentTeam, type OperatorAgentTeamsState } from "./agent-teams-page";

describe("AgentTeamsPage built-in duplication", () => {
  it("opens the copied user team detail after the whole-team operation succeeds", async () => {
    const onDuplicate = vi.fn();
    render(<DuplicateTeamHarness onDuplicate={onDuplicate} />);

    fireEvent.click(screen.getByTestId("agent-team-row"));
    expect(screen.getByTestId("agent-team-detail-view")).toHaveAttribute("data-team-key", builtInTeam.teamKey);
    expect(screen.getByText("内置团队")).toBeVisible();
    expect(screen.getByText("只读")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "复制并编辑" }));

    await waitFor(() => expect(screen.getByTestId("agent-team-detail-view"))
      .toHaveAttribute("data-team-key", copiedTeam.teamKey));
    expect(onDuplicate).toHaveBeenCalledWith(builtInTeam.teamKey);
    expect(screen.getByText("用户团队")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "开发经理 AGENT.md" })).not.toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "复制并编辑" })).not.toBeInTheDocument();
  });
});

function DuplicateTeamHarness({ onDuplicate }: { onDuplicate(teamKey: string): void }): JSX.Element {
  const [teamsState, setTeamsState] = useState<OperatorAgentTeamsState>({ status: "ready", teams: [builtInTeam] });
  const [detailTeamKey, setDetailTeamKey] = useState(builtInTeam.teamKey);

  return (
    <AgentTeamsPage
      state={teamsState}
      detailState={detailStateFor(detailTeamKey)}
      useStackedRows={false}
      onOpenTeam={setDetailTeamKey}
      onSelectMember={() => undefined}
      onChangeMember={() => undefined}
      onSaveMember={() => undefined}
      onRetryMember={() => undefined}
      onDiscardMember={() => undefined}
      onDiscardAll={() => undefined}
      onSaveAll={async () => ({ failures: [] })}
      onDuplicateBuiltInTeam={async (teamKey) => {
        onDuplicate(teamKey);
        setTeamsState({ status: "ready", teams: [builtInTeam, copiedTeam] });
        setDetailTeamKey(copiedTeam.teamKey);
        return copiedTeam.teamKey;
      }}
      onBack={() => undefined}
    />
  );
}

const builtInTeam: OperatorAgentTeam = {
  teamKey: "system:development",
  id: "development",
  ownership: "system",
  name: "开发团队",
  description: "负责软件方案、实现和验收",
  primaryAgentSlug: "manager",
  memberOrder: ["manager"],
  members: [{ slug: "manager", displayName: "开发经理", description: "默认接单" }],
  status: "usable",
  canCreateConversation: true,
};

const copiedTeam: OperatorAgentTeam = {
  ...builtInTeam,
  teamKey: "user:development-copy",
  id: "development-copy",
  ownership: "user",
};

function detailStateFor(teamKey: string): AgentTeamDetailState {
  return {
    teamKey,
    selectedMemberSlug: "manager",
    memberEditors: {
      manager: {
        memberSlug: "manager",
        loadStatus: "ready",
        loadError: null,
        draftMarkdown: "# 开发经理\n\n默认接单\n",
        isDirty: false,
        saveStatus: "idle",
        saveError: null,
        displayName: "开发经理",
        description: "默认接单",
      },
    },
    saveAllFailures: [],
  };
}
