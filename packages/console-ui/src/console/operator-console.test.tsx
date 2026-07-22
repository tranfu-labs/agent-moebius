import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SIDEBAR_WIDTH_PX,
  MAX_SIDEBAR_WIDTH_PX,
  MIN_SIDEBAR_WIDTH_PX,
  NARROW_WINDOW_WIDTH_PX,
  OperatorConsole,
  resolveNewConversationAgentTeamKey,
  type OperatorConsoleProps,
  type OperatorMessage,
  type OperatorProject,
  type OperatorRunSnapshot,
  type OperatorSession,
} from "./operator-console";

const originalWindowWidth = window.innerWidth;

afterEach(() => {
  setWindowWidth(originalWindowWidth);
});

describe("OperatorConsole", () => {
  it("renders the fixed sidebar skeleton around the only scrolling project region", () => {
    renderConsole({ onOpenDiagnostics: vi.fn() });

    const sidebar = screen.getByTestId("operator-sidebar");
    const brandRegion = screen.getByTestId("sidebar-brand-region");
    const appActions = screen.getByTestId("sidebar-app-actions");
    const projectList = screen.getByRole("navigation", { name: "项目列表" });
    const footer = screen.getByTestId("sidebar-footer");
    const projectHeading = screen.getByText("项目");

    expect(screen.getByRole("img", { name: "Moebius Logo" })).toBeVisible();
    expect(screen.getByText("Moebius")).toBeVisible();
    expect(brandRegion).toHaveClass("window-drag-region", "pl-[76px]");
    expect(screen.getByRole("button", { name: "关闭侧边栏" })).toHaveClass("window-no-drag");
    expect(screen.getByRole("button", { name: "关闭侧边栏" })).toHaveAttribute("title", "关闭侧边栏");

    const appEntries = ["新建对话", "搜索", "Agent 团队"].map((name) =>
      screen.getByRole("button", { name }),
    );
    expect(new Set(appEntries.map((entry) => entry.className)).size).toBe(1);
    for (const [index, entry] of appEntries.entries()) {
      expect(entry).toHaveAttribute("aria-label", ["新建对话", "搜索", "Agent 团队"][index]);
      expect(entry).toHaveAttribute("title", ["新建对话", "搜索", "Agent 团队"][index]);
    }
    expect(projectHeading).toBeVisible();
    expect(screen.getByRole("button", { name: "设置" })).toBeVisible();

    expect(sidebar).toContainElement(brandRegion);
    expect(sidebar).toContainElement(appActions);
    expect(sidebar).toContainElement(projectHeading);
    expect(sidebar).toContainElement(projectList);
    expect(sidebar).toContainElement(footer);
    expect(projectList).toHaveClass("overflow-auto");
    expect(projectList).not.toContainElement(brandRegion);
    expect(projectList).not.toContainElement(appActions);
    expect(projectList).not.toContainElement(projectHeading);
    expect(projectList).not.toContainElement(footer);

    expect(screen.queryByRole("button", { name: "打开项目" })).not.toBeInTheDocument();
    expect(screen.queryByText("开发者诊断")).not.toBeInTheDocument();
    expect(screen.queryByText(/本地引擎/u)).not.toBeInTheDocument();
  });

  it("keeps sidebar icon controls keyboard-focusable in visual order with readable names and hover titles", () => {
    renderConsole({
      onShowProjectInFolder: vi.fn(),
      onRenameProject: vi.fn(),
      onRemoveProject: vi.fn(),
      onArchiveSession: vi.fn(),
    });

    const sidebar = screen.getByTestId("operator-sidebar");
    const controls = Array.from(sidebar.querySelectorAll<HTMLElement>("button, [role='button']"));
    expect(controls.map((control) => control.getAttribute("aria-label") ?? control.textContent?.trim())).toEqual([
      "关闭侧边栏",
      "新建对话",
      "搜索",
      "Agent 团队",
      "agent-moebius 项目，已展开",
      "在 agent-moebius 中新建会话",
      "agent-moebius 项目菜单",
      "默认会话，正在运行",
      "默认会话 对话菜单",
      "验收会话，需要你处理",
      "验收会话 对话菜单",
      "设置",
    ]);
    for (const control of controls) {
      expect(control.tabIndex).toBeGreaterThanOrEqual(0);
      expect(control.getAttribute("aria-label") ?? control.textContent?.trim()).not.toBe("");
      expect(control).toHaveAttribute("title");
    }
  });

  it("keeps all three application entries available when there are no projects", () => {
    renderConsole({ projects: [] });

    expect(screen.getByText("从“新建对话”添加第一个项目")).toBeVisible();
    expect(screen.getByRole("button", { name: "新建对话" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "搜索" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Agent 团队" })).toBeEnabled();
  });

  it("shows project loading structure while keeping independent application areas available", () => {
    renderConsole({ projectListState: "loading" });

    expect(screen.getByLabelText("项目正在加载")).toBeVisible();
    expect(screen.getByRole("button", { name: "新建对话" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "搜索" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agent 团队" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "设置" })).toBeEnabled();
  });

  it("shows project load failure with retry while Agent teams and Settings stay available", () => {
    const onRetryProjectList = vi.fn();
    renderConsole({ projectListState: "error", onRetryProjectList });

    expect(screen.getByRole("alert")).toHaveTextContent("项目加载失败");
    expect(screen.getByRole("button", { name: "Agent 团队" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "设置" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetryProjectList).toHaveBeenCalledTimes(1);
  });

  it("disables conflicting project entries during configuration changes without blocking browsing", async () => {
    const onSelectSession = vi.fn();
    renderConsole({
      isProjectMutationPending: true,
      onSelectSession,
      onShowProjectInFolder: vi.fn(),
    });

    expect(screen.getByRole("button", { name: "新建对话" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "在 agent-moebius 中新建会话" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "agent-moebius 项目菜单" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "搜索" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Agent 团队" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "设置" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("正在更新…");

    fireEvent.click(screen.getByRole("button", { name: "验收会话，需要你处理" }));
    expect(onSelectSession).toHaveBeenCalledWith({ sessionId: "session-b", projectId: "local" });

    const projectToggle = screen.getByRole("button", { name: "agent-moebius 项目，已展开" });
    fireEvent.keyDown(projectToggle, { key: "Enter" });
    expect(projectToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("routes the application entry to the unscoped new-conversation page without opening a dialog", () => {
    const onStartNewConversation = vi.fn();
    renderConsole({ onStartNewConversation });

    fireEvent.click(screen.getByRole("button", { name: "新建对话" }));

    expect(onStartNewConversation).toHaveBeenCalledWith(undefined);
    expect(screen.queryByRole("dialog", { name: "新建对话" })).not.toBeInTheDocument();
  });

  it("routes a project-row entry to the same page with that explicit project", () => {
    const onStartNewConversation = vi.fn();
    const secondProject: OperatorProject = {
      ...project,
      projectId: "project-b",
      title: "project-b",
      folderPath: "/Users/example/project-b",
      sessions: [],
    };
    renderConsole({ projects: [project, secondProject], onStartNewConversation });

    fireEvent.click(screen.getByRole("button", { name: "在 project-b 中新建会话" }));

    expect(onStartNewConversation).toHaveBeenCalledWith("project-b");
  });

  it("renders the controlled new-conversation page instead of the selected session", () => {
    const userTeam = {
      ...agentTeam,
      teamKey: "user:my-team",
      id: "my-team",
      ownership: "user" as const,
      name: "我的团队",
    };
    const onNewConversationTeamChange = vi.fn();
    const onSubmitNewConversation = vi.fn();
    renderConsole({
      agentTeamsState: { status: "ready", teams: [agentTeam, userTeam] },
      newConversation: {
        selectedProjectId: null,
        selectedTeamKey: userTeam.teamKey,
        draft: "描述目标",
        isSubmitting: false,
        error: null,
      },
      onNewConversationTeamChange,
      onSubmitNewConversation,
    });

    const teamSelector = screen.getByRole("combobox", { name: "Agent 团队" });
    expect(teamSelector).toHaveValue(userTeam.teamKey);
    expect(screen.getByRole("region", { name: "新建对话" })).toBeVisible();
    expect(screen.getByRole("button", { name: "新建对话" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("region", { name: "会话时间线" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();

    fireEvent.change(teamSelector, { target: { value: agentTeam.teamKey } });
    expect(onNewConversationTeamChange).toHaveBeenCalledWith(agentTeam.teamKey);
    expect(onSubmitNewConversation).not.toHaveBeenCalled();
  });

  it("falls back to the first built-in team for first use, deletion, drafts, and repair states", () => {
    const unavailableLastUsed = {
      ...agentTeam,
      teamKey: "user:broken",
      id: "broken",
      ownership: "user" as const,
      name: "需要修复的团队",
      status: "needs-repair" as const,
      canCreateConversation: false,
    };
    const draft = {
      ...unavailableLastUsed,
      teamKey: "user:draft",
      id: "draft",
      name: "未完成团队",
      status: "unfinished-draft" as const,
    };
    const teams = [agentTeam, unavailableLastUsed, draft];
    expect(resolveNewConversationAgentTeamKey(teams, null)).toBe(agentTeam.teamKey);
    expect(resolveNewConversationAgentTeamKey(teams, "user:deleted")).toBe(agentTeam.teamKey);
    expect(resolveNewConversationAgentTeamKey(teams, unavailableLastUsed.teamKey)).toBe(agentTeam.teamKey);
  });

  it("keeps a project with an unavailable directory out of the new-conversation flow", () => {
    renderConsole({
      project: {
        ...project,
        newConversationDisabledReason: "当前项目本地文件夹不可用，无法新建对话",
      },
    });

    const projectNewConversation = screen.getByRole("button", { name: "在 agent-moebius 中新建会话" });
    expect(projectNewConversation).toBeDisabled();
    expect(projectNewConversation).toHaveAttribute("title", "当前项目本地文件夹不可用，无法新建对话");
    fireEvent.click(projectNewConversation);
  });

  it("offers project setup inside the new-conversation project menu when no project exists", async () => {
    const onAddNewConversationProject = vi.fn();
    renderConsole({
      projects: [],
      newConversation: {
        selectedProjectId: null,
        selectedTeamKey: agentTeam.teamKey,
        draft: "目标",
        isSubmitting: false,
        error: null,
      },
      agentTeamsState: { status: "ready", teams: [agentTeam] },
      onAddNewConversationProject,
    });

    expect(screen.getByText("还没有项目，从上面的项目按钮添加一个")).toBeVisible();
    fireEvent.keyDown(screen.getByRole("button", { name: "项目：未选择，点击选择" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "添加项目…" }));
    expect(onAddNewConversationProject).toHaveBeenCalledTimes(1);
  });

  it("opens search over the current selection and restores it when closed", () => {
    renderConsole();
    const selectedSession = screen.getByRole("button", { name: "默认会话，正在运行" });

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    expect(screen.getByRole("dialog", { name: "全局搜索" })).toBeVisible();
    expect(selectedSession).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog", { name: "全局搜索" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "默认会话，正在运行" })).toBe(selectedSession);
  });

  it("routes Agent Teams to the real data container and restores the current conversation", () => {
    renderConsole({
      agentTeamsState: { status: "ready", teams: [agentTeam] },
      selectedAgentTeamKey: "system:development",
      selectedAgentTeamMemberSlug: "manager",
    });
    const teamsEntry = screen.getByRole("button", { name: "Agent 团队" });

    fireEvent.click(teamsEntry);

    expect(teamsEntry).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Agent 团队" })).toBeVisible();
    expect(screen.getByLabelText("团队数据已载入")).toHaveAttribute("data-team-count", "1");
    expect(screen.getByLabelText("团队数据已载入")).toHaveAttribute("data-selected-team-key", "system:development");
    expect(screen.getByLabelText("团队数据已载入")).toHaveAttribute("data-selected-member-slug", "manager");
    expect(screen.queryByRole("region", { name: "会话时间线" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "返回当前对话" }));
    expect(teamsEntry).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("region", { name: "会话时间线" })).toBeVisible();
    expect(screen.getByRole("button", { name: "默认会话，正在运行" })).toHaveAttribute("aria-current", "page");
  });

  it("routes sidebar conversation selection through the conversation entry and protects unsaved team drafts", () => {
    const onSelectSession = vi.fn();
    const onDiscardAllAgentTeamDrafts = vi.fn();
    const dirtyDetail = detailStateFor(agentTeam.teamKey);
    dirtyDetail.memberEditors.manager!.isDirty = true;
    renderConsole({
      agentTeamsState: { status: "ready", teams: [agentTeam] },
      selectedAgentTeamKey: agentTeam.teamKey,
      agentTeamDetailState: dirtyDetail,
      onSelectSession,
      onDiscardAllAgentTeamDrafts,
    });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));

    fireEvent.click(screen.getByRole("button", { name: "验收会话，需要你处理" }));
    expect(onSelectSession).not.toHaveBeenCalled();
    const prompt = screen.getByRole("dialog", { name: "还有未保存的修改" });
    fireEvent.click(within(prompt).getByRole("button", { name: "放弃全部" }));

    expect(onDiscardAllAgentTeamDrafts).toHaveBeenCalledWith(agentTeam.teamKey);
    expect(onSelectSession).toHaveBeenCalledWith({ sessionId: "session-b", projectId: "local" });
    expect(screen.getByRole("region", { name: "会话时间线" })).toBeVisible();
  });

  it("routes from Agent Teams into the new-conversation entry through the shared conversation gate", () => {
    const onStartNewConversation = vi.fn();
    renderConsole({
      agentTeamsState: { status: "ready", teams: [agentTeam] },
      onStartNewConversation,
    });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));
    fireEvent.click(screen.getByRole("button", { name: "新建对话" }));

    expect(onStartNewConversation).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole("region", { name: "会话时间线" })).toBeVisible();
  });

  it("returns to the conversation view when archiving the selected session from the teams page", async () => {
    const onArchiveSession = vi.fn();
    renderConsole({
      project: { ...project, sessions: [sessions[1]!], runningCount: 0 },
      selectedSessionId: "session-b",
      selectedSession: sessions[1],
      onArchiveSession,
    });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "验收会话，需要你处理" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "归档" }));

    expect(onArchiveSession).toHaveBeenCalledWith("session-b", "local");
    expect(screen.getByRole("region", { name: "会话时间线" })).toBeVisible();
  });

  it("returns to the conversation view before removing the active project from the teams page", async () => {
    const onRemoveProject = vi.fn().mockResolvedValue(undefined);
    renderConsole({ project: { ...project, runningCount: 0 }, onRemoveProject });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));

    await openProjectMenu("agent-moebius");
    fireEvent.click(screen.getByRole("menuitem", { name: "移除项目" }));
    fireEvent.click(screen.getByRole("button", { name: "移除项目" }));

    await waitFor(() => expect(onRemoveProject).toHaveBeenCalledWith("local", false));
    expect(screen.getByRole("region", { name: "会话时间线" })).toBeVisible();
  });

  it("shows one accessible repair indicator and identifies every affected team after opening the page", () => {
    const secondRepairTeam = {
      ...repairTeam,
      teamKey: "user:repair-two",
      id: "repair-two",
      name: "内容团队",
    };
    renderConsole({
      agentTeamsState: { status: "ready", teams: [draftTeam, repairTeam, secondRepairTeam] },
    });

    const indicators = screen.getAllByRole("img", { name: "有 Agent 团队需要修复" });
    expect(indicators).toHaveLength(1);
    expect(indicators[0]).toHaveAttribute("title", "有 Agent 团队需要修复");
    expect(indicators[0]).toHaveTextContent("");

    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));

    const rows = screen.getAllByTestId("agent-team-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("未完成")).toBeVisible();
    expect(within(rows[0]).queryByText("需要修复")).not.toBeInTheDocument();
    expect(within(rows[1]).getByText("需要修复")).toBeVisible();
    expect(within(rows[2]).getByText("需要修复")).toBeVisible();
  });

  it("does not show the sidebar repair indicator for unfinished drafts", () => {
    renderConsole({ agentTeamsState: { status: "ready", teams: [draftTeam] } });

    expect(screen.queryByRole("img", { name: "有 Agent 团队需要修复" })).not.toBeInTheDocument();
  });

  it("keeps session history visible while a selected team needing repair blocks sending", () => {
    const onSend = vi.fn();
    renderConsole({
      agentTeamsState: { status: "ready", teams: [repairTeam] },
      conversationAgentTeamKey: repairTeam.teamKey,
      selectedSession: {
        ...sessions[0]!,
        agentTeamOwnership: "user",
        agentTeamId: "repair",
        agentTeamHealth: "needs-repair",
      },
      onSend,
    });

    expect(screen.getByRole("region", { name: "会话时间线" })).toHaveTextContent("@dev hello");
    const teamButton = screen.getByRole("button", { name: "Agent 团队：客户支持团队，需要修复，点击切换" });
    expect(teamButton).toHaveClass("text-danger");
    expect(teamButton).toHaveTextContent("客户支持团队需要修复");
    expect(screen.getByRole("textbox", { name: "消息内容" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
    expect(screen.getByText("历史对话仍可查看；修复团队后可继续发送")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not let browsing a broken team change a healthy conversation's team or sending state", () => {
    renderConsole({
      agentTeamsState: { status: "ready", teams: [agentTeam, repairTeam] },
      conversationAgentTeamKey: agentTeam.teamKey,
      selectedAgentTeamKey: repairTeam.teamKey,
      selectedSession: {
        ...sessions[0]!,
        agentTeamOwnership: "system",
        agentTeamId: "development",
        agentTeamHealth: "usable",
      },
    });

    expect(screen.getByRole("textbox", { name: "消息内容" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Agent 团队：开发团队，点击切换" })).toBeVisible();
  });

  it("uses refreshed session health so an externally repaired team unblocks without reopening teams", () => {
    renderConsole({
      agentTeamsState: { status: "ready", teams: [repairTeam] },
      conversationAgentTeamKey: repairTeam.teamKey,
      selectedSession: {
        ...sessions[0]!,
        agentTeamOwnership: "user",
        agentTeamId: "repair",
        agentTeamHealth: "usable",
      },
    });

    expect(screen.getByRole("textbox", { name: "消息内容" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled();
  });

  it("keeps the horizontal team-row structure while Agent teams are loading", () => {
    renderConsole({ agentTeamsState: { status: "loading" } });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));

    expect(screen.getByRole("status", { name: "Agent 团队正在加载" })).toBeVisible();
    expect(screen.getAllByTestId("agent-team-loading-row")).toHaveLength(2);
    expect(screen.queryByText(/没有团队/u)).not.toBeInTheDocument();
  });

  it("preserves the page frame and offers retry when team loading fails", () => {
    const onRetryAgentTeams = vi.fn();
    renderConsole({ agentTeamsState: { status: "error" }, onRetryAgentTeams });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));

    expect(screen.getByRole("heading", { name: "Agent 团队" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法加载 Agent 团队");
    expect(screen.getByRole("alert")).toHaveTextContent("团队数据没有被清空");
    expect(screen.queryByText(/没有团队/u)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetryAgentTeams).toHaveBeenCalledTimes(1);
  });

  it("calls out an application configuration error when built-in teams cannot load", () => {
    const onRetryAgentTeams = vi.fn();
    renderConsole({ agentTeamsState: { status: "configuration-error" }, onRetryAgentTeams });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));

    expect(screen.getByRole("heading", { name: "Agent 团队" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("应用配置异常");
    expect(screen.getByRole("alert")).toHaveTextContent("软件自带的 Agent 团队无法读取");
    expect(screen.queryByRole("button", { name: "新建团队" })).not.toBeInTheDocument();
    expect(screen.queryByText(/没有团队/u)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetryAgentTeams).toHaveBeenCalledTimes(1);
  });

  it("renders one flat, fully clickable row per team with readable status badges", () => {
    setWindowWidth(1200);
    renderConsole({ agentTeamsState: { status: "ready", teams: [fiveMemberTeam, draftTeam, repairTeam] } });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));

    const rows = screen.getAllByTestId("agent-team-row");
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.tagName === "BUTTON")).toBe(true);
    expect(rows.every((row) => row.querySelector("svg") === null)).toBe(true);
    expect(within(rows[0]).getByText("内置")).toBeVisible();
    expect(within(rows[1]).getByText("未完成")).toBeVisible();
    expect(within(rows[2]).getByText("需要修复")).toBeVisible();
    expect(within(rows[0]).getByText("5 名成员 · 主 Agent：开发经理")).toBeVisible();

    const memberStrip = within(rows[0]).getByTestId("agent-team-members");
    expect(memberStrip.textContent).toMatch(/^开发经理· 主 Agent开发测试＋2$/u);
    for (const memberName of ["开发经理", "开发", "测试"]) {
      expect(within(memberStrip).getByTitle(memberName)).toHaveClass("w-28");
    }
    expect(within(memberStrip).getByLabelText("还有 2 名成员")).toHaveTextContent("＋2");
    expect(screen.queryByText("修改信息")).not.toBeInTheDocument();
    expect(screen.queryByText("复制并编辑")).not.toBeInTheDocument();
    expect(screen.queryByText("删除团队")).not.toBeInTheDocument();
  });

  it("creates a durable team draft from a short two-field dialog", async () => {
    const onCreateAgentTeam = vi.fn().mockResolvedValue(draftTeam);
    renderConsole({
      agentTeamsState: { status: "ready", teams: [agentTeam, draftTeam] },
      onCreateAgentTeam,
    });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));
    fireEvent.click(screen.getByRole("button", { name: "新建团队" }));

    const dialog = screen.getByRole("dialog", { name: "新建团队" });
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(2);
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "团队名称" }), {
      target: { value: "内容团队" },
    });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "一句话描述" }), {
      target: { value: "负责内容生产" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建团队" }));

    await waitFor(() => expect(onCreateAgentTeam).toHaveBeenCalledWith({
      name: "内容团队",
      description: "负责内容生产",
    }));
  });

  it("keeps a single team row at narrow widths and compacts extra members behind ＋N", () => {
    setWindowWidth(1200);
    renderConsole({ agentTeamsState: { status: "ready", teams: [fiveMemberTeam] } });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));
    setWindowWidth(900);

    const row = screen.getByTestId("agent-team-row");
    expect(screen.getAllByTestId("agent-team-row")).toHaveLength(1);
    expect(row).toHaveAttribute("data-layout", "narrow");
    expect(row).toHaveClass("grid-cols-1");
    expect(within(row).getByTestId("agent-team-members")).toHaveClass("border-t");
    expect(within(row).getByLabelText("还有 2 名成员")).toHaveTextContent("＋2");
  });

  it("opens the real detail editor for the whole row and restores list scroll on return", () => {
    const onOpenAgentTeam = vi.fn();
    const onCloseAgentTeam = vi.fn();
    renderConsole({
      agentTeamsState: { status: "ready", teams: [fiveMemberTeam] },
      agentTeamDetailState: detailStateFor(fiveMemberTeam.teamKey),
      onOpenAgentTeam,
      onCloseAgentTeam,
    });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));

    const listPage = screen.getByRole("region", { name: "Agent 团队" });
    listPage.scrollTop = 187;
    fireEvent.click(screen.getByTestId("agent-team-row"));

    expect(onOpenAgentTeam).toHaveBeenCalledWith("system:development");
    expect(screen.getByTestId("agent-team-detail-view")).toHaveAttribute("data-team-key", "system:development");
    expect(screen.getByTestId("agent-team-detail")).toBeVisible();
    expect(screen.getByText("内置团队")).toBeVisible();
    expect(screen.getByText("只读")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "开发经理 AGENT.md" }))
      .toHaveAttribute("aria-readonly", "true");
    expect(screen.getByRole("button", { name: "复制并编辑" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-team-list")).not.toBeInTheDocument();
    expect(listPage.scrollTop).toBe(0);

    fireEvent.click(within(screen.getByTestId("agent-team-detail-view")).getByRole("button", { name: "Agent 团队" }));
    expect(onCloseAgentTeam).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("agent-team-list")).toBeVisible();
    expect(listPage.scrollTop).toBe(187);
  });

  it("routes the built-in copy action through the dedicated whole-team callback", async () => {
    const onDuplicateBuiltInAgentTeam = vi.fn().mockResolvedValue("user:development-copy");
    renderConsole({
      agentTeamsState: { status: "ready", teams: [fiveMemberTeam] },
      agentTeamDetailState: detailStateFor(fiveMemberTeam.teamKey),
      onDuplicateBuiltInAgentTeam,
    });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));
    fireEvent.click(screen.getByTestId("agent-team-row"));
    fireEvent.click(screen.getByRole("button", { name: "复制并编辑" }));

    await waitFor(() => expect(onDuplicateBuiltInAgentTeam).toHaveBeenCalledWith("system:development"));
    expect(screen.queryByText("复制 Agent")).not.toBeInTheDocument();
    expect(screen.queryByText("删除团队")).not.toBeInTheDocument();
  });

  it("renders the controlled team detail and keeps member selection inside that page", () => {
    const onSelectAgentTeamMember = vi.fn();
    const onChangeAgentTeamPrimaryAgent = vi.fn();
    const onCloseAgentTeam = vi.fn();
    const team = {
      ...agentTeam,
      ownership: "user" as const,
      teamKey: "user:development",
      memberOrder: ["manager", "dev"],
      members: [
        { slug: "manager", displayName: "开发经理", description: "默认接单" },
        { slug: "dev", displayName: "开发", description: "负责实现" },
      ],
    };
    renderConsole({
      agentTeamsState: { status: "ready", teams: [team] },
      agentTeamDetailState: {
        teamKey: team.teamKey,
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
            externalChangeStatus: "none",
            displayName: "开发经理",
            description: "默认接单",
          },
        },
        saveAllFailures: [],
      },
      onSelectAgentTeamMember,
      onChangeAgentTeamPrimaryAgent,
      onCloseAgentTeam,
    });

    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));
    fireEvent.click(screen.getByTestId("agent-team-row"));
    const detail = screen.getByRole("region", { name: "开发团队详情" });
    expect(detail).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "主 Agent" }), { target: { value: "dev" } });
    expect(onChangeAgentTeamPrimaryAgent).toHaveBeenCalledWith("user:development", "dev");
    fireEvent.click(screen.getByRole("tab", { name: "开发" }));
    expect(onSelectAgentTeamMember).toHaveBeenCalledWith("user:development", "dev");
    expect(screen.queryByTestId("agent-team-list")).not.toBeInTheDocument();

    fireEvent.click(within(detail).getByRole("button", { name: "Agent 团队" }));
    expect(onCloseAgentTeam).toHaveBeenCalledTimes(1);
  });

  it("edits only a user team's name and one-line description from Modify information", async () => {
    const onUpdateAgentTeamInformation = vi.fn().mockResolvedValue(undefined);
    const userTeam = { ...agentTeam, teamKey: "user:development", ownership: "user" as const };
    renderConsole({
      agentTeamsState: { status: "ready", teams: [userTeam] },
      agentTeamDetailState: detailStateFor(userTeam.teamKey),
      onUpdateAgentTeamInformation,
    });
    fireEvent.click(screen.getByRole("button", { name: "Agent 团队" }));
    fireEvent.click(screen.getByTestId("agent-team-row"));
    fireEvent.click(screen.getByRole("button", { name: "修改信息" }));

    const dialog = screen.getByRole("dialog", { name: "修改团队信息" });
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(2);
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "团队名称" }), {
      target: { value: "研发团队" },
    });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "一句话描述" }), {
      target: { value: "负责研发交付" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onUpdateAgentTeamInformation).toHaveBeenCalledWith(
      userTeam.teamKey,
      { name: "研发团队", description: "负责研发交付" },
    ));
  });

  it("closes and restores the sidebar without remounting the timeline or active run", () => {
    renderConsole({ activeRun: runSnapshot });

    const sidebar = screen.getByTestId("operator-sidebar");
    const main = screen.getByTestId("operator-main");
    const projectList = screen.getByRole("navigation", { name: "项目列表" });
    const selectedSessionRow = screen.getByRole("button", { name: "默认会话，正在运行" });
    const timeline = screen.getByRole("region", { name: "会话时间线" });
    const activeRunBlock = screen.getByTestId("active-run-block");
    projectList.scrollTop = 73;

    fireEvent.click(screen.getByRole("button", { name: "关闭侧边栏" }));

    expect(sidebar).not.toBeVisible();
    expect(sidebar).toHaveClass("hidden");
    expect(main).toHaveAttribute("data-sidebar-open", "false");
    expect(screen.getByRole("button", { name: "打开侧边栏" })).toHaveAttribute("title", "打开侧边栏");
    expect(selectedSessionRow).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("region", { name: "会话时间线" })).toBe(timeline);
    expect(screen.getByTestId("active-run-block")).toBe(activeRunBlock);

    fireEvent.click(screen.getByRole("button", { name: "打开侧边栏" }));

    expect(sidebar).toBeVisible();
    expect(sidebar).toHaveClass("flex");
    expect(sidebar).not.toHaveClass("hidden");
    expect(main).toHaveAttribute("data-sidebar-open", "true");
    expect(projectList.scrollTop).toBe(73);
    expect(screen.getByRole("button", { name: "默认会话，正在运行" })).toBe(selectedSessionRow);
    expect(screen.getByRole("region", { name: "会话时间线" })).toBe(timeline);
    expect(screen.getByTestId("active-run-block")).toBe(activeRunBlock);
  });

  it("resizes the sidebar from its right boundary within the supported width range", () => {
    renderConsole();

    const sidebar = screen.getByTestId("operator-sidebar");
    const resizeHandle = screen.getByRole("separator", { name: "调整侧边栏宽度" });
    expect(sidebar).toHaveStyle({ width: `${DEFAULT_SIDEBAR_WIDTH_PX}px` });
    expect(resizeHandle).toHaveAttribute("aria-valuemin", String(MIN_SIDEBAR_WIDTH_PX));
    expect(resizeHandle).toHaveAttribute("aria-valuemax", String(MAX_SIDEBAR_WIDTH_PX));

    firePointer(resizeHandle, "pointerdown", { pointerId: 7, button: 0, clientX: DEFAULT_SIDEBAR_WIDTH_PX });
    firePointer(resizeHandle, "pointermove", { pointerId: 7, button: 0, clientX: -1_000 });
    expect(sidebar).toHaveStyle({ width: `${MIN_SIDEBAR_WIDTH_PX}px` });
    expect(resizeHandle).toHaveAttribute("aria-valuenow", String(MIN_SIDEBAR_WIDTH_PX));

    firePointer(resizeHandle, "pointermove", { pointerId: 7, button: 0, clientX: 1_000 });
    expect(sidebar).toHaveStyle({ width: `${MAX_SIDEBAR_WIDTH_PX}px` });
    expect(resizeHandle).toHaveAttribute("aria-valuenow", String(MAX_SIDEBAR_WIDTH_PX));
    firePointer(resizeHandle, "pointerup", { pointerId: 7, button: 0, clientX: 1_000 });
  });

  it("auto-collapses only for a narrow window and restores from the explicit user preference", () => {
    setWindowWidth(NARROW_WINDOW_WIDTH_PX + 100);
    const onSidebarOpenChange = vi.fn();
    const { rerender } = renderConsole({ sidebarOpen: true, onSidebarOpenChange });
    const sidebar = screen.getByTestId("operator-sidebar");
    const main = screen.getByTestId("operator-main");
    expect(sidebar).toBeVisible();

    setWindowWidth(NARROW_WINDOW_WIDTH_PX - 1);
    expect(sidebar).not.toBeVisible();
    expect(main).toHaveAttribute("data-sidebar-auto-collapsed", "true");
    expect(onSidebarOpenChange).not.toHaveBeenCalled();

    setWindowWidth(NARROW_WINDOW_WIDTH_PX + 100);
    expect(sidebar).toBeVisible();
    expect(main).toHaveAttribute("data-sidebar-auto-collapsed", "false");
    expect(onSidebarOpenChange).not.toHaveBeenCalled();

    rerender(<OperatorConsole {...baseProps({ sidebarOpen: false, onSidebarOpenChange })} />);
    setWindowWidth(NARROW_WINDOW_WIDTH_PX - 1);
    setWindowWidth(NARROW_WINDOW_WIDTH_PX + 100);
    expect(sidebar).not.toBeVisible();
    expect(main).toHaveAttribute("data-sidebar-auto-collapsed", "false");
    expect(onSidebarOpenChange).not.toHaveBeenCalled();
  });

  it("keeps long project and conversation names on one line with their full text available on hover", () => {
    const longProjectName = "这是一个非常长的项目显示名称，用来验证侧边栏缩窄后仍然保持单行";
    const longSessionName = "这是一个非常长的对话标题，用来验证用户悬停时可以查看完整内容";
    renderConsole({
      project: {
        ...project,
        title: longProjectName,
        sessions: [{ ...sessions[0], title: longSessionName }],
      },
      selectedSession: { ...sessions[0], title: longSessionName },
    });

    const projectName = screen.getByTitle(longProjectName);
    const sessionRow = screen.getByRole("button", { name: `${longSessionName}，正在运行` });
    const conversationHeading = screen.getByRole("heading", { name: longSessionName });
    expect(projectName).toHaveClass("truncate");
    expect(sessionRow).toHaveAttribute("title", longSessionName);
    expect(sessionRow.querySelector(".truncate")).toHaveTextContent(longSessionName);
    expect(conversationHeading).toHaveClass("truncate");
    expect(conversationHeading).toHaveAttribute("title", longSessionName);
  });

  it("keeps the selected conversation mounted when its project is collapsed", () => {
    const onSelectSession = vi.fn();
    renderConsole({ onSelectSession });

    const timeline = screen.getByRole("region", { name: "会话时间线" });
    expect(screen.getByRole("button", { name: "默认会话，正在运行" })).toHaveAttribute("aria-current", "page");

    fireEvent.keyDown(screen.getByRole("button", { name: "agent-moebius 项目，已展开" }), { key: "Enter" });

    expect(screen.getByRole("button", { name: "agent-moebius 项目，已折叠，需要你处理" })).toHaveAttribute(
      "data-status-dot",
      "red",
    );
    expect(screen.queryByRole("button", { name: "默认会话，正在运行" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "会话时间线" })).toBe(timeline);
    expect(onSelectSession).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("button", { name: "agent-moebius 项目，已折叠，需要你处理" }), {
      key: "Enter",
    });

    expect(screen.getByRole("button", { name: "默认会话，正在运行" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("region", { name: "会话时间线" })).toBe(timeline);
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it("keeps the sidebar visible throughout first-run onboarding", () => {
    const onSidebarOpenChange = vi.fn();
    renderConsole({
      sidebarOpen: false,
      isFirstRunOnboarding: true,
      onSidebarOpenChange,
    });

    const closeButton = screen.getByRole("button", { name: "关闭侧边栏" });
    expect(screen.getByTestId("operator-sidebar")).toBeVisible();
    expect(closeButton).toBeDisabled();
    expect(closeButton).toHaveAttribute("title", "首次启动引导期间侧边栏保持打开");
    expect(screen.queryByRole("button", { name: "打开侧边栏" })).not.toBeInTheDocument();
    fireEvent.click(closeButton);
    expect(onSidebarOpenChange).not.toHaveBeenCalled();
  });

  it("renders the Codex frame, flat session rail, bottom context, and live run controls", () => {
    const onInterrupt = vi.fn();
    renderConsole({ activeRun: runSnapshot, onInterrupt });

    expect(screen.getByText("Moebius")).toBeVisible();
    expect(screen.getAllByText("agent-moebius").length).toBeGreaterThan(0);
    expect(screen.getAllByText("默认会话").length).toBeGreaterThan(0);
    expect(screen.getByText("验收会话")).toBeVisible();
    expect(screen.getByText("开发")).toBeVisible();
    expect(screen.getByText("00:12")).toBeVisible();
    expect(screen.getByText("live tail from codex")).toBeVisible();
    expect(screen.getByText("独立工作空间")).toBeVisible();
    expect(screen.queryByText("0 通过")).not.toBeInTheDocument();
    expect(screen.queryByText("查看当前会话原始信息")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /中断开发运行/u }));
    expect(onInterrupt).toHaveBeenCalledWith("session-a", "run-1");
  });

  it("keeps terminal outcomes readable and routes machine details to diagnostics", () => {
    const onOpenDiagnostics = vi.fn();
    renderConsole({
      onOpenDiagnostics,
      messages: [
        message({ id: 1, status: "interrupted", body: "@dev interrupted", error: "interrupted:user-interrupted" }),
        message({ id: 2, speaker: "system", status: "failed", body: "Codex failed: exit:42", error: "exit:42" }),
        message({ id: 3, speaker: "system", status: "stuck", body: "Codex stuck: idle-timeout:10ms", error: "idle-timeout:10ms" }),
      ],
    });

    expect(screen.getByText("运行已中断")).toBeVisible();
    expect(screen.getByText("运行失败")).toBeVisible();
    expect(screen.getByText("运行长时间无响应")).toBeVisible();
    expect(screen.queryByText("interrupted:user-interrupted")).not.toBeInTheDocument();
    expect(screen.queryByText("idle-timeout:10ms")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "查看日志" })[0]!);
    expect(onOpenDiagnostics).toHaveBeenCalledTimes(1);
  });

  it("renders derived sessions as peers while exposing their parent through hover and assistive text", () => {
    const childSession = { ...sessions[1], parentSessionId: sessions[0].sessionId, title: "裂变会话" };
    renderConsole({
      selectedSessionId: childSession.sessionId,
      selectedSession: childSession,
      project: {
        ...project,
        sessions: [{ ...sessions[0], childCount: 1 }, childSession],
      },
    });

    const [rootRow, derivedRow] = screen.getAllByTestId("conversation-sidebar-session");
    expect(rootRow).toBeDefined();
    expect(derivedRow).toBeDefined();
    expect(rootRow!.className.replace("bg-transparent", "bg-sel")).toBe(derivedRow!.className);
    expect(screen.getAllByText("裂变会话").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "裂变会话，来自：默认会话，需要你处理" }))
      .toHaveAttribute("title", "裂变会话（来自：默认会话）");
    expect(screen.queryByText(/属于：/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/子会话/u)).not.toBeInTheDocument();
  });

  it("keeps machine terms out of the default conversation surface", () => {
    renderConsole({
      messages: [
        message({
          id: 1,
          speaker: "system",
          status: "failed",
          body: "dead-letter body handoff runDir",
          error: "cwd=/tmp/project runDir=/tmp/run direct worktree",
          runDir: "/tmp/agent-moebius-run",
        }),
      ],
      activeRun: {
        ...runSnapshot,
        lastOutputSummary: "cwd /tmp/project runDir /tmp/run direct worktree",
      },
    });

    expect(screen.getByText("正在运行，等待进展")).toBeVisible();
    expect(screen.getByText("多次尝试仍失败，已停止自动重试")).toBeVisible();
    expect(screen.queryByText(/\/tmp\/agent-moebius-run/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/cwd=\/tmp/u)).not.toBeInTheDocument();
    expect(screen.queryByText("查看详情")).not.toBeInTheDocument();
  });

  it("routes a confirmed workspace change through the selected session", () => {
    const onChangeSessionWorkspace = vi.fn();
    renderConsole({ onChangeSessionWorkspace });

    fireEvent.keyDown(screen.getByRole("button", { name: "工作空间：独立工作空间，点击切换" }), {
      key: "ArrowDown",
    });
    fireEvent.click(screen.getByText("默认工作空间"));
    const dialog = screen.getByRole("dialog", { name: "换回默认工作空间" });
    expect(dialog).toHaveTextContent("之后的改动会直接落在项目文件夹里");
    fireEvent.click(within(dialog).getByRole("button", { name: "换回去" }));
    expect(onChangeSessionWorkspace).toHaveBeenCalledWith("session-a", "direct");
  });

  it("keeps corrupt lineage records visible once because the rail is flat", () => {
    renderConsole({
      project: {
        ...project,
        sessions: [
          { ...sessions[0], parentSessionId: "session-b", title: "Cycle A" },
          { ...sessions[1], parentSessionId: "session-a", title: "Cycle B" },
          { ...sessions[1], sessionId: "session-c", parentSessionId: "session-c", title: "Self parent" },
          { ...sessions[1], sessionId: "session-d", parentSessionId: "missing", title: "Missing parent" },
        ],
      },
    });

    expect(screen.getAllByText("Cycle A")).toHaveLength(1);
    expect(screen.getAllByText("Cycle B")).toHaveLength(1);
    expect(screen.getAllByText("Self parent")).toHaveLength(1);
    expect(screen.getAllByText("Missing parent")).toHaveLength(1);
  });

  it("switches an empty session project from the composer dropdown", async () => {
    const onChangeSessionProject = vi.fn();
    const otherProject: OperatorProject = {
      ...project,
      projectId: "project-b",
      title: "project-b",
      folderPath: "/Users/example/project-b",
      sessions: [],
    };
    renderConsole({
      projects: [project, otherProject],
      messages: [],
      activeRun: null,
      onChangeSessionProject,
    });

    const trigger = screen.getByRole("button", { name: "项目：agent-moebius，点击切换" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const target = await screen.findByRole("menuitemcheckbox", { name: "project-b" });
    fireEvent.click(target);
    expect(onChangeSessionProject).toHaveBeenCalledWith("session-a", "project-b");
  });

  it("keeps project context locked when the session has history or lineage", () => {
    const { rerender } = renderConsole({ onChangeSessionProject: vi.fn() });
    expect(screen.getByLabelText("项目：agent-moebius，已锁定")).toBeVisible();
    expect(screen.queryByRole("button", { name: /点击切换/u })).not.toBeInTheDocument();

    const props = baseProps({
      messages: [],
      selectedSession: { ...sessions[0], parentSessionId: "parent" },
      onChangeSessionProject: vi.fn(),
    });
    rerender(<OperatorConsole {...props} />);
    expect(screen.getByLabelText("项目：agent-moebius，已锁定")).toBeVisible();

    rerender(<OperatorConsole {...baseProps({
      messages: [],
      selectedSession: { ...sessions[0], childCount: 1 },
      onChangeSessionProject: vi.fn(),
    })} />);
    expect(screen.getByLabelText("项目：agent-moebius，已锁定")).toBeVisible();
  });

  it("blocks every selection entry while pending and additionally blocks send during rebind", () => {
    const onSelectSession = vi.fn();
    const onSend = vi.fn();
    renderConsole({
      messages: [],
      onSelectSession,
      onChangeSessionProject: vi.fn(),
      onSend,
      isSelectionMutationPending: true,
      isSessionProjectUpdating: true,
    });

    expect(screen.getByRole("button", { name: "在 agent-moebius 中新建会话" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "在 agent-moebius 中新建会话" }))
      .toHaveAttribute("title", "项目正在变更，请稍后再试");
    expect(screen.getByRole("button", { name: "默认会话，正在运行" })).toBeDisabled();
    expect(screen.getByLabelText("项目：agent-moebius，点击切换")).toBeDisabled();
    const composer = screen.getByRole("textbox");
    expect(composer).toBeDisabled();
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(onSelectSession).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("binds each project menu action to the project and supports rename reset plus safe removal", async () => {
    const onShowProjectInFolder = vi.fn();
    const onRenameProject = vi.fn().mockResolvedValue(undefined);
    const onRemoveProject = vi.fn().mockResolvedValue(undefined);
    renderConsole({
      project: { ...project, runningCount: 0 },
      onShowProjectInFolder,
      onRenameProject,
      onRemoveProject,
    });

    await openProjectMenu("agent-moebius");
    expect(screen.getByRole("menu")).toBeVisible();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "在文件管理器中显示",
      "修改显示名称",
      "移除项目",
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: "在文件管理器中显示" }));
    expect(onShowProjectInFolder).toHaveBeenCalledWith("/Users/example/agent-moebius");

    await openProjectMenu("agent-moebius");
    fireEvent.click(screen.getByRole("menuitem", { name: "修改显示名称" }));
    const renameDialog = screen.getByRole("dialog", { name: "修改显示名称" });
    expect(renameDialog).toHaveTextContent("不会重命名磁盘文件夹");
    fireEvent.change(screen.getByRole("textbox", { name: "显示名称" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onRenameProject).toHaveBeenCalledWith("local", ""));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "修改显示名称" })).not.toBeInTheDocument());

    await openProjectMenu("agent-moebius");
    fireEvent.click(screen.getByRole("menuitem", { name: "移除项目" }));
    const removeDialog = screen.getByRole("dialog", { name: "移除项目？" });
    expect(removeDialog).toHaveTextContent("绝不会删除或修改磁盘上的项目文件夹");
    expect(removeDialog).toHaveTextContent("/Users/example/agent-moebius");
    fireEvent.click(screen.getByRole("button", { name: "移除项目" }));
    await waitFor(() => expect(onRemoveProject).toHaveBeenCalledWith("local", false));
  });

  it("warns independently before forcing running agents to stop and remove the project", async () => {
    const onRemoveProject = vi.fn().mockResolvedValue(undefined);
    renderConsole({ onRemoveProject });

    await openProjectMenu("agent-moebius");
    fireEvent.click(screen.getByRole("menuitem", { name: "移除项目" }));
    const warning = screen.getByRole("dialog", { name: "项目中仍有 Agent 正在运行" });
    expect(warning).toHaveTextContent("可以取消");
    expect(screen.queryByRole("dialog", { name: "移除项目？" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "强制中止并继续" }));
    expect(screen.queryByRole("dialog", { name: "项目中仍有 Agent 正在运行" })).not.toBeInTheDocument();
    const confirmation = screen.getByRole("dialog", { name: "移除项目？" });
    expect(confirmation).toHaveTextContent("绝不会删除或修改磁盘上的项目文件夹");
    fireEvent.click(screen.getByRole("button", { name: "中止并移除" }));
    await waitFor(() => expect(onRemoveProject).toHaveBeenCalledWith("local", true));
  });

  it("keeps history readable while blocking work and confirms folder repair with both paths", async () => {
    const onSelectSession = vi.fn();
    const onSend = vi.fn();
    const onSelectFolderForRepair = vi.fn().mockResolvedValue("/Users/example/moved-agent-moebius");
    const onRepairProjectFolder = vi.fn().mockResolvedValue(undefined);
    renderConsole({
      project: {
        ...project,
        directoryAvailable: false,
        directoryUnavailableReason: "当前项目本地文件夹未找到，可以指定新的文件夹",
        newConversationDisabledReason: "当前项目本地文件夹不可用，无法新建对话",
      },
      activeRun: null,
      onSelectSession,
      onSend,
      onChangeSessionWorkspace: vi.fn(),
      onSelectFolderForRepair,
      onRepairProjectFolder,
    });

    expect(screen.getByRole("button", { name: "新建对话" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Agent 团队" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "在 agent-moebius 中新建会话" })).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByText("历史对话只读；修复文件夹后可继续")).toBeVisible();
    expect(screen.getByRole("button", { name: "工作空间：独立工作空间，点击切换" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "默认会话，正在运行" }));
    expect(onSelectSession).toHaveBeenCalledWith({ sessionId: "session-a", projectId: "local" });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "修复 agent-moebius 项目文件夹" }));
    expect(onSelectFolderForRepair).toHaveBeenCalledWith("local");
    const dialog = await screen.findByRole("dialog", { name: "修复项目文件夹" });
    expect(dialog).toHaveTextContent("不会移动、复制或重命名任何磁盘文件");
    expect(screen.getByTestId("repair-original-folder")).toHaveTextContent("/Users/example/agent-moebius");
    expect(screen.getByTestId("repair-new-folder")).toHaveTextContent("/Users/example/moved-agent-moebius");

    fireEvent.click(screen.getByRole("button", { name: "确认新位置" }));
    await waitFor(() => expect(onRepairProjectFolder).toHaveBeenCalledWith("local", "/Users/example/moved-agent-moebius"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "修复项目文件夹" })).not.toBeInTheDocument());

  });

  it("shows an unselected new-conversation state after the current project is removed", () => {
    renderConsole({
      newConversation: {
        selectedProjectId: null,
        selectedTeamKey: agentTeam.teamKey,
        draft: "",
        isSubmitting: false,
        error: null,
      },
      agentTeamsState: { status: "ready", teams: [agentTeam] },
      onRemoveProject: vi.fn(),
    });

    expect(screen.getByRole("region", { name: "新建对话" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "新对话" })).toBeVisible();
    expect(screen.getByRole("button", { name: "项目：未选择，点击选择" })).toHaveTextContent("选择项目");
    expect(screen.queryByRole("region", { name: "会话时间线" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "默认会话，正在运行" })).not.toHaveAttribute("aria-current");
  });
});

