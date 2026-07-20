import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AgentTeamDetail,
  type AgentTeamDetailProps,
  type AgentTeamMemberEditorState,
} from "./agent-team-detail";

describe("AgentTeamDetail", () => {
  it("renders a flat horizontal member selector and switches the editor in place", () => {
    const onSelectMember = vi.fn();
    renderDetail({ onSelectMember });

    expect(screen.getByRole("heading", { name: "开发团队" })).toBeVisible();
    const selector = screen.getByTestId("agent-team-member-selector");
    expect(selector).toHaveClass("flex-nowrap", "overflow-x-auto");
    expect(within(selector).getAllByRole("tab")).toHaveLength(3);
    expect(within(selector).getByRole("tab", { name: /开发经理/u })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(within(selector).getByRole("tab", { name: "测试" }));
    expect(onSelectMember).toHaveBeenCalledWith("qa");
    expect(screen.queryByRole("link", { name: "测试" })).not.toBeInTheDocument();
  });

  it("gives an unfinished draft a useful empty state and adds the first Agent in the current detail", async () => {
    const onAddMember = vi.fn().mockResolvedValue(undefined);
    const props = detailProps({ onAddMember });
    render(<AgentTeamDetail
      {...props}
      team={{ ...props.team, primaryAgentSlug: null, memberOrder: [], members: [] }}
      state={{ ...props.state, selectedMemberSlug: null, memberEditors: {} }}
    />);

    expect(screen.getByText("还没有团队成员")).toBeVisible();
    expect(screen.getByText("添加第一个 Agent 来接收任务，成功后它会自动成为主 Agent。")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "添加第一个 Agent" }));
    await waitFor(() => expect(onAddMember).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Add Agent beside the member selector once a team already has members", async () => {
    const onAddMember = vi.fn().mockResolvedValue(undefined);
    renderDetail({ onAddMember });

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    await waitFor(() => expect(onAddMember).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "添加 Agent" })).toBeEnabled());
  });

  it("shows per-member dirty markers and saves only the current member with Command/Ctrl+S", () => {
    const onChangeMember = vi.fn();
    const onSaveMember = vi.fn();
    renderDetail({ onChangeMember, onSaveMember });

    replaceEditorText(
      screen.getByRole("textbox", { name: "开发经理 AGENT.md" }),
      "# 开发经理\n\n新的职责\n",
    );
    expect(onChangeMember).toHaveBeenCalledWith("manager", "# 开发经理\n\n新的职责\n");

    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(onSaveMember).toHaveBeenCalledTimes(1);
    expect(onSaveMember).toHaveBeenCalledWith("manager");
    expect(screen.getAllByLabelText("未保存")).toHaveLength(1);
  });

  it("keeps the user primary Agent selector visible, saves immediately, and preserves member drafts after reordering", () => {
    const onChangePrimaryAgent = vi.fn();
    const onSaveMember = vi.fn();
    const onChangeMember = vi.fn();
    const props = detailProps({
      onChangePrimaryAgent,
      onSaveMember,
      onChangeMember,
      state: stateWith(managerEditor({
        draftMarkdown: "# 开发经理\n\n下一步交给 @dev。\n",
      })),
    });
    const { rerender } = render(<AgentTeamDetail {...props} />);

    const selector = screen.getByRole("combobox", { name: "主 Agent" });
    expect(selector).toHaveValue("manager");
    expect(within(selector).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual([
      "manager",
      "dev",
      "qa",
    ]);
    fireEvent.change(selector, { target: { value: "dev" } });
    expect(onChangePrimaryAgent).toHaveBeenCalledWith("dev");
    expect(onSaveMember).not.toHaveBeenCalled();
    expect(onChangeMember).not.toHaveBeenCalled();

    rerender(<AgentTeamDetail
      {...props}
      team={{ ...props.team, primaryAgentSlug: "dev" }}
      state={{ ...props.state, primaryAgentChangeStatus: "saved" }}
    />);
    const tabs = within(screen.getByTestId("agent-team-member-selector")).getAllByRole("tab");
    expect(tabs[0]).toHaveTextContent("开发· 主 Agent");
    expect(screen.getByRole("button", { name: "开发，复制 @dev" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "开发经理 AGENT.md" }))
      .toHaveAttribute("data-raw-markdown", "# 开发经理\n\n下一步交给 @dev。\n");
    expect(screen.getAllByLabelText("未保存")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("已保存");
  });

  it("shows primary Agent progress and errors without exposing a selector for built-in teams", () => {
    const props = detailProps();
    const { rerender } = render(<AgentTeamDetail
      {...props}
      state={{ ...props.state, primaryAgentChangeStatus: "saving" }}
    />);
    expect(screen.getByRole("combobox", { name: "主 Agent" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("正在保存");

    rerender(<AgentTeamDetail
      {...props}
      state={{
        ...props.state,
        primaryAgentChangeStatus: "failed",
        primaryAgentChangeError: "磁盘暂时不可写",
      }}
    />);
    expect(screen.getByRole("alert")).toHaveTextContent("切换失败：磁盘暂时不可写");

    rerender(<AgentTeamDetail {...props} team={{ ...props.team, ownership: "system" }} />);
    expect(screen.queryByRole("combobox", { name: "主 Agent" })).not.toBeInTheDocument();
    expect(screen.getByText("内置团队")).toBeVisible();
  });

  it("disables duplicate saves while saving and retains a failed draft with retry", () => {
    const onSaveMember = vi.fn();
    const { rerender } = renderDetail({
      onSaveMember,
      state: stateWith(managerEditor({ saveStatus: "saving" })),
    });

    expect(screen.getByRole("status")).toHaveTextContent("正在保存");
    expect(screen.getByRole("button", { name: "正在保存" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "开发经理 AGENT.md" }))
      .toHaveAttribute("aria-disabled", "true");

    rerender(<AgentTeamDetail {...detailProps({
      onSaveMember,
      state: stateWith(managerEditor({ saveStatus: "failed", saveError: "文件被占用" })),
    })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("保存失败：文件被占用");
    expect(screen.getByRole("textbox", { name: "开发经理 AGENT.md" }))
      .toHaveAttribute("data-raw-markdown", "# 开发经理\n\n新职责\n");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onSaveMember).toHaveBeenCalledWith("manager");
  });

  it("updates an existing mention from another member's AGENT.md identity without changing its slug", () => {
    const baseState = stateWith(managerEditor({
      draftMarkdown: "# 开发经理\n\n下一步交给 @dev。\n",
    }));
    const { rerender } = renderDetail({ state: baseState });

    expect(screen.getByRole("button", { name: "开发，复制 @dev" })).toBeVisible();
    const rawMarkdown = screen.getByRole("textbox", { name: "开发经理 AGENT.md" });
    expect(rawMarkdown).toHaveAttribute("data-raw-markdown", "# 开发经理\n\n下一步交给 @dev。\n");

    rerender(<AgentTeamDetail {...detailProps({
      state: {
        ...baseState,
        memberEditors: {
          ...baseState.memberEditors,
          dev: {
            ...baseState.memberEditors.dev!,
            displayName: "软件工程师",
            draftMarkdown: "# 软件工程师\n\n负责实现\n",
          },
        },
      },
    })} />);

    expect(screen.getByRole("button", { name: "软件工程师，复制 @dev" })).toBeVisible();
    expect(rawMarkdown).toHaveAttribute("data-raw-markdown", "# 开发经理\n\n下一步交给 @dev。\n");
  });

  it("keeps the current member @slug visible and copyable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderDetail();

    const copySlug = screen.getByRole("button", { name: "复制 @manager" });
    expect(copySlug).toHaveTextContent("@manager");
    await act(async () => {
      fireEvent.click(copySlug);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("@manager");
  });

  it("offers all three leave choices and stays when save-all reports a partial failure", async () => {
    const onLeave = vi.fn();
    const onSaveAll = vi.fn().mockResolvedValue({ failures: [{ memberSlug: "qa", reason: "权限不足" }] });
    const { rerender } = renderDetail({ onLeave, onSaveAll });

    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));
    const dialog = screen.getByRole("dialog", { name: "还有未保存的修改" });
    expect(within(dialog).getByRole("button", { name: "继续编辑" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "放弃全部" })).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "保存全部并离开" }));

    await waitFor(() => expect(onSaveAll).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "还有未保存的修改" })).not.toBeInTheDocument());
    expect(onLeave).not.toHaveBeenCalled();

    rerender(<AgentTeamDetail {...detailProps({
      onLeave,
      onSaveAll,
      state: {
        ...stateWith(managerEditor()),
        saveAllFailures: [{ memberSlug: "qa", reason: "权限不足" }],
      },
    })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("测试：权限不足");
  });

  it("explains built-in ownership and keeps AGENT.md selectable but read-only", () => {
    const onSaveMember = vi.fn();
    const base = detailProps();
    renderDetail({
      team: { ...base.team, teamKey: "system:development", ownership: "system" },
      state: { ...base.state, teamKey: "system:development" },
      readOnly: true,
      teamActions: <button type="button">复制并编辑</button>,
      onSaveMember,
    });

    expect(screen.getByText("内置团队")).toBeVisible();
    expect(screen.getByText("只读")).toBeVisible();
    expect(screen.getByRole("note")).toHaveTextContent("这是软件自带的只读团队");
    expect(screen.getByRole("note")).toHaveTextContent("请先复制一份独立团队");
    expect(screen.getByRole("button", { name: "复制并编辑" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "开发经理 AGENT.md" }))
      .toHaveAttribute("aria-readonly", "true");
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "放弃修改" })).not.toBeInTheDocument();
    expect(screen.queryByText("复制 Agent")).not.toBeInTheDocument();
    expect(screen.queryByText("删除 Agent")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(onSaveMember).not.toHaveBeenCalled();
  });
});

