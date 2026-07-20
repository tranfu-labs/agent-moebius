import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ConversationSidebar,
  deriveProjectStatusDot,
  deriveStatusDot,
  orderProjectIdsForPointer,
  orderSessionsByCreatedAt,
  projectDirectoryName,
  type ConversationSidebarProject
} from "./conversation-sidebar";

describe("ConversationSidebar", () => {
  it("uses a display name when present and otherwise derives the project name from the directory path", () => {
    expect(projectDirectoryName({ path: "/Users/example/agent-moebius/" })).toBe("agent-moebius");
    expect(projectDirectoryName({ path: "C:\\Users\\example\\tranfu-site" })).toBe("tranfu-site");
    expect(projectDirectoryName({ path: "/Users/example/agent-moebius/", label: "  展示名称  " })).toBe("展示名称");
    expect(projectDirectoryName({ path: "/Users/example/agent-moebius/", label: "   " })).toBe("agent-moebius");
  });

  it("orders sessions by createdAt descending without mutating input and preserves ties", () => {
    const sessions = [
      { id: "oldest", createdAt: "2026-07-09T00:00:00.000Z" },
      { id: "newest", createdAt: "2026-07-09T00:02:00.000Z" },
      { id: "same-time-a", createdAt: "2026-07-09T00:01:00.000Z" },
      { id: "same-time-b", createdAt: "2026-07-09T00:01:00.000Z" }
    ];

    expect(orderSessionsByCreatedAt(sessions).map((session) => session.id)).toEqual([
      "newest",
      "same-time-a",
      "same-time-b",
      "oldest"
    ]);
    expect(sessions.map((session) => session.id)).toEqual(["oldest", "newest", "same-time-a", "same-time-b"]);
  });

  it("derives one status dot with red, blue, blink, none priority", () => {
    expect(deriveStatusDot({ awaitsHumanReason: "answer", unreadSince: "2026-07-09T00:02:00.000Z", isRunning: true })).toBe("red");
    expect(deriveStatusDot({ awaitsHumanReason: null, unreadSince: "2026-07-09T00:02:00.000Z", isRunning: true })).toBe("blue");
    expect(deriveStatusDot({ awaitsHumanReason: null, unreadSince: null, isRunning: true })).toBe("blink");
    expect(deriveStatusDot({ awaitsHumanReason: null, unreadSince: null, isRunning: false })).toBe("none");
  });

  it("places the dragged project around row midpoints without mutating input", () => {
    const projectIds = ["alpha", "beta", "gamma"];
    expect(orderProjectIdsForPointer(projectIds, "alpha", 75, [
      { id: "alpha", top: 0, bottom: 40 },
      { id: "beta", top: 40, bottom: 80 },
      { id: "gamma", top: 80, bottom: 120 },
    ])).toEqual(["beta", "alpha", "gamma"]);
    expect(orderProjectIdsForPointer(projectIds, "gamma", 10, [
      { id: "alpha", top: 0, bottom: 40 },
      { id: "beta", top: 40, bottom: 80 },
      { id: "gamma", top: 80, bottom: 120 },
    ])).toEqual(["gamma", "alpha", "beta"]);
    expect(projectIds).toEqual(["alpha", "beta", "gamma"]);
  });

  it("aggregates project status with red, blue, blink, none priority", () => {
    const none = { awaitsHumanReason: null, unreadSince: null, isRunning: false };
    const blink = { ...none, isRunning: true };
    const blue = { ...none, unreadSince: "2026-07-09T00:02:00.000Z" };
    const red = { ...none, awaitsHumanReason: "acceptance" };

    expect(deriveProjectStatusDot([blink, blue, red])).toBe("red");
    expect(deriveProjectStatusDot([blink, blue])).toBe("blue");
    expect(deriveProjectStatusDot([none, blink])).toBe("blink");
    expect(deriveProjectStatusDot([none])).toBe("none");
    expect(deriveProjectStatusDot([])).toBe("none");
  });

  it("renders every session in createdAt descending order without a completed group", () => {
    render(<ConversationSidebar projects={[project]} selectedSessionId="idle-refactor" />);

    expect(screen.getByText("agent-moebius")).toBeInTheDocument();
    expect(screen.queryByText(/已完成/u)).not.toBeInTheDocument();

    const conversationList = screen.getByRole("list", { name: "agent-moebius 对话" });
    expect(within(conversationList).getAllByTestId("conversation-sidebar-session").map((row) => row.dataset.sessionId)).toEqual([
      "running-progress",
      "waiting-summary",
      "idle-refactor",
      "docs-history"
    ]);
  });

  it("keeps order unchanged when selection and statuses change, then puts a new session first", () => {
    const { rerender } = render(<ConversationSidebar projects={[project]} selectedSessionId="idle-refactor" />);
    const sessionIds = () => screen.getAllByTestId("conversation-sidebar-session").map((row) => row.dataset.sessionId);
    expect(sessionIds()).toEqual(["running-progress", "waiting-summary", "idle-refactor", "docs-history"]);

    const changedProject: ConversationSidebarProject = {
      ...project,
      sessions: project.sessions.map((session) => ({
        ...session,
        awaitsHumanReason: null,
        unreadSince: session.id === "waiting-summary" ? "2026-07-09T00:04:00.000Z" : null,
        isRunning: session.id === "idle-refactor"
      }))
    };
    rerender(<ConversationSidebar projects={[changedProject]} selectedSessionId="waiting-summary" />);
    expect(sessionIds()).toEqual(["running-progress", "waiting-summary", "idle-refactor", "docs-history"]);

    rerender(
      <ConversationSidebar
        projects={[{
          ...changedProject,
          sessions: [
            ...changedProject.sessions,
            {
              id: "brand-new",
              title: "刚创建的对话",
              awaitsHumanReason: null,
              unreadSince: null,
              isRunning: false,
              createdAt: "2026-07-09T00:04:00.000Z"
            }
          ]
        }]}
        selectedSessionId="brand-new"
      />
    );
    expect(sessionIds()).toEqual(["brand-new", "running-progress", "waiting-summary", "idle-refactor", "docs-history"]);
  });

  it("marks selection without changing order and reports the selected session", () => {
    const onSelectSession = vi.fn();
    render(<ConversationSidebar projects={[project]} selectedSessionId="idle-refactor" onSelectSession={onSelectSession} />);

    expect(screen.getByRole("button", { name: "导出功能重构" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "进度提示，正在运行" }));
    expect(onSelectSession).toHaveBeenCalledWith("running-progress", "agent-moebius");
  });

  it("exposes red, blue, and blinking meanings without relying on color while none has no status suffix", () => {
    render(<ConversationSidebar projects={[project]} />);

    expect(screen.getByRole("button", { name: "失败汇总，需要你处理" })).toHaveAttribute("data-status-dot", "red");
    expect(screen.getByRole("button", { name: "文档记录，有新结果" })).toHaveAttribute("data-status-dot", "blue");
    expect(screen.getByRole("button", { name: "进度提示，正在运行" })).toHaveAttribute("data-status-dot", "blink");
    expect(screen.getByRole("button", { name: "导出功能重构" })).toHaveAttribute("data-status-dot", "none");
  });

  it("toggles a project independently and only shows its aggregated status while collapsed", () => {
    const secondProject: ConversationSidebarProject = {
      id: "second-project",
      path: "/Users/example/work/second-project",
      sessions: [{
        id: "second-running",
        title: "第二项目运行",
        awaitsHumanReason: null,
        unreadSince: null,
        isRunning: true,
        createdAt: "2026-07-09T00:00:00.000Z",
      }],
    };
    render(<ConversationSidebar projects={[project, secondProject]} selectedSessionId="idle-refactor" />);

    const [firstRow] = screen.getAllByTestId("conversation-sidebar-project");
    const firstToggle = screen.getByRole("button", { name: "agent-moebius 项目，已展开" });
    const secondToggle = screen.getByRole("button", { name: "second-project 项目，已展开" });
    expect(firstToggle).toHaveAttribute("aria-expanded", "true");
    expect(firstToggle).toHaveAttribute("data-status-dot", "none");
    expect(secondToggle).toHaveAttribute("aria-expanded", "true");

    firePointer(firstRow!, "pointerdown", { pointerId: 10, button: 0, clientX: 10, clientY: 10 });
    firePointer(firstRow!, "pointerup", { pointerId: 10, button: 0, clientX: 10, clientY: 10 });

    const collapsedToggle = screen.getByRole("button", { name: "agent-moebius 项目，已折叠，需要你处理" });
    expect(collapsedToggle).toHaveAttribute("aria-expanded", "false");
    expect(collapsedToggle).toHaveAttribute("data-status-dot", "red");
    expect(screen.queryByRole("list", { name: "agent-moebius 对话" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "second-project 对话" })).toBeVisible();
    expect(secondToggle).toHaveAttribute("aria-expanded", "true");

    firePointer(collapsedToggle, "pointerdown", { pointerId: 11, button: 0, clientX: 10, clientY: 10 });
    firePointer(collapsedToggle, "pointerup", { pointerId: 11, button: 0, clientX: 10, clientY: 10 });

    expect(screen.getByRole("button", { name: "agent-moebius 项目，已展开" })).toHaveAttribute("data-status-dot", "none");
    expect(screen.getByRole("button", { name: "导出功能重构" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps project action buttons from bubbling into the project disclosure", () => {
    const onNewConversation = vi.fn();
    const onShowProjectInFolder = vi.fn();
    const onOuterClick = vi.fn();
    render(
      <div onClick={onOuterClick}>
        <ConversationSidebar
          projects={[project]}
          onNewConversation={onNewConversation}
          onShowProjectInFolder={onShowProjectInFolder}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "在 agent-moebius 中新建会话" }));
    fireEvent.click(screen.getByRole("button", { name: "agent-moebius 项目菜单" }));

    expect(onNewConversation).toHaveBeenCalledWith("agent-moebius");
    expect(onOuterClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "agent-moebius 项目，已展开" })).toHaveAttribute("aria-expanded", "true");
  });

  it("requests a new conversation for the project row that owns the button", () => {
    const onNewConversation = vi.fn();
    const secondProject = {
      id: "second-project",
      path: "/Users/example/work/second-project",
      sessions: [],
    };
    render(<ConversationSidebar projects={[project, secondProject]} onNewConversation={onNewConversation} />);

    fireEvent.click(screen.getByRole("button", { name: "在 second-project 中新建会话" }));
    expect(onNewConversation).toHaveBeenCalledWith("second-project");
    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });

  it("toggles from the project row while keeping its new-conversation button independent", () => {
    const onNewConversation = vi.fn();
    render(<ConversationSidebar projects={[project]} onNewConversation={onNewConversation} />);
    const projectRow = screen.getByTestId("conversation-sidebar-project");
    const projectToggle = screen.getByRole("button", { name: "agent-moebius 项目，已展开" });

    firePointer(projectRow, "pointerdown", { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    firePointer(projectRow, "pointerup", { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    expect(projectToggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "在 agent-moebius 中新建会话" }));
    expect(onNewConversation).toHaveBeenCalledWith("agent-moebius");
    expect(projectToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the project menu independent from row dragging and collapsing", () => {
    const onShowProjectInFolder = vi.fn();
    render(<ConversationSidebar projects={[project]} onShowProjectInFolder={onShowProjectInFolder} />);
    const projectRow = screen.getByTestId("conversation-sidebar-project");
    const projectToggle = screen.getByRole("button", { name: "agent-moebius 项目，已展开" });
    const menuTrigger = screen.getByRole("button", { name: "agent-moebius 项目菜单" });

    firePointer(menuTrigger, "pointerdown", { pointerId: 4, button: 0, clientX: 190, clientY: 10 });
    firePointer(menuTrigger, "pointerup", { pointerId: 4, button: 0, clientX: 190, clientY: 10 });
    fireEvent.click(menuTrigger);

    expect(projectRow).not.toHaveClass("cursor-grabbing");
    expect(projectToggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "在文件管理器中显示" }));
    expect(onShowProjectInFolder).toHaveBeenCalledWith(project);
  });

  it("requires 5px and 150ms before reordering and does not toggle after a drag", async () => {
    vi.useFakeTimers();
    try {
      const onReorderProjects = vi.fn(async () => true);
      const secondProject: ConversationSidebarProject = {
        id: "second-project",
        path: "/Users/example/work/second-project",
        sessions: [],
      };
      render(
        <ConversationSidebar
          projects={[project, secondProject]}
          onReorderProjects={onReorderProjects}
        />,
      );
      const [firstRow, secondRow] = screen.getAllByTestId("conversation-sidebar-project");
      vi.spyOn(firstRow!, "getBoundingClientRect").mockReturnValue(rect(0, 40));
      vi.spyOn(secondRow!, "getBoundingClientRect").mockReturnValue(rect(40, 80));

      firePointer(firstRow!, "pointerdown", { pointerId: 2, button: 0, clientX: 10, clientY: 10 });
      firePointer(firstRow!, "pointermove", { pointerId: 2, button: 0, clientX: 10, clientY: 90 });
      act(() => vi.advanceTimersByTime(149));
      expect(onReorderProjects).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      firePointer(firstRow!, "pointerup", { pointerId: 2, button: 0, clientX: 10, clientY: 90 });

      expect(onReorderProjects).toHaveBeenCalledWith(["second-project", "agent-moebius"]);
      const projectToggle = within(firstRow!).getByRole("button", { name: "agent-moebius 项目，已展开" });
      expect(projectToggle).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await act(async () => Promise.resolve());

      firePointer(projectToggle, "pointerdown", { pointerId: 5, button: 0, clientX: 10, clientY: 10 });
      firePointer(projectToggle, "pointerup", { pointerId: 5, button: 0, clientX: 10, clientY: 10 });
      expect(
        within(firstRow!).getByRole("button", { name: "agent-moebius 项目，已折叠，需要你处理" }),
      ).toHaveAttribute("aria-expanded", "false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a newly inserted top project expanded", () => {
    const { rerender } = render(<ConversationSidebar projects={[project]} />);
    const existingRow = screen.getByTestId("conversation-sidebar-project");
    firePointer(existingRow, "pointerdown", { pointerId: 3, button: 0, clientX: 10, clientY: 10 });
    firePointer(existingRow, "pointerup", { pointerId: 3, button: 0, clientX: 10, clientY: 10 });

    const newProject: ConversationSidebarProject = {
      id: "new-top-project",
      path: "/Users/example/work/new-top-project",
      sessions: [],
    };
    rerender(<ConversationSidebar projects={[newProject, project]} />);

    const rows = screen.getAllByTestId("conversation-sidebar-project");
    expect(rows.map((row) => row.dataset.projectId)).toEqual(["new-top-project", "agent-moebius"]);
    expect(screen.getByRole("button", { name: "new-top-project 项目，已展开" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "agent-moebius 项目，已折叠，需要你处理" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("blocks project creation and session selection while a selection mutation is pending", () => {
    const onNewConversation = vi.fn();
    const onSelectSession = vi.fn();
    render(
      <ConversationSidebar
        projects={[project]}
        onNewConversation={onNewConversation}
        onSelectSession={onSelectSession}
        disabled
        disabledReason="项目正在变更，请稍后再试"
      />,
    );

    const createButton = screen.getByRole("button", { name: "在 agent-moebius 中新建会话" });
    const sessionButton = screen.getByRole("button", { name: "导出功能重构" });
    expect(createButton).toBeDisabled();
    expect(createButton).toHaveAttribute("title", "项目正在变更，请稍后再试");
    expect(createButton).toHaveAttribute("aria-description", "项目正在变更，请稍后再试");
    expect(sessionButton).toBeDisabled();
    fireEvent.click(createButton);
    fireEvent.click(sessionButton);
    expect(onNewConversation).not.toHaveBeenCalled();
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it("explains why a project with an unavailable directory cannot start a conversation", () => {
    const onNewConversation = vi.fn();
    render(
      <ConversationSidebar
        projects={[{
          ...project,
          newConversationDisabledReason: "当前项目本地文件夹不可用，无法新建对话",
        }]}
        onNewConversation={onNewConversation}
      />,
    );

    const createButton = screen.getByRole("button", { name: "在 agent-moebius 中新建会话" });
    expect(createButton).toBeDisabled();
    expect(createButton).toHaveAttribute("title", "当前项目本地文件夹不可用，无法新建对话");
    expect(createButton).toHaveAttribute("aria-description", "当前项目本地文件夹不可用，无法新建对话");
    fireEvent.click(createButton);
    expect(onNewConversation).not.toHaveBeenCalled();
  });

  it("renders folder repair as an independent red wrench outside the project menu", async () => {
    const onRepairProject = vi.fn();
    render(
      <ConversationSidebar
        projects={[{
          ...project,
          directoryAvailable: false,
          directoryUnavailableReason: "当前项目本地文件夹未找到，可以指定新的文件夹",
        }]}
        onRepairProject={onRepairProject}
        onShowProjectInFolder={vi.fn()}
        onRenameProject={vi.fn()}
        onRemoveProject={vi.fn()}
      />,
    );

    const repair = screen.getByRole("button", { name: "修复 agent-moebius 项目文件夹" });
    expect(repair).toHaveClass("text-danger");
    expect(repair).toHaveAttribute("title", "当前项目本地文件夹未找到，可以指定新的文件夹");
    fireEvent.click(repair);
    expect(onRepairProject).toHaveBeenCalledWith(expect.objectContaining({ id: "agent-moebius" }));

    const menuTrigger = screen.getByRole("button", { name: "agent-moebius 项目菜单" });
    fireEvent.keyDown(menuTrigger, { key: "ArrowDown" });
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByText(/修复/u)).not.toBeInTheDocument();
  });
});

const project: ConversationSidebarProject = {
  id: "agent-moebius",
  path: "/Users/example/work/agent-moebius",
  sessions: [
    { id: "idle-refactor", title: "导出功能重构", awaitsHumanReason: null, unreadSince: null, isRunning: false, createdAt: "2026-07-09T00:01:00.000Z" },
    { id: "docs-history", title: "文档记录", awaitsHumanReason: null, unreadSince: "2026-07-09T00:00:30.000Z", isRunning: false, createdAt: "2026-07-09T00:00:00.000Z" },
    { id: "running-progress", title: "进度提示", awaitsHumanReason: null, unreadSince: null, isRunning: true, createdAt: "2026-07-09T00:03:00.000Z" },
    { id: "waiting-summary", title: "失败汇总", awaitsHumanReason: "acceptance", unreadSince: "2026-07-09T00:02:30.000Z", isRunning: true, createdAt: "2026-07-09T00:02:00.000Z" }
  ]
};

function rect(top: number, bottom: number): DOMRect {
  return {
    x: 0,
    y: top,
    width: 200,
    height: bottom - top,
    top,
    right: 200,
    bottom,
    left: 0,
    toJSON: () => ({}),
  };
}

function firePointer(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  input: { pointerId: number; button: number; clientX: number; clientY: number },
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: input.button,
    clientX: input.clientX,
    clientY: input.clientY,
  });
  Object.defineProperty(event, "pointerId", { value: input.pointerId });
  fireEvent(element, event);
}
