import { fireEvent, render, screen } from "@testing-library/react";
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
    const onCreateSession = vi.fn();
    const onSelectSession = vi.fn();
    const onSend = vi.fn();
    renderConsole({
      messages: [],
      onCreateSession,
      onSelectSession,
      onChangeSessionProject: vi.fn(),
      onSend,
      isSelectionMutationPending: true,
      isSessionProjectUpdating: true,
    });

    expect(screen.getByRole("button", { name: "在 agent-moebius 中新建会话" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "默认会话，运行中" })).toBeDisabled();
    expect(screen.getByLabelText("项目：agent-moebius，点击切换")).toBeDisabled();
    const composer = screen.getByRole("textbox");
    expect(composer).toBeDisabled();
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(onCreateSession).not.toHaveBeenCalled();
    expect(onSelectSession).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });
});

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
    onCreateSession: vi.fn(),
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
