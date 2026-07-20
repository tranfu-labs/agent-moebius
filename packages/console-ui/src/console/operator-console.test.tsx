import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  OperatorConsole,
  type OperatorConsoleProps,
  type OperatorMessage,
  type OperatorProject,
  type OperatorRunSnapshot,
  type OperatorSession,
} from "./operator-console";

describe("OperatorConsole", () => {
  it("renders the fixed sidebar skeleton around the only scrolling project region", () => {
    renderConsole({ onOpenProject: vi.fn(), onOpenDiagnostics: vi.fn() });

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

  it("opens the new-conversation placeholder without creating a persisted session", () => {
    renderConsole();

    fireEvent.click(screen.getByRole("button", { name: "新建对话" }));

    expect(screen.getByRole("dialog", { name: "新建对话" })).toBeVisible();
    expect(screen.getByText("此入口不会直接创建空白对话。", { exact: false })).toBeVisible();
    expect(screen.getByRole("button", { name: "创建对话" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog", { name: "新建对话" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "默认会话，正在运行" })).toHaveAttribute("aria-current", "page");
  });

  it("opens the same new-conversation placeholder with the owning project preselected", () => {
    const secondProject: OperatorProject = {
      ...project,
      projectId: "project-b",
      title: "project-b",
      folderPath: "/Users/example/project-b",
      sessions: [],
    };
    renderConsole({ projects: [project, secondProject] });

    fireEvent.click(screen.getByRole("button", { name: "在 project-b 中新建会话" }));

    const dialog = screen.getByRole("dialog", { name: "新建对话" });
    expect(dialog).toBeVisible();
    expect(screen.getByTestId("preselected-project")).toHaveTextContent("已预选项目");
    expect(screen.getByTestId("preselected-project")).toHaveTextContent("project-b");
    expect(screen.getByText("此入口不会直接创建空白对话。", { exact: false })).toBeVisible();
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
    expect(screen.queryByRole("dialog", { name: "新建对话" })).not.toBeInTheDocument();
  });

  it("offers project setup from the new-conversation placeholder when no project exists", () => {
    const onOpenProject = vi.fn();
    renderConsole({ projects: [], onOpenProject });

    fireEvent.click(screen.getByRole("button", { name: "新建对话" }));

    expect(screen.getByText("还没有项目")).toBeVisible();
    expect(screen.getByRole("button", { name: "创建对话" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "添加项目" }));
    expect(onOpenProject).toHaveBeenCalledTimes(1);
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

  it("routes Agent Teams to a selected stub page and restores the current conversation", () => {
    renderConsole();
    const teamsEntry = screen.getByRole("button", { name: "Agent 团队" });

    fireEvent.click(teamsEntry);

    expect(teamsEntry).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Agent 团队" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "会话时间线" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "返回当前对话" }));
    expect(teamsEntry).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("region", { name: "会话时间线" })).toBeVisible();
    expect(screen.getByRole("button", { name: "默认会话，正在运行" })).toHaveAttribute("aria-current", "page");
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
    expect(screen.getByText("默认会话")).toBeVisible();
    expect(screen.getByText("验收会话")).toBeVisible();
    expect(screen.getByText("开发")).toBeVisible();
    expect(screen.getByText("00:12")).toBeVisible();
    expect(screen.getByText("live tail from codex")).toBeVisible();
    expect(screen.getByText("隔离工作区")).toBeVisible();
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

  it("renders derived sessions as peers with no parent breadcrumb or tree controls", () => {
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
    expect(screen.getByText("裂变会话")).toBeVisible();
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

  it("moves the existing worktree mutation into the composer context", () => {
    const onToggleProjectWorktree = vi.fn();
    renderConsole({ onToggleProjectWorktree });

    fireEvent.click(screen.getByRole("button", { name: "工作区：隔离工作区，点击切换" }));
    expect(onToggleProjectWorktree).toHaveBeenCalledWith("local", false);
    expect(screen.queryByRole("button", { name: /关闭隔离工作区/u })).not.toBeInTheDocument();
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
      onToggleProjectWorktree: vi.fn(),
      onSelectFolderForRepair,
      onRepairProjectFolder,
    });

    expect(screen.getByRole("button", { name: "新建对话" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agent 团队" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "在 agent-moebius 中新建会话" })).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByText("历史对话只读；修复文件夹后可继续")).toBeVisible();
    expect(screen.getByRole("button", { name: "工作区：隔离工作区，点击切换" })).toBeDisabled();

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
    renderConsole({ isNewConversationWithoutProject: true, onRemoveProject: vi.fn() });

    expect(screen.getByRole("region", { name: "新建对话" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "新建对话" })).toBeVisible();
    expect(screen.getByRole("button", { name: "项目：未选择" })).toHaveTextContent("未选择项目");
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
  directoryAvailable: true,
  directoryUnavailableReason: null,
  sessions,
  runningCount: 1,
  waitingCount: 0,
  stuckCount: 0,
  errorCount: 1,
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
