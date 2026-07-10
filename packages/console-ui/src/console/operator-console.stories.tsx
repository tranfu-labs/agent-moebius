import type { Meta, StoryObj } from "@storybook/react";

import { OperatorConsole, type OperatorConsoleProps } from "@/console/operator-console";

const sample: OperatorConsoleProps = {
  project: {
    projectId: "local",
    sourceType: "local-folder",
    title: "agent-moebius",
    folderPath: "/Users/example/agent-moebius",
    worktreeMode: true,
    workspaceCwd: "/tmp/agent-moebius-local-worktree",
    workspaceMode: "worktree",
    worktreePath: "/tmp/agent-moebius-local-worktree",
    worktreeUnavailableReason: null,
    workspaceUpdatedAt: "2026-07-09T00:03:00.000Z",
    sessions: [
      {
        sessionId: "default",
        projectId: "local",
        title: "默认会话",
        status: "running",
        runningCount: 1,
        waitingCount: 0,
        stuckCount: 0,
        errorCount: 0,
        interruptedCount: 0,
        createdAt: "2026-07-09T00:00:00.000Z",
        updatedAt: "2026-07-09T00:03:00.000Z",
      },
      {
        sessionId: "failure",
        projectId: "local",
        title: "失败构造",
        status: "failed",
        runningCount: 0,
        waitingCount: 0,
        stuckCount: 0,
        errorCount: 1,
        interruptedCount: 0,
        createdAt: "2026-07-09T00:00:00.000Z",
        updatedAt: "2026-07-09T00:03:00.000Z",
      },
      {
        sessionId: "human",
        projectId: "local",
        title: "等待验收",
        status: "waiting",
        runningCount: 0,
        waitingCount: 1,
        stuckCount: 0,
        errorCount: 0,
        interruptedCount: 0,
        createdAt: "2026-07-09T00:00:00.000Z",
        updatedAt: "2026-07-09T00:03:00.000Z",
      },
    ],
    runningCount: 1,
    waitingCount: 1,
    stuckCount: 0,
    errorCount: 1,
  },
  selectedSessionId: "default",
  selectedSession: {
    sessionId: "default",
    projectId: "local",
    title: "默认会话",
    status: "running",
    runningCount: 1,
    waitingCount: 0,
    stuckCount: 0,
    errorCount: 0,
    interruptedCount: 0,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:03:00.000Z",
  },
  messages: [
    {
      id: 1,
      sessionId: "default",
      speaker: "user",
      role: null,
      body: "@dev 开始一次本地对话",
      status: "running",
      runId: "run-1",
      runDir: "/tmp/agent-moebius-local-run",
      error: null,
      createdAt: "2026-07-09T00:00:00.000Z",
      updatedAt: "2026-07-09T00:00:02.000Z",
    },
  ],
  activeRun: {
    sessionId: "default",
    runId: "run-1",
    role: "dev",
    status: "running",
    startedAt: "2026-07-09T00:00:00.000Z",
    elapsedMs: 34_000,
    runDir: "/tmp/agent-moebius-local-run",
    cwd: "/tmp/agent-moebius-local-worktree",
    workspaceMode: "worktree",
    worktreeUnavailableReason: null,
    stdoutTail: "{\"message\":\"正在生成 code-verified 证据\"}",
    stderrTail: null,
    lastOutputSummary: "正在生成 code-verified 证据",
    tailDiagnostic: null,
    interruptible: true,
  },
  composerValue: "@dev 继续",
  runnerStatus: "running",
  sqlitePath: ".state/local-console.sqlite",
  lastError: null,
  onComposerChange: () => undefined,
  onSend: () => undefined,
  onCreateSession: () => undefined,
  onSelectSession: () => undefined,
  onInterrupt: () => undefined,
};

const meta = {
  title: "Console/OperatorConsole",
  component: OperatorConsole,
  args: sample,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof OperatorConsole>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};

export const ErrorStates: Story = {
  args: {
    activeRun: null,
    selectedSession: { ...sample.selectedSession!, status: "stuck", stuckCount: 1, runningCount: 0 },
    messages: [
      { ...sample.messages[0], status: "interrupted", body: "@dev 中断我", error: "interrupted:user-interrupted" },
      {
        ...sample.messages[0],
        id: 2,
        speaker: "system",
        status: "failed",
        body: "Codex failed: exit:42",
        error: "exit:42",
      },
      {
        ...sample.messages[0],
        id: 3,
        speaker: "system",
        status: "stuck",
        body: "Codex stuck: idle-timeout:10ms",
        error: "idle-timeout:10ms",
      },
    ],
  },
};