function renderDetail(overrides: Partial<AgentTeamDetailProps> = {}) {
  return render(<AgentTeamDetail {...detailProps(overrides)} />);
}

function detailProps(overrides: Partial<AgentTeamDetailProps> = {}): AgentTeamDetailProps {
  return {
    team: {
      teamKey: "user:development",
      ownership: "user",
      name: "开发团队",
      description: "负责软件方案、实现和验收",
      primaryAgentSlug: "manager",
      memberOrder: ["manager", "dev", "qa"],
      members: [
        { slug: "manager", displayName: "开发经理", description: "默认接单" },
        { slug: "dev", displayName: "开发", description: "负责实现" },
        { slug: "qa", displayName: "测试", description: "负责验收" },
      ],
    },
    state: stateWith(managerEditor()),
    onSelectMember: vi.fn(),
    onChangePrimaryAgent: vi.fn(),
    onChangeMember: vi.fn(),
    onSaveMember: vi.fn(),
    onRetryLoad: vi.fn(),
    onDiscardMember: vi.fn(),
    onDiscardAll: vi.fn(),
    onSaveAll: vi.fn().mockResolvedValue({ failures: [] }),
    onLeave: vi.fn(),
    ...overrides,
  };
}

function stateWith(manager: AgentTeamMemberEditorState): AgentTeamDetailProps["state"] {
  return {
    teamKey: "user:development",
    selectedMemberSlug: "manager",
    memberEditors: {
      manager,
      dev: {
        ...managerEditor(),
        memberSlug: "dev",
        displayName: "开发",
        description: "负责实现",
        isDirty: false,
      },
      qa: {
        ...managerEditor(),
        memberSlug: "qa",
        displayName: "测试",
        description: "负责验收",
        isDirty: false,
      },
    },
    saveAllFailures: [],
  };
}

function managerEditor(overrides: Partial<AgentTeamMemberEditorState> = {}): AgentTeamMemberEditorState {
  return {
    memberSlug: "manager",
    loadStatus: "ready",
    loadError: null,
    draftMarkdown: "# 开发经理\n\n新职责\n",
    isDirty: true,
    saveStatus: "idle",
    saveError: null,
    displayName: "开发经理",
    description: "新职责",
    ...overrides,
  };
}

function replaceEditorText(editor: HTMLElement, value: string): void {
  editor.textContent = value;
  fireEvent.input(editor);
}