async function openProjectMenu(projectName: string): Promise<void> {
  const trigger = screen.getByRole("button", { name: `${projectName} 项目菜单` });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  await screen.findByRole("menu");
}

function renderConsole(overrides: Partial<OperatorConsoleProps> = {}) {
  return render(<OperatorConsole {...baseProps(overrides)} />);
}

function setWindowWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  fireEvent(window, new Event("resize"));
}

function firePointer(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  input: { pointerId: number; button: number; clientX: number },
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: input.button,
    clientX: input.clientX,
  });
  Object.defineProperty(event, "pointerId", { value: input.pointerId });
  fireEvent(element, event);
}

function baseProps(overrides: Partial<OperatorConsoleProps> = {}): OperatorConsoleProps {
  return {
    project,
    selectedSessionId: "session-a",
    selectedSession: sessions[0],
    messages: [message({ id: 1, body: "@dev hello" })],
    activeRun: null,
    composerValue: "@dev next",
    runnerStatus: "running",
    sqlitePath: "/tmp/local-console.sqlite",
    lastError: null,
    onComposerChange: vi.fn(),
    onSend: vi.fn(),
    onSelectSession: vi.fn(),
    onInterrupt: vi.fn(),
    ...overrides,
  };
}

const sessions: OperatorSession[] = [
  {
    sessionId: "session-a",
    projectId: "local",
    workspaceMode: "worktree",
    workspacePendingMode: null,
    workspaceUnavailableReason: null,
    branchName: "agent/session-a",
    title: "默认会话",
    status: "running",
    awaitsHumanReason: null,
    unreadSince: null,
    runningCount: 1,
    waitingCount: 0,
    stuckCount: 0,
    errorCount: 0,
    interruptedCount: 0,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:01.000Z",
  },
  {
    sessionId: "session-b",
    projectId: "local",
    workspaceMode: "direct",
    workspacePendingMode: null,
    workspaceUnavailableReason: null,
    branchName: "main",
    title: "验收会话",
    status: "failed",
    awaitsHumanReason: "exception",
    unreadSince: null,
    runningCount: 0,
    waitingCount: 0,
    stuckCount: 0,
    errorCount: 1,
    interruptedCount: 0,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:01.000Z",
  },
];

