import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

describe("AgentTeamsPage file manager actions", () => {
  it("keeps team and member actions inside their More menus and opens the matching locations", async () => {
    const onOpenLocation = vi.fn().mockResolvedValue(undefined);
    render(<LocationHarness team={copiedTeam} onOpenLocation={onOpenLocation} fileManagerActionLabel="在 Finder 中打开" />);

    fireEvent.click(screen.getByTestId("agent-team-row"));
    expect(screen.queryByRole("menuitem", { name: "在 Finder 中打开" })).not.toBeInTheDocument();

    await openMenu("开发团队更多操作");
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "在 Finder 中打开" }));
    await waitFor(() => expect(onOpenLocation).toHaveBeenCalledWith("user:development-copy", undefined));

    await openMenu("开发经理更多操作");
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "在 Finder 中打开" }));
    await waitFor(() => expect(onOpenLocation).toHaveBeenCalledWith("user:development-copy", "manager"));
  });

  it("uses the Windows label supplied by the desktop and keeps built-in content read-only", async () => {
    const onOpenLocation = vi.fn().mockResolvedValue(undefined);
    render(<LocationHarness
      team={builtInTeam}
      onOpenLocation={onOpenLocation}
      fileManagerActionLabel="在文件资源管理器中显示"
    />);

    fireEvent.click(screen.getByTestId("agent-team-row"));
    expect(screen.getByText("内置团队")).toBeVisible();
    expect(screen.getByText("只读")).toBeVisible();
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
    expect(screen.queryByText("复制 Agent")).not.toBeInTheDocument();
    expect(screen.queryByText("删除 Agent")).not.toBeInTheDocument();

    await openMenu("开发团队更多操作");
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "在文件资源管理器中显示" }));
    await waitFor(() => expect(onOpenLocation).toHaveBeenCalledWith("system:development", undefined));

    await openMenu("开发经理更多操作");
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "在文件资源管理器中显示" }));
    await waitFor(() => expect(onOpenLocation).toHaveBeenCalledWith("system:development", "manager"));
  });

  it("shows a plain-language error without exposing the underlying system error", async () => {
    const onOpenLocation = vi.fn().mockRejectedValue(new Error("EACCES /private/internal/path"));
    render(<LocationHarness team={copiedTeam} onOpenLocation={onOpenLocation} fileManagerActionLabel="在文件管理器中打开" />);

    fireEvent.click(screen.getByTestId("agent-team-row"));
    await openMenu("开发经理更多操作");
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "在文件管理器中打开" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("暂时无法打开这个位置");
    expect(alert).toHaveTextContent("检查访问权限后重试");
    expect(alert).not.toHaveTextContent(/EACCES|private|internal/u);
  });

  it("opens an unfinished empty team's directory without exposing a member action", async () => {
    const onOpenLocation = vi.fn().mockResolvedValue(undefined);
    render(
      <AgentTeamsPage
        state={{ status: "ready", teams: [emptyDraftTeam] }}
        detailState={emptyDraftDetailState}
        useStackedRows={false}
        onOpenTeam={() => undefined}
        onAddMember={() => undefined}
        fileManagerActionLabel="在 Finder 中打开"
        onOpenLocation={onOpenLocation}
        onBack={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId("agent-team-row"));
    expect(screen.getByRole("button", { name: "添加第一个 Agent" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /更多操作/u })).toHaveLength(1);

    await openMenu("草稿团队更多操作");
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "在 Finder 中打开" }));

    await waitFor(() => expect(onOpenLocation).toHaveBeenCalledWith("user:draft", undefined));
  });
});

function LocationHarness({
  team,
  fileManagerActionLabel,
  onOpenLocation,
}: {
  team: OperatorAgentTeam;
  fileManagerActionLabel: string;
  onOpenLocation(teamKey: string, memberSlug?: string): Promise<void>;
}): JSX.Element {
  return (
    <AgentTeamsPage
      state={{ status: "ready", teams: [team] }}
      detailState={detailStateFor(team.teamKey)}
      useStackedRows={false}
      onOpenTeam={() => undefined}
      onSelectMember={() => undefined}
      onChangeMember={() => undefined}
      onSaveMember={() => undefined}
      onRetryMember={() => undefined}
      onDiscardMember={() => undefined}
      onDiscardAll={() => undefined}
      onSaveAll={async () => ({ failures: [] })}
      onDuplicateBuiltInTeam={async () => copiedTeam.teamKey}
      fileManagerActionLabel={fileManagerActionLabel}
      onOpenLocation={onOpenLocation}
      onBack={() => undefined}
    />
  );
}

async function openMenu(triggerName: string): Promise<void> {
  fireEvent.keyDown(screen.getByRole("button", { name: triggerName }), { key: "ArrowDown" });
  await screen.findByRole("menu");
}

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

const emptyDraftTeam: OperatorAgentTeam = {
  teamKey: "user:draft",
  id: "draft",
  ownership: "user",
  name: "草稿团队",
  description: "等待添加第一名 Agent",
  primaryAgentSlug: null,
  memberOrder: [],
  members: [],
  status: "unfinished-draft",
  canCreateConversation: false,
};

const emptyDraftDetailState: AgentTeamDetailState = {
  teamKey: emptyDraftTeam.teamKey,
  selectedMemberSlug: null,
  memberEditors: {},
  saveAllFailures: [],
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
