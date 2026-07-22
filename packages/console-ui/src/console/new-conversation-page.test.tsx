import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NewConversationPage, type NewConversationPageProps } from "./new-conversation-page";

describe("NewConversationPage", () => {
  it("keeps drafting and team selection usable while project-dependent context and send stay unavailable", () => {
    const onDraftChange = vi.fn();
    const onSelectTeam = vi.fn();
    renderPage({ selectedProjectId: null, onDraftChange, onSelectTeam });

    expect(screen.getByRole("heading", { name: "新对话" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "消息内容" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
    expect(screen.getByText("选择一个项目后才能发送")).toBeVisible();
    expect(screen.queryByText("默认工作空间")).not.toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "消息内容" }), { target: { value: "draft" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Agent 团队" }), { target: { value: "user:product" } });
    expect(onDraftChange).toHaveBeenCalledWith("draft");
    expect(onSelectTeam).toHaveBeenCalledWith("user:product");
  });

  it("lists projects and appends the add-project action after a separator", async () => {
    const onSelectProject = vi.fn();
    const onAddProject = vi.fn();
    renderPage({ onSelectProject, onAddProject });

    fireEvent.keyDown(screen.getByRole("button", { name: "项目：agent-moebius，点击切换" }), { key: "ArrowDown" });
    const menu = await screen.findByRole("menu");
    expect(menu.querySelectorAll('[role="menuitemcheckbox"]')).toHaveLength(2);
    expect(menu.querySelector('[role="separator"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "添加项目…" }));
    expect(onAddProject).toHaveBeenCalledTimes(1);
  });

  it("completes mentions from the team displayed in the composer context", () => {
    renderPage({ selectedTeamKey: "user:product", draft: "@" });
    const input = screen.getByRole("textbox", { name: "消息内容" });
    const textInput = input as HTMLTextAreaElement;
    textInput.setSelectionRange(1, 1);
    fireEvent.focus(textInput);
    fireEvent.select(textInput);

    const completionList = screen.getByRole("listbox", { name: "角色补全面板" });
    expect(within(completionList).getByRole("option", { name: /产品/u })).toBeInTheDocument();
    expect(within(completionList).queryByRole("option", { name: /开发/u })).not.toBeInTheDocument();
  });
});

const projects = [
  { projectId: "a", title: "agent-moebius", available: true, workspaceLabel: "默认工作空间", branchLabel: "main" },
  { projectId: "b", title: "marketing-site", available: true, workspaceLabel: "独立工作空间", branchLabel: "agent/demo" },
];

function renderPage(overrides: Partial<NewConversationPageProps> = {}) {
  return render(<NewConversationPage
    projects={projects}
    teams={[
      {
        teamKey: "system:development",
        label: "开发团队",
        members: [{ slug: "dev", displayName: "开发", description: "实现功能" }],
      },
      {
        teamKey: "user:product",
        label: "产品团队",
        members: [{ slug: "product", displayName: "产品", description: "定义需求" }],
      },
    ]}
    selectedProjectId="a"
    selectedTeamKey="system:development"
    draft="目标"
    onSelectProject={vi.fn()}
    onAddProject={vi.fn()}
    onSelectTeam={vi.fn()}
    onDraftChange={vi.fn()}
    onSubmit={vi.fn()}
    {...overrides}
  />);
}