const project: OperatorProject = {
  projectId: "local",
  sourceType: "local-folder",
  title: "agent-moebius",
  folderPath: "/Users/example/agent-moebius",
  worktreeMode: true,
  workspaceCwd: "/tmp/agent-moebius-local-worktree",
  workspaceMode: "worktree",
  worktreePath: "/tmp/agent-moebius-local-worktree",
  worktreeUnavailableReason: null,
  workspaceUpdatedAt: "2026-07-09T00:00:01.000Z",
  branchName: "main",
  isGitRepository: true,
  directoryAvailable: true,
  directoryUnavailableReason: null,
  sessions,
  runningCount: 1,
  waitingCount: 0,
  stuckCount: 0,
  errorCount: 1,
};

const agentTeam = {
  teamKey: "system:development",
  id: "development",
  ownership: "system" as const,
  name: "开发团队",
  description: "负责软件开发任务",
  primaryAgentSlug: "manager",
  memberOrder: ["manager"],
  members: [{ slug: "manager", displayName: "开发经理", description: "默认接单" }],
  status: "usable" as const,
  canCreateConversation: true,
};

const fiveMemberTeam = {
  ...agentTeam,
  memberOrder: ["dev", "manager", "qa", "product", "security"],
  members: [
    { slug: "dev", displayName: "开发", description: "实现功能" },
    { slug: "manager", displayName: "开发经理", description: "默认接单" },
    { slug: "qa", displayName: "测试", description: "质量保证" },
    { slug: "product", displayName: "产品", description: "产品定义" },
    { slug: "security", displayName: "安全", description: "安全审查" },
  ],
};

