import {
  ChevronDown,
  Diamond,
  FolderOpen,
  GitBranch,
  Laptop,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { AgentMessage } from "@/console/agent-message";
import { ConversationEmptyState } from "@/console/conversation-empty-state";
import {
  ConversationSidebar,
  type ConversationSidebarProject,
} from "@/console/conversation-sidebar";
import { RoleComposer } from "@/console/role-composer";
import { RunBlock } from "@/console/run-block";
import { RunOutcome, type RunOutcomeStatus } from "@/console/run-outcome";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

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
  | "stuck"
  | "failed"
  | "interrupted";
export type OperatorRunnerStatus = "starting" | "running" | "stopped" | "crashed" | "error";
export type OperatorApplicationView = "conversation" | "agent-teams";
export interface NewConversationOptions {
  projectId?: string;
}
export type OperatorApplicationOverlay =
  | { kind: "new-conversation"; options: NewConversationOptions }
  | { kind: "search" };

export interface OperatorSession {
  sessionId: string;
  projectId: string;
  parentSessionId?: string | null;
  title: string;
  status: OperatorSessionStatus;
  awaitsHumanReason: "answer" | "confirmation" | "acceptance" | "exception" | null;
  unreadSince: string | null;
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
  newConversationDisabledReason?: string | null;
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
  onOpenProject?: () => void;
  onToggleProjectWorktree?: (projectId: string, worktreeMode: boolean) => void;
  onSelectSession(selection: { sessionId: string; projectId: string }): void;
  onChangeSessionProject?: (sessionId: string, projectId: string) => void;
  onShowProjectInFolder?: (folderPath: string) => void | Promise<void>;
  onRenameProject?: (projectId: string, title: string) => void | Promise<void>;
  onRemoveProject?: (projectId: string, force: boolean) => void | Promise<void>;
  onInterrupt(sessionId: string, runId: string): void;
  onOpenDiagnostics?: () => void;
  isSending?: boolean;
  isSelectionMutationPending?: boolean;
  isSessionProjectUpdating?: boolean;
  isProjectMutationPending?: boolean;
  isNewConversationWithoutProject?: boolean;
  sidebarOpen?: boolean;
  isFirstRunOnboarding?: boolean;
  onSidebarOpenChange?: (open: boolean) => void;
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
  lastError,
  onComposerChange,
  onSend,
  onOpenProject,
  onToggleProjectWorktree,
  onSelectSession,
  onChangeSessionProject,
  onShowProjectInFolder,
  onRenameProject,
  onRemoveProject,
  onInterrupt,
  onOpenDiagnostics,
  isSending = false,
  isSelectionMutationPending = false,
  isSessionProjectUpdating = false,
  isProjectMutationPending = false,
  isNewConversationWithoutProject = false,
  sidebarOpen,
  isFirstRunOnboarding = false,
  onSidebarOpenChange,
  className,
}: OperatorConsoleProps): JSX.Element {
  const [uncontrolledSidebarOpen, setUncontrolledSidebarOpen] = useState(true);
  const [applicationView, setApplicationView] = useState<OperatorApplicationView>("conversation");
  const [applicationOverlay, setApplicationOverlay] = useState<OperatorApplicationOverlay | null>(null);
  const [renameTarget, setRenameTarget] = useState<OperatorProject | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [runningRemovalTarget, setRunningRemovalTarget] = useState<OperatorProject | null>(null);
  const [removalRequest, setRemovalRequest] = useState<{ project: OperatorProject; force: boolean } | null>(null);
  const [projectActionError, setProjectActionError] = useState<string | null>(null);
  const visibleProjects = projects ?? [project];
  const activeProjectId = selectedProjectId ?? project.projectId;
  const activeProject = visibleProjects.find((item) => item.projectId === activeProjectId) ?? project;
  const sidebarProjects = visibleProjects.map(toSidebarProject);
  const canSend = composerValue.trim() !== "" && activeRun === null && !isSending && !isSessionProjectUpdating;
  const emptyConversation = messages.length === 0 && activeRun === null;
  const requestedSidebarOpen = sidebarOpen ?? uncontrolledSidebarOpen;
  const effectiveSidebarOpen = isFirstRunOnboarding || requestedSidebarOpen;

  const setSidebarOpen = (open: boolean) => {
    if (isFirstRunOnboarding && !open) {
      return;
    }
    if (sidebarOpen === undefined) {
      setUncontrolledSidebarOpen(open);
    }
    onSidebarOpenChange?.(open);
  };

  const submitComposer = () => {
    if (canSend) {
      onSend();
    }
  };

  const openNewConversation = (options: NewConversationOptions = {}) => {
    setApplicationOverlay({ kind: "new-conversation", options });
  };

  return (
    <div className={cn("relative flex h-screen min-h-[560px] overflow-hidden bg-canvas text-ink", className)}>
      <aside
        className={cn(
          "relative w-[248px] shrink-0 flex-col overflow-hidden border-r border-line bg-rail",
          effectiveSidebarOpen ? "flex" : "hidden",
        )}
        data-testid="operator-sidebar"
        hidden={!effectiveSidebarOpen}
      >
        <header
          className="window-drag-region flex h-10 shrink-0 items-center gap-2 pl-[76px] pr-2"
          data-testid="sidebar-brand-region"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MoebiusLogo />
            <span className="truncate text-sm font-semibold tracking-[-0.01em]">Moebius</span>
          </div>
          <button
            type="button"
            className="window-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sub hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
            aria-label="关闭侧边栏"
            title={isFirstRunOnboarding ? "首次启动引导期间侧边栏保持打开" : "关闭侧边栏"}
            disabled={isFirstRunOnboarding}
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </header>

        <nav className="shrink-0 px-2 pb-2 pt-1" aria-label="应用导航" data-testid="sidebar-app-actions">
          <SidebarAction
            icon={Plus}
            label="新建对话"
            onClick={() => openNewConversation()}
          />
          <SidebarAction icon={Search} label="搜索" onClick={() => setApplicationOverlay({ kind: "search" })} />
          <SidebarAction
            icon={Diamond}
            label="Agent 团队"
            selected={applicationView === "agent-teams"}
            onClick={() => setApplicationView("agent-teams")}
          />
        </nav>

        <div className="shrink-0 px-4 pb-1 pt-2 text-xs font-medium text-hint">项目</div>
        <ConversationSidebar
          projects={sidebarProjects}
          selectedSessionId={isNewConversationWithoutProject ? undefined : selectedSessionId}
          showProjectPath={false}
          onSelectSession={(sessionId, projectId) => {
            if (!isSelectionMutationPending) {
              onSelectSession({ sessionId, projectId });
            }
          }}
          onNewConversation={(projectId) => {
            if (!isSelectionMutationPending) {
              openNewConversation({ projectId });
            }
          }}
          onShowProjectInFolder={onShowProjectInFolder === undefined ? undefined : (sidebarProject) => {
            const target = visibleProjects.find((candidate) => candidate.projectId === sidebarProject.id);
            if (target) {
              void onShowProjectInFolder(target.folderPath);
            }
          }}
          onRenameProject={onRenameProject === undefined ? undefined : (sidebarProject) => {
            const target = visibleProjects.find((candidate) => candidate.projectId === sidebarProject.id);
            if (target) {
              setProjectActionError(null);
              setRenameTarget(target);
              setRenameValue(target.title);
            }
          }}
          onRemoveProject={onRemoveProject === undefined ? undefined : (sidebarProject) => {
            const target = visibleProjects.find((candidate) => candidate.projectId === sidebarProject.id);
            if (!target) {
              return;
            }
            setProjectActionError(null);
            if (target.runningCount > 0) {
              setRunningRemovalTarget(target);
            } else {
              setRemovalRequest({ project: target, force: false });
            }
          }}
          disabled={isSelectionMutationPending || isProjectMutationPending}
          disabledReason="项目正在变更，请稍后再试"
          className="min-h-0 w-full flex-1 overflow-hidden border-0"
        />

        <footer className="shrink-0 border-t border-line p-2" data-testid="sidebar-footer">
          <SidebarAction icon={Settings} label="设置" />
        </footer>
      </aside>

      <main
        className="relative flex min-w-0 flex-1 flex-col bg-canvas"
        data-testid="operator-main"
        data-sidebar-open={effectiveSidebarOpen ? "true" : "false"}
      >
        <div className="window-drag-region absolute inset-x-0 top-0 z-10 h-9" aria-hidden="true" />
        {!effectiveSidebarOpen ? (
          <button
            type="button"
            className="window-no-drag absolute left-4 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-md text-sub hover:bg-hover hover:text-ink"
            aria-label="打开侧边栏"
            title="打开侧边栏"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : null}

        {applicationView === "agent-teams" ? (
          <AgentTeamsStub onBack={() => setApplicationView("conversation")} />
        ) : (
          <>
            <section
              className={cn(
                "scroll-thin min-h-0 flex-1 overflow-auto px-8 pt-16",
                isNewConversationWithoutProject ? "pb-8" : "pb-44",
              )}
              aria-label={isNewConversationWithoutProject ? "新建对话" : "会话时间线"}
            >
              {isNewConversationWithoutProject ? (
                <NewConversationWithoutProject />
              ) : emptyConversation ? (
                <ConversationEmptyState projectName={activeProject.title} />
              ) : (
                <div className="mx-auto max-w-[760px]">
                  <div className="divide-y divide-line">
                    {messages.map((message) => (
                      <TimelineEntry key={message.id} message={message} onOpenDiagnostics={onOpenDiagnostics} />
                    ))}
                  </div>

                  {activeRun ? (
                    <div data-testid="active-run-block">
                      <RunBlock
                        role={activeRun.role ?? "dev"}
                        elapsedTime={formatElapsed(activeRun.elapsedMs)}
                        summary={safeRunSummary(activeRun.lastOutputSummary)}
                        rawOutput={runRawOutput(activeRun)}
                        onInterrupt={() => onInterrupt(activeRun.sessionId, activeRun.runId)}
                        className="mt-3"
                      />
                    </div>
                  ) : null}

                  {lastError ? (
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-line py-3 text-sm text-danger">
                      <span>操作台遇到问题，请打开开发者诊断查看日志。</span>
                      {onOpenDiagnostics ? (
                        <Button type="button" variant="outline" size="sm" onClick={onOpenDiagnostics}>
                          查看日志
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            {!isNewConversationWithoutProject ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-canvas via-canvas to-transparent px-6 pb-5 pt-12">
                <RoleComposer
                  value={composerValue}
                  onValueChange={onComposerChange}
                  onSubmit={submitComposer}
                  disabled={activeRun !== null || isSending || isSessionProjectUpdating}
                  placeholder={activeRun ? "当前 agent 正在执行…" : "描述你的目标，@ 一个角色开始…"}
                  statusText={activeRun ? "当前正在执行，完成后可继续发送" : undefined}
                  context={
                    <ComposerContext
                      project={activeProject}
                      projects={visibleProjects}
                      selectedSession={selectedSession}
                      canChangeProject={
                        selectedSession !== null &&
                        messages.length === 0 &&
                        activeRun === null &&
                        !selectedSession.parentSessionId &&
                        (selectedSession.childCount ?? 0) === 0
                      }
                      disabled={isSelectionMutationPending}
                      onChangeSessionProject={onChangeSessionProject}
                      onToggleProjectWorktree={onToggleProjectWorktree}
                    />
                  }
                  className="pointer-events-auto mx-auto max-w-[720px]"
                />
              </div>
            ) : null}
          </>
        )}
      </main>

      {applicationOverlay ? (
        <ApplicationPlaceholder
          overlay={applicationOverlay}
          projects={visibleProjects}
          onAddProject={onOpenProject}
          onClose={() => setApplicationOverlay(null)}
        />
      ) : null}

      {renameTarget ? (
        <ProjectActionDialog
          title="修改显示名称"
          description="只修改 Moebius 中显示的名称，不会重命名磁盘文件夹。留空会恢复为文件夹名。"
          error={projectActionError}
          onCancel={() => {
            if (!isProjectMutationPending) {
              setRenameTarget(null);
            }
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            显示名称
            <Input
              autoFocus
              value={renameValue}
              disabled={isProjectMutationPending}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitProjectRename(renameTarget, renameValue, onRenameProject, setProjectActionError, setRenameTarget);
                }
              }}
            />
          </label>
          <DialogButtons
            pending={isProjectMutationPending}
            confirmLabel="保存"
            onCancel={() => setRenameTarget(null)}
            onConfirm={() => {
              void submitProjectRename(renameTarget, renameValue, onRenameProject, setProjectActionError, setRenameTarget);
            }}
          />
        </ProjectActionDialog>
      ) : null}

      {runningRemovalTarget ? (
        <ProjectActionDialog
          title="项目中仍有 Agent 正在运行"
          description={`“${runningRemovalTarget.title}”中的运行必须先停止。你可以取消，或继续到强制中止与移除确认。`}
          icon={<AlertTriangle className="h-5 w-5 text-danger" strokeWidth={1.5} aria-hidden="true" />}
          onCancel={() => setRunningRemovalTarget(null)}
        >
          <DialogButtons
            pending={false}
            confirmLabel="强制中止并继续"
            danger
            onCancel={() => setRunningRemovalTarget(null)}
            onConfirm={() => {
              setRemovalRequest({ project: runningRemovalTarget, force: true });
              setRunningRemovalTarget(null);
            }}
          />
        </ProjectActionDialog>
      ) : null}

      {removalRequest ? (
        <ProjectActionDialog
          title="移除项目？"
          description={`“${removalRequest.project.title}”会从侧边栏消失，其对话将归档并保留。此操作绝不会删除或修改磁盘上的项目文件夹。`}
          error={projectActionError}
          onCancel={() => {
            if (!isProjectMutationPending) {
              setRemovalRequest(null);
            }
          }}
        >
          <p className="rounded-md border border-line bg-rail px-3 py-2 text-xs text-sub">
            磁盘文件夹将保留：{removalRequest.project.folderPath}
          </p>
          <DialogButtons
            pending={isProjectMutationPending}
            confirmLabel={removalRequest.force ? "中止并移除" : "移除项目"}
            danger
            onCancel={() => setRemovalRequest(null)}
            onConfirm={() => {
              void submitProjectRemoval(removalRequest, onRemoveProject, setProjectActionError, setRemovalRequest);
            }}
          />
        </ProjectActionDialog>
      ) : null}
    </div>
  );
}

function NewConversationWithoutProject(): JSX.Element {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-card p-6 shadow-card">
      <h1 className="text-lg font-semibold text-ink">新建对话</h1>
      <p className="mt-1 text-sm text-sub">当前项目已移除。选择一个项目后再开始新的对话。</p>
      <div className="mt-5 grid gap-1.5">
        <span className="text-xs font-medium text-sub">项目</span>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-lg border border-line bg-input px-3 text-sm text-hint"
          aria-label="项目：未选择"
        >
          未选择项目
          <ChevronDown className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ProjectActionDialog({
  title,
  description,
  icon,
  error,
  onCancel,
  children,
}: {
  title: string;
  description: string;
  icon?: JSX.Element;
  error?: string | null;
  onCancel(): void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-line bg-card p-5 text-ink shadow-overlay" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start gap-3">
          {icon}
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-sub">{description}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4">
          {children}
          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

function DialogButtons({
  pending,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  confirmLabel: string;
  danger?: boolean;
  onCancel(): void;
  onConfirm(): void;
}): JSX.Element {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>取消</Button>
      <Button type="button" variant={danger ? "danger" : "default"} disabled={pending} onClick={onConfirm}>
        {pending ? "处理中…" : confirmLabel}
      </Button>
    </div>
  );
}

async function submitProjectRename(
  project: OperatorProject,
  title: string,
  onRenameProject: OperatorConsoleProps["onRenameProject"],
  setError: (error: string | null) => void,
  close: (value: OperatorProject | null) => void,
): Promise<void> {
  if (!onRenameProject) {
    return;
  }
  setError(null);
  try {
    await onRenameProject(project.projectId, title);
    close(null);
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

async function submitProjectRemoval(
  request: { project: OperatorProject; force: boolean },
  onRemoveProject: OperatorConsoleProps["onRemoveProject"],
  setError: (error: string | null) => void,
  close: (value: { project: OperatorProject; force: boolean } | null) => void,
): Promise<void> {
  if (!onRemoveProject) {
    return;
  }
  setError(null);
  try {
    await onRemoveProject(request.project.projectId, request.force);
    close(null);
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

function MoebiusLogo(): JSX.Element {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink text-rail"
      role="img"
      aria-label="Moebius Logo"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7.25 16.25C4.9 16.25 3 14.35 3 12s1.9-4.25 4.25-4.25C11.2 7.75 12.8 16.25 16.75 16.25 19.1 16.25 21 14.35 21 12s-1.9-4.25-4.25-4.25C12.8 7.75 11.2 16.25 7.25 16.25Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function SidebarAction({
  icon: Icon,
  label,
  selected = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  selected?: boolean;
  onClick?: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-normal text-ink hover:bg-hover",
        selected ? "bg-sel" : "bg-transparent",
      )}
      aria-current={selected ? "page" : undefined}
      onClick={onClick}
    >
      <Icon className="h-4 w-4 shrink-0 text-sub" strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function AgentTeamsStub({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <section className="scroll-thin min-h-0 flex-1 overflow-auto px-8 pb-12 pt-16" aria-labelledby="agent-teams-title">
      <div className="mx-auto max-w-[760px]">
        <p className="mb-2 text-xs font-medium text-hint">应用管理</p>
        <h1 id="agent-teams-title" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          Agent 团队
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-sub">
          Agent 团队管理界面将在后续任务中提供。当前入口与返回路径已经接通。
        </p>
        <Button type="button" variant="outline" className="mt-6" onClick={onBack}>
          返回当前对话
        </Button>
      </div>
    </section>
  );
}

function ApplicationPlaceholder({
  overlay,
  projects,
  onAddProject,
  onClose,
}: {
  overlay: OperatorApplicationOverlay;
  projects: OperatorProject[];
  onAddProject?: () => void;
  onClose: () => void;
}): JSX.Element {
  const isNewConversation = overlay.kind === "new-conversation";
  const hasProjects = projects.length > 0;
  const preselectedProject = isNewConversation && overlay.options.projectId !== undefined
    ? projects.find((project) => project.projectId === overlay.options.projectId)
    : undefined;
  const title = isNewConversation ? "新建对话" : "全局搜索";
  const description = isNewConversation
    ? "新建对话窗口将在后续任务中提供。此入口不会直接创建空白对话。"
    : "全局搜索将在后续任务中提供。关闭此窗口后会回到原来的项目和对话。";

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink/20 p-6" data-testid="application-overlay">
      <section
        className="w-full max-w-md rounded-xl border border-line bg-canvas p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-placeholder-title"
      >
        <h1 id="application-placeholder-title" className="text-lg font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-sub">{description}</p>
        {preselectedProject ? (
          <div className="mt-4 rounded-lg border border-line bg-rail p-3" data-testid="preselected-project">
            <p className="text-xs font-medium text-sub">已预选项目</p>
            <p className="mt-1 truncate text-sm font-medium text-ink" title={preselectedProject.title}>
              {preselectedProject.title}
            </p>
          </div>
        ) : null}
        {isNewConversation && !hasProjects ? (
          <div className="mt-4 rounded-lg border border-line bg-rail p-3">
            <p className="text-sm font-medium text-ink">还没有项目</p>
            <p className="mt-1 text-xs leading-5 text-sub">请先添加项目；添加完成前不能创建对话。</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onAddProject}>
              添加项目
            </Button>
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          {isNewConversation ? (
            <Button type="button" disabled>
              创建对话
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      </section>
    </div>
  );
}

function ComposerContext({
  project,
  projects,
  selectedSession,
  canChangeProject,
  disabled,
  onChangeSessionProject,
  onToggleProjectWorktree,
}: {
  project: OperatorProject;
  projects: OperatorProject[];
  selectedSession: OperatorSession | null;
  canChangeProject: boolean;
  disabled: boolean;
  onChangeSessionProject?: (sessionId: string, projectId: string) => void;
  onToggleProjectWorktree?: (projectId: string, worktreeMode: boolean) => void;
}): JSX.Element {
  const workspaceLabel = project.worktreeMode ? "隔离工作区" : "本地";

  return (
    <div className="flex min-w-0 items-center gap-3 text-xs text-sub">
      {canChangeProject && selectedSession && onChangeSessionProject ? (
        disabled ? (
          <button
            type="button"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 opacity-50"
            aria-label={`项目：${project.title}，点击切换`}
            disabled
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span className="truncate">{project.title}</span>
            <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-hover hover:text-ink"
                aria-label={`项目：${project.title}，点击切换`}
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span className="truncate">{project.title}</span>
                <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="min-w-48">
              {projects.map((candidate) => (
                <DropdownMenuCheckboxItem
                  key={candidate.projectId}
                  checked={candidate.projectId === project.projectId}
                  onSelect={() => {
                    if (candidate.projectId !== project.projectId) {
                      onChangeSessionProject(selectedSession.sessionId, candidate.projectId);
                    }
                  }}
                >
                  {candidate.title}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      ) : (
        <span className="inline-flex min-w-0 items-center gap-1.5" aria-label={`项目：${project.title}，已锁定`}>
          <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span className="truncate">{project.title}</span>
        </span>
      )}
      {onToggleProjectWorktree ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-hover hover:text-ink"
          aria-label={`工作区：${workspaceLabel}，点击切换`}
          aria-pressed={project.worktreeMode}
          onClick={() => onToggleProjectWorktree(project.projectId, !project.worktreeMode)}
        >
          <Laptop className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          {workspaceLabel}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <Laptop className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          {workspaceLabel}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        {project.worktreeMode ? "会话分支" : "当前分支"}
      </span>
    </div>
  );
}

function TimelineEntry({
  message,
  onOpenDiagnostics,
}: {
  message: OperatorMessage;
  onOpenDiagnostics?: () => void;
}): JSX.Element {
  const outcome = terminalOutcome(message);
  if (outcome) {
    return (
      <RunOutcome
        status={outcome}
        role={message.role}
        rawReason={message.error ?? message.body}
        rawOutput={message.error ? message.body : null}
        onOpenDiagnostics={onOpenDiagnostics}
        className="py-4"
      />
    );
  }

  if (message.speaker === "agent") {
    return (
      <AgentMessage
        role={message.role ?? "agent"}
        rawMarkdown={message.body}
        timestamp={formatTime(message.updatedAt)}
        className="py-4"
      />
    );
  }

  return (
    <div className="py-4 pl-10 text-sm">
      <div className="mb-1.5 flex items-center gap-2 text-xs text-sub">
        <span className="font-semibold text-ink">{message.speaker === "user" ? "你" : "系统提示"}</span>
        <span className="tnum text-hint">{formatTime(message.updatedAt)}</span>
      </div>
      <div className="whitespace-pre-wrap break-words leading-6 text-ink">
        {message.speaker === "system" ? systemSummary(message) : message.body}
      </div>
    </div>
  );
}

function toSidebarProject(project: OperatorProject): ConversationSidebarProject {
  return {
    id: project.projectId,
    path: project.folderPath,
    label: project.title,
    newConversationDisabledReason: project.newConversationDisabledReason,
    sessions: project.sessions.map((session) => ({
      id: session.sessionId,
      title: session.title,
      awaitsHumanReason: session.awaitsHumanReason,
      unreadSince: session.unreadSince,
      isRunning: session.status === "running" || session.runningCount > 0,
      createdAt: session.createdAt,
      summary: sessionSummary(session),
    })),
  };
}

function sessionSummary(session: OperatorSession): string | undefined {
  if (session.errorCount > 0) {
    return `错误 ${session.errorCount}`;
  }
  if (session.stuckCount > 0) {
    return `卡住 ${session.stuckCount}`;
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
  if (message.status === "stuck" || (message.speaker !== "system" && /(?:idle|max-duration)-timeout/u.test(rawText))) {
    return "stuck";
  }
  if (message.status === "interrupted" || (message.speaker !== "system" && rawText.includes("interrupted:"))) {
    return "interrupted";
  }
  if (message.status === "failed" || (message.speaker !== "system" && nonBlank(message.error))) {
    return "failed";
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
      return "运行失败，请查看日志";
    case "interrupted":
      return "运行已中断";
    case "stuck":
      return "运行长时间无响应，请查看日志";
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
  return [activeRun.stdoutTail, activeRun.stderrTail, activeRun.tailDiagnostic].filter(nonBlank).join("\n");
}

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const forbiddenMachineTextPattern = /\b(?:cwd|runDir|direct|worktree|dead-letter|handoff)\b|(?:^|\s)\/(?:tmp|Users|home)\//iu;
