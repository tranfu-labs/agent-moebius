import type { Meta, StoryObj } from "@storybook/react";

import { OperatorConsole, type OperatorConsoleProps } from "@/console/operator-console";

const agentMarkdown = [
  "## 结论",
  "已把复合组件接入真实操作台。",
  "",
  "## 依据",
  "- packages/console-ui/src/console/operator-console.tsx",
  "",
  "## 下一步",
  "交棒：@qa 请按验收场景走查",
  "",
  "<!-- agent-moebius:stage=code-verified -->",
].join("\n");

const sessions: OperatorConsoleProps["project"]["sessions"] = [
  {
    sessionId: "waiting",
    projectId: "local",
    title: "等待验收",
    status: "waiting",
    runningCount: 0,
    waitingCount: 1,
    stuckCount: 0,
    errorCount: 0,
    interruptedCount: 0,
    createdAt: "2026-07-11T10:00:00.000Z",
    updatedAt: "2026-07-11T10:04:00.000Z",
  },
  {
    sessionId: "running",
    projectId: "local",
    title: "集成收尾",
    status: "running",
    runningCount: 1,
    waitingCount: 0,
    stuckCount: 0,
    errorCount: 0,
    interruptedCount: 0,
    childCount: 1,
    createdAt: "2026-07-11T10:00:00.000Z",
    updatedAt: "2026-07-11T10:04:00.000Z",
  },
  {
    sessionId: "idle",
    projectId: "local",
    parentSessionId: "running",
    title: "截图走查",
    status: "idle",
    runningCount: 0,
    waitingCount: 0,
    stuckCount: 0,
    errorCount: 0,
    interruptedCount: 0,
    createdAt: "2026-07-11T10:00:00.000Z",
    updatedAt: "2026-07-11T10:04:00.000Z",
  },
];

const sample: OperatorConsoleProps = {
  project: {
    projectId: "local",
    sourceType: "local-folder",
    title: "agent-moebius",
    folderPath: "/Users/example/agent-moebius",
    worktreeMode: true,
    workspaceCwd: "/tmp/t65-cwd-sentinel",
    workspaceMode: "worktree",
    worktreePath: "/tmp/t65-worktree-sentinel",
    worktreeUnavailableReason: null,
    workspaceUpdatedAt: "2026-07-11T10:04:00.000Z",
    sessions,
    runningCount: 1,
    waitingCount: 1,
    stuckCount: 0,
    errorCount: 0,
  },
  selectedProjectId: "local",
  selectedSessionId: "running",
  selectedSession: sessions[1]!,
  messages: [
    {
      id: 1,
      sessionId: "running",
      speaker: "user",
      role: null,
      body: "请完成 T6.5 集成收尾。",
      status: "displayed",
      runId: null,
      runDir: null,
      error: null,
      createdAt: "2026-07-11T10:00:00.000Z",
      updatedAt: "2026-07-11T10:00:00.000Z",
    },
    {
      id: 2,
      sessionId: "running",
      speaker: "agent",
      role: "dev",
      body: agentMarkdown,
      status: "displayed",
      runId: "run-t65",
      runDir: "/tmp/t65-runDir-sentinel",
      error: null,
      createdAt: "2026-07-11T10:01:00.000Z",
      updatedAt: "2026-07-11T10:02:00.000Z",
    },
  ],
  activeRun: {
    sessionId: "running",
    runId: "run-t65",
    role: "dev",
    status: "running",
    startedAt: "2026-07-11T10:01:00.000Z",
    elapsedMs: 94_000,
    runDir: "/tmp/t65-runDir-sentinel",
    cwd: "/tmp/t65-cwd-sentinel",
    workspaceMode: "worktree",
    worktreeUnavailableReason: null,
    stdoutTail: "stdout tail with raw detail",
    stderrTail: null,
    lastOutputSummary: "正在整合复合组件",
    tailDiagnostic: null,
    interruptible: true,
  },
  composerValue: "@",
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

export const T65Running: Story = {};

export const T65Outcomes: Story = {
  args: {
    activeRun: null,
    selectedSession: { ...sessions[1]!, status: "idle", runningCount: 0 },
    messages: [
      {
        ...sample.messages[0],
        id: 10,
        speaker: "system",
        status: "failed",
        body: "Codex failed: exit:42",
        error: "exit:42",
      },
      {
        ...sample.messages[0],
        id: 11,
        speaker: "system",
        status: "stuck",
        body: "Codex stuck: idle-timeout:10ms",
        error: "idle-timeout:10ms",
      },
      {
        ...sample.messages[0],
        id: 12,
        speaker: "system",
        status: "interrupted",
        body: "Interrupted by user",
        error: "interrupted:user-interrupted",
      },
      {
        ...sample.messages[0],
        id: 13,
        speaker: "system",
        status: "failed",
        body: "dead-letter body handoff raw",
        error: "dead-letter: repeated exit",
      },
    ],
  },
};

export const T65EmptyComposer: Story = {
  args: {
    activeRun: null,
    messages: [],
    selectedSession: { ...sessions[2]!, status: "idle" },
    selectedSessionId: "idle",
    composerValue: "@",
  },
};