function detailStateFor(teamKey: string) {
  return {
    teamKey,
    selectedMemberSlug: "manager",
    memberEditors: {
      manager: {
        memberSlug: "manager",
        loadStatus: "ready" as const,
        loadError: null,
        draftMarkdown: "# 开发经理\n\n默认接单\n",
        isDirty: false,
        saveStatus: "idle" as const,
        saveError: null,
        externalChangeStatus: "none" as const,
        displayName: "开发经理",
        description: "默认接单",
      },
    },
    saveAllFailures: [],
  };
}

const draftTeam = {
  teamKey: "user:draft",
  id: "draft",
  ownership: "user" as const,
  name: "新的团队",
  description: null,
  primaryAgentSlug: null,
  memberOrder: [],
  members: [],
  status: "unfinished-draft" as const,
  canCreateConversation: false,
};

const repairTeam = {
  teamKey: "user:repair",
  id: "repair",
  ownership: "user" as const,
  name: "客户支持团队",
  description: "处理客户问题",
  primaryAgentSlug: "lead",
  memberOrder: ["lead"],
  members: [],
  status: "needs-repair" as const,
  canCreateConversation: false,
};

const runSnapshot: OperatorRunSnapshot = {
  sessionId: "session-a",
  runId: "run-1",
  role: "dev",
  status: "running",
  startedAt: "2026-07-09T00:00:00.000Z",
  elapsedMs: 12_000,
  runDir: "/tmp/agent-moebius-run",
  cwd: "/tmp/agent-moebius-local-worktree",
  workspaceMode: "worktree",
  worktreeUnavailableReason: null,
  stdoutTail: "live tail from codex",
  stderrTail: null,
  lastOutputSummary: "live tail from codex",
  tailDiagnostic: null,
  interruptible: true,
};

function message(input: Partial<OperatorMessage> & { id: number; body: string }): OperatorMessage {
  return {
    id: input.id,
    sessionId: input.sessionId ?? "session-a",
    speaker: input.speaker ?? "user",
    role: input.role ?? null,
    body: input.body,
    status: input.status ?? "completed",
    runId: input.runId ?? null,
    runDir: input.runDir ?? null,
    error: input.error ?? null,
    createdAt: input.createdAt ?? "2026-07-09T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-07-09T00:00:01.000Z",
  };
}
