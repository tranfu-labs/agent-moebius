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
  it("renders project/session navigation and live run controls", () => {
    const onInterrupt = vi.fn();
    renderConsole({ activeRun: runSnapshot, onInterrupt });

    expect(screen.getByText("agent-moebius")).toBeInTheDocument();
    expect(screen.getAllByText("默认会话").length).toBeGreaterThan(0);
    expect(screen.getByText("验收会话")).toBeInTheDocument();
    expect(screen.getByText("运行直播")).toBeInTheDocument();
    expect(screen.getByText("live tail from codex")).toBeInTheDocument();
    expect(screen.getAllByText(/\/tmp\/agent-moebius-run/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /中断/u }));
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
      ],
    });

    expect(screen.getAllByText("已中断").length).toBeGreaterThan(0);
    expect(screen.getAllByText("错误").length).toBeGreaterThan(0);
    expect(screen.getAllByText("卡住").length).toBeGreaterThan(0);
    expect(screen.getAllByText("等待真人").length).toBeGreaterThan(0);
    expect(screen.getByText("interrupted:user-interrupted")).toBeInTheDocument();
    expect(screen.getByText("idle-timeout:10ms")).toBeInTheDocument();
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
