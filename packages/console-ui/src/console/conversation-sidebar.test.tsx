import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ConversationSidebar,
  orderSessionsByCreatedAt,
  projectDirectoryName,
  type ConversationSidebarProject
} from "./conversation-sidebar";

describe("ConversationSidebar", () => {
  it("derives the project name from the directory path", () => {
    expect(projectDirectoryName({ path: "/Users/example/agent-moebius/" })).toBe("agent-moebius");
    expect(projectDirectoryName({ path: "C:\\Users\\example\\tranfu-site" })).toBe("tranfu-site");
    expect(projectDirectoryName({ path: "///", label: "fallback" })).toBe("fallback");
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
        status: session.id === "idle-refactor" ? "running" : "idle"
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
              status: "idle",
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

    expect(screen.getByRole("button", { name: "导出功能重构，静止" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "进度提示，运行中" }));
    expect(onSelectSession).toHaveBeenCalledWith("running-progress", "agent-moebius");
  });

  it("creates a session for the project row that owns the button", () => {
    const onCreateSession = vi.fn();
    const secondProject = {
      id: "second-project",
      path: "/Users/example/work/second-project",
      sessions: [],
    };
    render(<ConversationSidebar projects={[project, secondProject]} onCreateSession={onCreateSession} />);

    fireEvent.click(screen.getByRole("button", { name: "在 second-project 中新建会话" }));
    expect(onCreateSession).toHaveBeenCalledWith("second-project");
    expect(onCreateSession).toHaveBeenCalledTimes(1);
  });

  it("blocks project creation and session selection while a selection mutation is pending", () => {
    const onCreateSession = vi.fn();
    const onSelectSession = vi.fn();
    render(
      <ConversationSidebar
        projects={[project]}
        onCreateSession={onCreateSession}
        onSelectSession={onSelectSession}
        disabled
      />,
    );

    const createButton = screen.getByRole("button", { name: "在 agent-moebius 中新建会话" });
    const sessionButton = screen.getByRole("button", { name: "导出功能重构，静止" });
    expect(createButton).toBeDisabled();
    expect(sessionButton).toBeDisabled();
    fireEvent.click(createButton);
    fireEvent.click(sessionButton);
    expect(onCreateSession).not.toHaveBeenCalled();
    expect(onSelectSession).not.toHaveBeenCalled();
  });
});

const project: ConversationSidebarProject = {
  id: "agent-moebius",
  path: "/Users/example/work/agent-moebius",
  sessions: [
    { id: "idle-refactor", title: "导出功能重构", status: "idle", createdAt: "2026-07-09T00:01:00.000Z" },
    { id: "docs-history", title: "文档记录", status: "idle", createdAt: "2026-07-09T00:00:00.000Z" },
    { id: "running-progress", title: "进度提示", status: "running", createdAt: "2026-07-09T00:03:00.000Z" },
    { id: "waiting-summary", title: "失败汇总", status: "waiting", createdAt: "2026-07-09T00:02:00.000Z" }
  ]
};
