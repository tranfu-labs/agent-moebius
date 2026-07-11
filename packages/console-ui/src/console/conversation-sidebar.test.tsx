import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ConversationSidebar,
  projectDirectoryName,
  sortConversationSessions,
  type ConversationSidebarProject
} from "./conversation-sidebar";

describe("ConversationSidebar", () => {
  it("derives the project name from the directory path", () => {
    expect(projectDirectoryName({ path: "/Users/example/agent-moebius/" })).toBe("agent-moebius");
    expect(projectDirectoryName({ path: "C:\\Users\\example\\tranfu-site" })).toBe("tranfu-site");
    expect(projectDirectoryName({ path: "///", label: "fallback" })).toBe("fallback");
  });

  it("sorts sessions by waiting, running, idle, and completed without mutating input", () => {
    const sessions = [
      { id: "idle", status: "idle" as const },
      { id: "completed", status: "completed" as const },
      { id: "running", status: "running" as const },
      { id: "waiting", status: "waiting" as const },
      { id: "running-two", status: "running" as const }
    ];

    expect(sortConversationSessions(sessions).map((session) => session.id)).toEqual([
      "waiting",
      "running",
      "running-two",
      "idle",
      "completed"
    ]);
    expect(sessions.map((session) => session.id)).toEqual(["idle", "completed", "running", "waiting", "running-two"]);
  });

  it("renders sorted active sessions and keeps completed sessions collapsed by default", () => {
    render(<ConversationSidebar projects={[project]} selectedSessionId="idle-refactor" />);

    expect(screen.getByText("agent-moebius")).toBeInTheDocument();
    expect(screen.queryByText("文档归档")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已完成 (1)" })).toHaveAttribute("aria-expanded", "false");

    const activeList = screen.getByRole("list", { name: "agent-moebius 活跃会话" });
    expect(within(activeList).getAllByTestId("conversation-sidebar-session").map((row) => row.dataset.sessionId)).toEqual([
      "waiting-summary",
      "running-progress",
      "idle-refactor"
    ]);

    fireEvent.click(screen.getByRole("button", { name: "已完成 (1)" }));
    expect(screen.getByRole("button", { name: "已完成 (1)" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("文档归档")).toBeInTheDocument();
  });

  it("marks selection without changing order and reports the selected session", () => {
    const onSelectSession = vi.fn();
    render(<ConversationSidebar projects={[project]} selectedSessionId="idle-refactor" onSelectSession={onSelectSession} />);

    expect(screen.getByRole("button", { name: "导出功能重构，静止" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "进度提示，运行中" }));
    expect(onSelectSession).toHaveBeenCalledWith("running-progress", "agent-moebius");
  });
});

const project: ConversationSidebarProject = {
  id: "agent-moebius",
  path: "/Users/example/work/agent-moebius",
  sessions: [
    { id: "idle-refactor", title: "导出功能重构", status: "idle" },
    { id: "completed-docs", title: "文档归档", status: "completed", summary: "已完成" },
    { id: "running-progress", title: "进度提示", status: "running" },
    { id: "waiting-summary", title: "失败汇总", status: "waiting" }
  ]
};
