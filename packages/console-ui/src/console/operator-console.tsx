import {
  AlertCircle,
  Clock3,
  Folder,
  FolderOpen,
  GitBranch,
  Loader2,
  MessageSquareText,
  Plus,
  Send,
  Square,
  TerminalSquare,
} from "lucide-react";

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
export type OperatorSessionStatus = "idle" | "running" | "waiting" | "stuck" | "failed" | "interrupted";
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
  const canSend = composerValue.trim() !== "" && activeRun === null && !isSending;
  const visibleProjects = projects ?? [project];
  const activeProjectId = selectedProjectId ?? project.projectId;
  return (
    <div className={cn("flex h-screen min-h-[560px] bg-canvas text-ink", className)}>
      <aside className="flex w-[268px] shrink-0 flex-col border-r border-line bg-rail">
        <div className="border-b border-line px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Folder className="h-4 w-4 text-sub" aria-hidden="true" />
                <span className="truncate">Projects</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-sub">
                <StatusDot status={runnerStatus === "running" ? "running" : "idle"} />
                <span className="truncate">runner {runnerStatusLabel(runnerStatus)}</span>
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

        <nav className="scroll-thin min-h-0 flex-1 overflow-auto p-2" aria-label="项目和会话">
          {visibleProjects.map((item) => (
            <div key={item.projectId} className="mb-2">
              <div
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md px-2 py-2",
                  item.projectId === activeProjectId ? "bg-sel" : "bg-transparent",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => onSelectProject?.(item.projectId)}
                >
                  <span className="block truncate text-sm font-semibold">{item.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-sub">{item.folderPath}</span>
                  <span className="mt-1 block truncate text-xs text-sub">
                    {item.worktreeMode ? "worktree" : "direct"}
                    {item.worktreeUnavailableReason ? ` · ${item.worktreeUnavailableReason}` : ""}
                  </span>
                </button>
                {onToggleProjectWorktree ? (
                  <Button
                    type="button"
                    size="icon"
                    variant={item.worktreeMode ? "outline" : "ghost"}
                    aria-label={item.worktreeMode ? "关闭 worktree" : "开启 worktree"}
                    aria-pressed={item.worktreeMode}
                    onClick={() => onToggleProjectWorktree(item.projectId, !item.worktreeMode)}
                  >
                    <GitBranch className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              <div className="mt-1 space-y-1 pl-2">
                {treeSessions(item.sessions).map(({ session, depth }) => (
                  <button
                    key={session.sessionId}
                    type="button"
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-hover",
                      session.sessionId === selectedSessionId ? "bg-sel" : "bg-transparent",
                      depth > 0 ? "ml-4 w-[calc(100%-1rem)] border-l border-line" : "",
                    )}
                    onClick={() => {
                      onSelectProject?.(item.projectId);
                      onSelectSession(session.sessionId);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {depth > 0 ? "子会话 · " : ""}
                        {session.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-sub">
                        {statusLabel(session.status)}
                        {session.errorCount > 0 ? ` · 错误 ${session.errorCount}` : ""}
                        {session.stuckCount > 0 ? ` · 卡住 ${session.stuckCount}` : ""}
                        {(session.childCount ?? 0) > 0 ? ` · 子会话 ${session.childCount ?? 0}` : ""}
                      </span>
                    </span>
                    <StatusDot status={session.status} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[58px] items-center justify-between gap-3 border-b border-line bg-card px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{selectedSession?.title ?? "未选择会话"}</div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sub">
              <span className="inline-flex items-center gap-1">
                <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                {messages.length} 条消息
              </span>
              {activeRun ? (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <TerminalSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="truncate">{activeRun.cwd ?? activeRun.runDir ?? "cwd 未记录"}</span>
                </span>
              ) : sqlitePath ? (
                <span className="truncate">{sqlitePath}</span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={statusVariant(activeRun ? "running" : (selectedSession?.status ?? "idle"))}>
              {statusLabel(activeRun ? "running" : (selectedSession?.status ?? "idle"))}
            </Badge>
            {onOpenDiagnostics ? (
              <Button type="button" variant="outline" size="sm" onClick={onOpenDiagnostics}>
                诊断
              </Button>
            ) : null}
          </div>
        </header>

        <section className="scroll-thin min-h-0 flex-1 overflow-auto px-4 py-3">
          {activeRun ? <RunLiveBlock activeRun={activeRun} onInterrupt={onInterrupt} /> : null}
          {messages.length === 0 && activeRun === null ? (
            <div className="grid h-full place-items-center text-sm text-sub">暂无消息</div>
          ) : (
            <div className="space-y-2.5">
              {messages.map((message) => (
                <TimelineMessage key={message.id} message={message} />
              ))}
            </div>
          )}
        </section>

        {lastError ? (
          <div className="border-t border-line bg-card px-4 py-2 text-xs text-danger">{lastError}</div>
        ) : null}

        <footer className="border-t border-line bg-card p-3">
          <form
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSend) {
                onSend();
              }
            }}
          >
            <textarea
              className="min-h-10 max-h-28 resize-y rounded-sm border-line border bg-input px-3 py-2 text-sm text-ink placeholder:text-hint disabled:cursor-not-allowed disabled:opacity-50"
              value={composerValue}
              placeholder="输入本地对话消息，例如 @dev ..."
              disabled={activeRun !== null || isSending}
              onChange={(event) => onComposerChange(event.target.value)}
              aria-label="消息内容"
            />
            <Button type="submit" disabled={!canSend} aria-label="发送消息">
              <Send className="h-4 w-4" aria-hidden="true" />
              发送
            </Button>
          </form>
        </footer>
      </main>
    </div>
  );
}

function treeSessions(sessions: OperatorSession[]): Array<{ session: OperatorSession; depth: number }> {
  const byParent = new Map<string | null, OperatorSession[]>();
  for (const session of sessions) {
    const parent = session.parentSessionId ?? null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), session]);
  }
  const result: Array<{ session: OperatorSession; depth: number }> = [];
  const visited = new Set<string>();
  const append = (parent: string | null, depth: number) => {
    for (const session of byParent.get(parent) ?? []) {
      if (visited.has(session.sessionId)) {
        continue;
      }
      visited.add(session.sessionId);
      result.push({ session, depth });
      append(session.sessionId, depth + 1);
    }
  };
  append(null, 0);
  for (const session of sessions) {
    if (!visited.has(session.sessionId)) {
      result.push({ session, depth: 0 });
    }
  }
  return result;
}

function RunLiveBlock({
  activeRun,
  onInterrupt,
}: {
  activeRun: OperatorRunSnapshot;
  onInterrupt(sessionId: string, runId: string): void;
}): JSX.Element {
  return (
    <Card className="mb-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
            <span>运行直播</span>
            <Badge variant="running">进行中</Badge>
            <span className="text-xs font-normal text-sub tnum">{formatElapsed(activeRun.elapsedMs)}</span>
          </div>
          <div className="mt-1 truncate text-xs text-sub">{activeRun.runDir ?? "runDir 未记录"}</div>
          <div className="mt-1 truncate text-xs text-sub">
            {activeRun.cwd ?? "cwd 未记录"}
            {activeRun.workspaceMode ? ` · ${workspaceModeLabel(activeRun.workspaceMode)}` : ""}
            {activeRun.worktreeUnavailableReason ? ` · ${activeRun.worktreeUnavailableReason}` : ""}
          </div>
        </div>
        <Button
          type="button"
          variant={"danger"}
          size="sm"
          disabled={!activeRun.interruptible}
          onClick={() => onInterrupt(activeRun.sessionId, activeRun.runId)}
        >
          <Square className="h-3.5 w-3.5" aria-hidden="true" />
          中断
        </Button>
      </div>
      <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md bg-sunken p-2 font-mono text-xs leading-5 text-ink">
        {activeRun.lastOutputSummary}
      </pre>
      {activeRun.tailDiagnostic ? (
        <div className="mt-2 flex items-center gap-1 text-xs text-sub">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {activeRun.tailDiagnostic}
        </div>
      ) : null}
    </Card>
  );
}

function TimelineMessage({ message }: { message: OperatorMessage }): JSX.Element {
  const tone = message.status === "failed" || message.status === "stuck"
    ? "border-danger bg-card"
    : message.status === "interrupted"
      ? "border-line-strong bg-card"
      : message.speaker === "user"
        ? "border-line bg-card"
        : "border-line bg-rail";
  return (
    <Card className={cn("p-3", tone)}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-sub">
        <span className="font-semibold text-ink">{message.role ?? speakerLabel(message.speaker)}</span>
        <Badge variant={statusVariant(message.status)}>{statusLabel(message.status)}</Badge>
        {message.runDir ? <span className="truncate">{message.runDir}</span> : null}
        <span className="inline-flex items-center gap-1 tnum">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {formatTime(message.updatedAt)}
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-5 text-ink">{message.body}</pre>
      {message.error ? <div className="mt-2 text-xs text-danger">{message.error}</div> : null}
    </Card>
  );
}

function StatusDot({ status }: { status: OperatorSessionStatus | "idle" }): JSX.Element {
  return <span className={cn("h-2 w-2 rounded-full", dotClass(status))} aria-hidden="true" />;
}

function statusVariant(status: OperatorSessionStatus | OperatorMessageStatus): BadgeProps["variant"] {
  return status;
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
      return "错误";
  }
}

function workspaceModeLabel(mode: "direct" | "worktree"): string {
  return mode === "worktree" ? "worktree" : "direct";
}

function speakerLabel(speaker: OperatorMessageSpeaker): string {
  switch (speaker) {
    case "user":
      return "user";
    case "agent":
      return "agent";
    case "system":
      return "system";
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
