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
  it("renders composite project/session navigation and live run controls", () => {
    const onInterrupt = vi.fn();
    renderConsole({ activeRun: runSnapshot, onInterrupt });

    expect(screen.getByText("agent-moebius")).toBeInTheDocument();
    expect(screen.getAllByText("默认会话").length).toBeGreaterThan(0);
    expect(screen.getByText("验收会话")).toBeInTheDocument();
    expect(screen.getByText("开发")).toBeInTheDocument();
    expect(screen.getByText("00:12")).toBeInTheDocument();
    expect(screen.getByText("live tail from codex")).toBeVisible();
    expect(screen.getByText("/tmp/agent-moebius-run")).not.toBeVisible();
    for (const rawPath of screen.getAllByText("/tmp/agent-moebius-local-worktree")) {
      expect(rawPath).not.toBeVisible();
    }

    fireEvent.click(screen.getByRole("button", { name: /中断开发运行/u }));
    expect(onInterrupt).toHaveBeenCalledWith("session-a", "run-1");
  });

  it("keeps interrupted, failed, stuck, and waiting states visually distinct", () => {
    renderConsole({
      selectedSession: { ...sessions[1], status: "waiting", waitingCount: 1 },
      messages: [
        message({ id: 1, status: "interrupted", body: "@dev interrupted", error: "interrupted:user-interrupted" }),
        message({ id: 2, speaker: "system", status: "failed", body: "Codex failed: exit:42", error: "exit:42" }),
        message({ id: 3, speaker: "system", status: "stuck", body: "Codex stuck: idle-timeout:10ms", error: "idle-timeout:10ms" }),
        message({ id: 4, speaker: "agent", status: "displayed", body: "## 下一步\n等待真人：请确认" }),
        message({ id: 5, speaker: "agent", status: "pending", body: "queued" }),
        message({ id: 6, speaker: "agent", status: "completed", body: "done" }),
      ],
    });

    expect(screen.getByText("运行已中断")).toBeVisible();
    expect(screen.getByText("运行失败")).toBeVisible();
    expect(screen.getByText("运行长时间无响应")).toBeVisible();
    expect(screen.getAllByText(/等你/u).length).toBeGreaterThan(0);
    expect(screen.getByText("interrupted:user-interrupted")).not.toBeVisible();
    expect(screen.getByText("idle-timeout:10ms")).not.toBeVisible();

    fireEvent.click(screen.getAllByText("查看详情")[0]!);
    expect(screen.getByText("interrupted:user-interrupted")).toBeVisible();
  });

  it("shows child sessions and parent context without a sidebar tree", () => {
    const childSession = { ...sessions[1], parentSessionId: sessions[0].sessionId, title: "实现子任务" };
    renderConsole({
      selectedSessionId: childSession.sessionId,
      selectedSession: childSession,
      project: {
        ...project,
        sessions: [
          { ...sessions[0], childCount: 1 },
          childSession,
        ],
      },
    });

    expect(screen.getAllByText("实现子任务").length).toBeGreaterThan(0);
    expect(screen.getByText("属于：默认会话")).toBeInTheDocument();
    expect(screen.getByText(/子会话 1/u)).toBeInTheDocument();
  });

  it("keeps machine terms out of the default visible surface while preserving details", () => {
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

    for (const text of screen.getAllByText(/worktree|direct|cwd|runDir|dead-letter|handoff/iu)) {
      expect(text).not.toBeVisible();
    }
    expect(screen.queryByText(/^user$/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/^agent$/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/^system$/iu)).not.toBeInTheDocument();

    expect(screen.getByText("正在运行，等待进展")).toBeVisible();
    expect(screen.getByText("多次尝试仍失败，已停止自动重试")).toBeVisible();
    fireEvent.click(screen.getAllByText("查看详情")[0]!);
    expect(screen.getByText(/dead-letter body handoff runDir/iu)).toBeVisible();
  });

  it("keeps corrupt parent chains visible without duplicating sessions", () => {
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
});

function renderConsole(overrides: Partial<OperatorConsoleProps> = {}) {
  const props: OperatorConsoleProps = {
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
  return render(<OperatorConsole {...props} />);
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
