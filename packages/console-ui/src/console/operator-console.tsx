import {
  Clock3,
  FolderOpen,
  GitBranch,
  Plus,
} from "lucide-react";

import { AgentMessage } from "@/console/agent-message";
import { ConversationEmptyState } from "@/console/conversation-empty-state";
import { ConversationSidebar, type ConversationSidebarProject, type ConversationSessionStatus } from "@/console/conversation-sidebar";
import { RoleComposer } from "@/console/role-composer";
import { RunBlock } from "@/console/run-block";
import { RunOutcome, type RunOutcomeStatus } from "@/console/run-outcome";
import {
  SessionContextHeader,
  type SessionContextStatus,
} from "@/console/session-context-header";
import { cn } from "@/lib/utils";
import { Badge, type BadgeProps } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";

export type OperatorMessageSpeaker = "user" | "agent" | "system";
export type OperatorMessageStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "interrupted"
  | "stuck"
  | "displayed";
export type OperatorSessionStatus =
  | "idle"
  | "running"
  | "waiting"
  | "completed"
  | "stuck"
  | "failed"
  | "interrupted";
export type OperatorRunnerStatus = "starting" | "running" | "stopped" | "crashed" | "error";

export interface OperatorSession {
  sessionId: string;
  projectId: string;
  parentSessionId?: string | null;
  title: string;
  status: OperatorSessionStatus;
  runningCount: number;
  waitingCount: number;
  stuckCount: number;
  errorCount: number;
  interruptedCount: number;
  childCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorProject {
  projectId: string;
  sourceType: "local-folder";
  title: string;
  folderPath: string;
  worktreeMode: boolean;
  workspaceCwd: string | null;
  workspaceMode: "direct" | "worktree" | null;
  worktreePath: string | null;
  worktreeUnavailableReason: string | null;
  workspaceUpdatedAt: string | null;
  sessions: OperatorSession[];
  runningCount: number;
  waitingCount: number;
  stuckCount: number;
  errorCount: number;
}

export interface OperatorMessage {
  id: number;
  sessionId: string;
  speaker: OperatorMessageSpeaker;
  role: string | null;
  body: string;
  status: OperatorMessageStatus;
  runId: string | null;
  runDir: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorRunSnapshot {
  sessionId: string;
  runId: string;
  role: string | null;
  status: "running";
  startedAt: string;
  elapsedMs: number;
  runDir: string | null;
  cwd: string | null;
  workspaceMode: "direct" | "worktree" | null;
  worktreeUnavailableReason: string | null;
  stdoutTail: string | null;
  stderrTail: string | null;
  lastOutputSummary: string;
  tailDiagnostic: string | null;
  interruptible: boolean;
}

export interface OperatorConsoleProps {
  project: OperatorProject;
  projects?: OperatorProject[];
  selectedProjectId?: string;
  selectedSessionId: string;
  selectedSession: OperatorSession | null;
  messages: OperatorMessage[];
  activeRun: OperatorRunSnapshot | null;
  composerValue: string;
  runnerStatus?: OperatorRunnerStatus;
  sqlitePath?: string;
  lastError?: string | null;
  onComposerChange(value: string): void;
  onSend(): void;
  onCreateSession(): void;
  onOpenProject?: () => void;
  onSelectProject?: (projectId: string) => void;
  onToggleProjectWorktree?: (projectId: string, worktreeMode: boolean) => void;
  onSelectSession(sessionId: string): void;
  onInterrupt(sessionId: string, runId: string): void;
  onOpenDiagnostics?: () => void;
  isSending?: boolean;
  className?: string;
}

export function OperatorConsole({
  project,
  projects,
  selectedProjectId,
  selectedSessionId,
  selectedSession,
  messages,
  activeRun,
  composerValue,
  runnerStatus = "stopped",
  sqlitePath,
  lastError,
  onComposerChange,
  onSend,
  onCreateSession,
  onOpenProject,
  onSelectProject,
  onToggleProjectWorktree,
  onSelectSession,
  onInterrupt,
  onOpenDiagnostics,
  isSending = false,
  className,
}: OperatorConsoleProps): JSX.Element {
  const visibleProjects = projects ?? [project];
  const activeProjectId = selectedProjectId ?? project.projectId;
  const activeProject = visibleProjects.find((item) => item.projectId === activeProjectId) ?? project;
  const sidebarProjects = visibleProjects.map(toSidebarProject);
  const allSessions = visibleProjects.flatMap((item) => item.sessions);
  const parentSession = selectedSession?.parentSessionId
    ? allSessions.find((item) => item.sessionId === selectedSession.parentSessionId) ?? null
    : null;
  const canSend = composerValue.trim() !== "" && activeRun === null && !isSending;
  const emptyConversation = messages.length === 0 && activeRun === null;
  const contextStatus = toContextStatus(selectedSession, activeRun);

  const submitComposer = () => {
    if (canSend) {
      onSend();
    }
  };

  return (
    <div className={cn("flex h-screen min-h-[560px] bg-canvas text-ink", className)}>
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-line bg-rail">
        <div className="border-b border-line px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">项目</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-sub">
                <StatusDot status={runnerStatus === "running" ? "running" : "idle"} />
                <span className="truncate">本地引擎{runnerStatusLabel(runnerStatus)}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {onOpenProject ? (
                <Button type="button" size="icon" variant="ghost" aria-label="打开文件夹" onClick={onOpenProject}>
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
              <Button type="button" size="icon" variant="ghost" aria-label="新建会话" onClick={onCreateSession}>
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        <ConversationSidebar
          projects={sidebarProjects}
          selectedSessionId={selectedSessionId}
          showProjectPath={false}
          onSelectSession={(sessionId, projectId) => {
            onSelectProject?.(projectId);
            onSelectSession(sessionId);
          }}
          className="min-h-0 w-full flex-1 border-0"
        />

        <div className="border-t border-line p-3">
          {onToggleProjectWorktree ? (
            <Button
              type="button"
              variant={activeProject.worktreeMode ? "outline" : "ghost"}
              size="sm"
              className="w-full justify-start"
              aria-label={activeProject.worktreeMode ? "关闭隔离工作区" : "开启隔离工作区"}
              aria-pressed={activeProject.worktreeMode}
              onClick={() => onToggleProjectWorktree(activeProject.projectId, !activeProject.worktreeMode)}
            >
              <GitBranch className="h-4 w-4" aria-hidden="true" />
              隔离工作区
            </Button>
          ) : null}
          <RawInfoDetails
            className="mt-2"
            items={projectRawItems(activeProject, sqlitePath)}
            summary="查看项目原始信息"
          />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-line bg-card p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <SessionContextHeader
              parentTitle={parentSession?.title}
              taskLabel={selectedSession?.title ?? "未选择会话"}
              status={contextStatus}
              progress={sessionProgress(selectedSession, messages, activeRun)}
              onOpenParent={parentSession ? () => onSelectSession(parentSession.sessionId) : undefined}
            />
            <div className="flex items-start gap-2">
              <Badge variant={statusVariant(contextStatus)}>{contextStatusLabel(contextStatus)}</Badge>
              {onOpenDiagnostics ? (
                <Button type="button" variant="outline" size="sm" onClick={onOpenDiagnostics}>
                  诊断
                </Button>
              ) : null}
            </div>
          </div>
          <RawInfoDetails
            className="mt-2"
            items={sessionRawItems(activeProject, selectedSession, activeRun)}
            summary="查看当前会话原始信息"
          />
        </div>

        <section className="scroll-thin min-h-0 flex-1 overflow-auto px-4 py-3" aria-label="会话时间线">
          {activeRun ? (
            <RunBlock
              role={activeRun.role ?? "dev"}
              elapsedTime={formatElapsed(activeRun.elapsedMs)}
              summary={safeRunSummary(activeRun.lastOutputSummary)}
              rawOutput={runRawOutput(activeRun)}
              onInterrupt={() => onInterrupt(activeRun.sessionId, activeRun.runId)}
              className="mb-3"
            />
          ) : null}

          {emptyConversation ? (
            <div className="grid h-full place-items-center">
              <ConversationEmptyState value={composerValue} onValueChange={onComposerChange} onSubmit={submitComposer} />
            </div>
          ) : (
            <div className="space-y-2.5">
              {messages.map((message) => (
                <TimelineEntry key={message.id} message={message} />
              ))}
            </div>
          )}
        </section>

        {lastError ? (
          <div className="border-t border-line bg-card px-4 py-2 text-xs text-danger">
            遇到问题，详情可展开。
            <RawInfoDetails className="mt-1 text-sub" items={[["错误原文", lastError]]} summary="查看错误详情" />
          </div>
        ) : null}

        {!emptyConversation ? (
          <footer className="border-t border-line bg-card p-3">
            <RoleComposer
              value={composerValue}
              onValueChange={onComposerChange}
              onSubmit={submitComposer}
              disabled={activeRun !== null || isSending}
              placeholder="描述你的目标，@ 一个角色开始…"
              statusText={activeRun ? "当前正在执行，稍后可继续发送" : undefined}
            />
          </footer>
        ) : null}
      </main>
    </div>
  );
}

function TimelineEntry({ message }: { message: OperatorMessage }): JSX.Element {
  const outcome = terminalOutcome(message);
  if (outcome) {
    return (
      <RunOutcome
        status={outcome}
        role={message.role}
        rawReason={message.error ?? message.body}
        rawOutput={message.error ? message.body : null}
      />
    );
  }

  if (message.speaker === "agent") {
    return (
      <Card className="max-w-[760px] p-3">
        <AgentMessage
          role={message.role ?? "agent"}
          rawMarkdown={message.body}
          timestamp={formatTime(message.updatedAt)}
        />
        <MessageRawDetails message={message} />
      </Card>
    );
  }

  return (
    <Card className="max-w-[760px] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-sub">
        <span className="font-semibold text-ink">{message.speaker === "user" ? "你" : "系统提示"}</span>
        <Badge variant={statusVariant(message.status)}>{statusLabel(message.status)}</Badge>
        <span className="inline-flex items-center gap-1 tnum">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {formatTime(message.updatedAt)}
        </span>
      </div>
      <div className="whitespace-pre-wrap break-words text-sm leading-5 text-ink">
        {message.speaker === "system" ? systemSummary(message) : message.body}
      </div>
      <MessageRawDetails message={message} />
    </Card>
  );
}

function MessageRawDetails({ message }: { message: OperatorMessage }): JSX.Element | null {
  const items: Array<[string, string | null | undefined]> = [
    ["消息原文", message.body],
    ["错误原文", message.error],
    ["运行目录", message.runDir],
    ["运行编号", message.runId],
  ];
  return <RawInfoDetails className="mt-2" items={items} summary="查看原始信息" />;
}

function RawInfoDetails({
  items,
  summary,
  className,
}: {
  items: Array<[string, string | null | undefined]>;
  summary: string;
  className?: string;
}): JSX.Element | null {
  const visibleItems = items.filter(([, value]) => nonBlank(value));
  if (visibleItems.length === 0) {
    return null;
  }
  return (
    <details className={cn("text-xs text-sub", className)}>
      <summary className="cursor-pointer list-none rounded-sm text-hint outline-none hover:text-sub focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className="mt-2 space-y-2">
        {visibleItems.map(([label, value]) => (
          <div key={label}>
            <div className="mb-1 text-hint">{label}</div>
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-sunken p-3 font-mono leading-5 text-ink">
              {value}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}

function toSidebarProject(project: OperatorProject): ConversationSidebarProject {
  return {
    id: project.projectId,
    path: project.folderPath,
    label: project.title,
    sessions: project.sessions.map((session) => ({
      id: session.sessionId,
      title: session.title,
      status: toSidebarStatus(session),
      summary: sessionSummary(session),
    })),
  };
}

function toSidebarStatus(session: OperatorSession): ConversationSessionStatus {
  if (session.status === "completed") {
    return "completed";
  }
  if (session.status === "waiting" || session.waitingCount > 0) {
    return "waiting";
  }
  if (session.status === "running" || session.runningCount > 0) {
    return "running";
  }
  return "idle";
}

function toContextStatus(session: OperatorSession | null, activeRun: OperatorRunSnapshot | null): SessionContextStatus {
  if (activeRun) {
    return "running";
  }
  if (!session) {
    return "idle";
  }
  if (session.status === "completed") {
    return "completed";
  }
  if (session.status === "waiting" || session.waitingCount > 0) {
    return "waiting";
  }
  if (session.status === "running" || session.runningCount > 0) {
    return "running";
  }
  return "idle";
}

function sessionProgress(
  session: OperatorSession | null,
  messages: OperatorMessage[],
  activeRun: OperatorRunSnapshot | null,
): { passed: number; running: number; waiting: number } {
  return {
    passed: messages.filter((message) => message.status === "completed" || message.status === "displayed").length,
    running: activeRun ? 1 : session?.runningCount ?? 0,
    waiting: session?.waitingCount ?? 0,
  };
}

function sessionSummary(session: OperatorSession): string | undefined {
  if (session.errorCount > 0) {
    return `错误 ${session.errorCount}`;
  }
  if (session.stuckCount > 0) {
    return `卡住 ${session.stuckCount}`;
  }
  if ((session.childCount ?? 0) > 0) {
    return `子会话 ${session.childCount ?? 0}`;
  }
  if (session.interruptedCount > 0) {
    return `中断 ${session.interruptedCount}`;
  }
  return undefined;
}

function terminalOutcome(message: OperatorMessage): RunOutcomeStatus | null {
  const rawText = `${message.status}\n${message.body}\n${message.error ?? ""}`.toLowerCase();
  if (rawText.includes("dead-letter")) {
    return "dead-letter";
  }
  if (message.status === "failed") {
    return "failed";
  }
  if (message.status === "stuck") {
    return "stuck";
  }
  if (message.status === "interrupted") {
    return "interrupted";
  }
  return null;
}

function systemSummary(message: OperatorMessage): string {
  switch (message.status) {
    case "pending":
      return "系统消息排队中";
    case "running":
      return "系统任务执行中";
    case "completed":
    case "displayed":
      return "系统消息已记录";
    case "failed":
      return "运行失败，详情可展开";
    case "interrupted":
      return "运行已中断，详情可展开";
    case "stuck":
      return "运行长时间无响应，详情可展开";
  }
}

function safeRunSummary(summary: string | null | undefined): string {
  const text = nonBlank(summary);
  if (!text || forbiddenMachineTextPattern.test(text)) {
    return "正在运行，等待进展";
  }
  return text;
}

function runRawOutput(activeRun: OperatorRunSnapshot): string {
  return [
    ["输出摘要", activeRun.lastOutputSummary],
    ["标准输出", activeRun.stdoutTail],
    ["错误输出", activeRun.stderrTail],
    ["尾部诊断", activeRun.tailDiagnostic],
    ["运行目录", activeRun.runDir],
    ["工作目录", activeRun.cwd],
    ["工作区模式", activeRun.workspaceMode],
    ["隔离不可用原因", activeRun.worktreeUnavailableReason],
  ]
    .filter(([, value]) => nonBlank(value))
    .map(([label, value]) => `${label}：${value}`)
    .join("\n");
}

function projectRawItems(project: OperatorProject, sqlitePath: string | undefined): Array<[string, string | null | undefined]> {
  return [
    ["项目路径", project.folderPath],
    ["工作目录", project.workspaceCwd],
    ["工作区模式", project.workspaceMode],
    ["隔离路径", project.worktreePath],
    ["隔离不可用原因", project.worktreeUnavailableReason],
    ["状态库", sqlitePath],
    ["更新时间", project.workspaceUpdatedAt],
  ];
}

function sessionRawItems(
  project: OperatorProject,
  session: OperatorSession | null,
  activeRun: OperatorRunSnapshot | null,
): Array<[string, string | null | undefined]> {
  return [
    ["项目原始路径", project.folderPath],
    ["会话编号", session?.sessionId],
    ["父会话编号", session?.parentSessionId],
    ["运行编号", activeRun?.runId],
    ["运行目录", activeRun?.runDir],
    ["工作目录", activeRun?.cwd],
    ["工作区模式", activeRun?.workspaceMode],
  ];
}

function StatusDot({ status }: { status: OperatorSessionStatus | "idle" }): JSX.Element {
  return <span className={cn("h-2 w-2 rounded-full", dotClass(status))} aria-hidden="true" />;
}

function statusVariant(status: OperatorSessionStatus | OperatorMessageStatus | SessionContextStatus): BadgeProps["variant"] {
  if (status === "completed" || status === "displayed") {
    return "completed";
  }
  if (status === "failed" || status === "stuck") {
    return status;
  }
  if (status === "interrupted") {
    return "interrupted";
  }
  if (status === "waiting" || status === "pending") {
    return "waiting";
  }
  if (status === "running") {
    return "running";
  }
  return "idle";
}

function dotClass(status: OperatorSessionStatus | "idle"): string {
  if (status === "running") {
    return "bg-accent";
  }
  if (status === "failed" || status === "stuck") {
    return "bg-danger";
  }
  if (status === "waiting") {
    return "bg-ink";
  }
  return "bg-hint";
}

function statusLabel(status: OperatorSessionStatus | OperatorMessageStatus): string {
  switch (status) {
    case "pending":
      return "排队中";
    case "running":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "错误";
    case "interrupted":
      return "已中断";
    case "stuck":
      return "卡住";
    case "displayed":
      return "已显示";
    case "waiting":
      return "等待真人";
    case "idle":
      return "空闲";
  }
}

function contextStatusLabel(status: SessionContextStatus): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "idle":
      return "静止";
    case "running":
      return "执行中";
    case "waiting":
      return "等你";
  }
}

function runnerStatusLabel(status: OperatorRunnerStatus): string {
  switch (status) {
    case "starting":
      return "启动中";
    case "running":
      return "运行中";
    case "stopped":
      return "已停止";
    case "crashed":
      return "已崩溃";
    case "error":
      return "异常";
  }
}

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const forbiddenMachineTextPattern = /worktree|direct|cwd|runDir|dead-letter|handoff/iu;
