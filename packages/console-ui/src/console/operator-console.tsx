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
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { AgentMessage } from "@/console/agent-message";
import {
  type AgentTeamDetailState,
  type AgentTeamSaveAllFailureView,
} from "@/console/agent-team-detail";
import {
  AgentTeamsPage,
  type AgentTeamInformationInput,
  type OperatorAgentTeam,
  type OperatorAgentTeamsState,
} from "@/console/agent-teams-page";
import { ConversationEmptyState } from "@/console/conversation-empty-state";
import { NewConversationPage } from "@/console/new-conversation-page";
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
export type OperatorProjectListState = "ready" | "loading" | "error";
export type OperatorApplicationOverlay = { kind: "search" };

export const DEFAULT_SIDEBAR_WIDTH_PX = 248;
export const MIN_SIDEBAR_WIDTH_PX = 220;
export const MAX_SIDEBAR_WIDTH_PX = 360;
export const NARROW_WINDOW_WIDTH_PX = 760;
export const STACKED_TEAM_ROW_WINDOW_WIDTH_PX = 1024;
const AGENT_TEAMS_REPAIR_INDICATOR_LABEL = "有 Agent 团队需要修复";

interface SidebarResizeGesture {
  pointerId: number;
  startX: number;
  startWidth: number;
}

type ConversationRouteAction = () => boolean | void | Promise<boolean | void>;

function isPromiseLike(value: unknown): value is PromiseLike<boolean | void> {
  return typeof value === "object"
    && value !== null
    && "then" in value
    && typeof value.then === "function";
}

export interface OperatorSession {
  sessionId: string;
  projectId: string;
  parentSessionId?: string | null;
  agentTeamOwnership?: "system" | "user" | null;
  agentTeamId?: string | null;
  agentTeamHealth?: "usable" | "needs-repair" | null;
  agentTeamHealthReason?: string | null;
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
  directoryAvailable?: boolean;
  directoryUnavailableReason?: string | null;
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

export interface OperatorNewConversationState {
  selectedProjectId: string | null;
  selectedTeamKey: string | null;
  draft: string;
  isSubmitting: boolean;
  error: string | null;
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
  projectListState?: OperatorProjectListState;
  agentTeamsState?: OperatorAgentTeamsState;
  lastUsedAgentTeamKey?: string | null;
  conversationAgentTeamKey?: string | null;
  selectedAgentTeamKey?: string | null;
  selectedAgentTeamMemberSlug?: string | null;
  agentTeamDetailState?: AgentTeamDetailState | null;
  newConversation?: OperatorNewConversationState | null;
  onComposerChange(value: string): void;
  onSend(): void;
  onStartNewConversation?: (projectId?: string) => void;
  onNewConversationProjectChange?: (projectId: string) => void;
  onNewConversationTeamChange?: (teamKey: string) => void;
  onNewConversationDraftChange?: (value: string) => void;
  onSubmitNewConversation?: () => void;
  onAddNewConversationProject?: () => void;
  onReorderProjects?: (projectIds: string[]) => boolean | void | Promise<boolean | void>;
  onToggleProjectWorktree?: (projectId: string, worktreeMode: boolean) => void;
  onSelectSession(selection: { sessionId: string; projectId: string }): void;
  onChangeSessionProject?: (sessionId: string, projectId: string) => void;
  onShowProjectInFolder?: (folderPath: string) => void | Promise<void>;
  onRenameProject?: (projectId: string, title: string) => void | Promise<void>;
  onRemoveProject?: (projectId: string, force: boolean) => void | Promise<void>;
  onSelectFolderForRepair?: (projectId: string) => Promise<string | null>;
  onRepairProjectFolder?: (projectId: string, folderPath: string) => void | Promise<void>;
  onArchiveSession?: (sessionId: string, projectId: string) => void | Promise<void>;
  onInterrupt(sessionId: string, runId: string): void;
  onOpenDiagnostics?: () => void;
  onRetryProjectList?: () => void;
  onRetryAgentTeams?: () => void;
  onCreateAgentTeam?: (information: AgentTeamInformationInput) => Promise<OperatorAgentTeam>;
  onOpenAgentTeam?: (teamKey: string) => void;
  onCloseAgentTeam?: () => void;
  onSelectAgentTeamMember?: (teamKey: string, memberSlug: string) => void;
  onChangeAgentTeamPrimaryAgent?: (teamKey: string, memberSlug: string) => void | Promise<void>;
  onAddAgentTeamMember?: (teamKey: string) => void | Promise<void>;
  onUpdateAgentTeamInformation?: (teamKey: string, information: AgentTeamInformationInput) => void | Promise<void>;
  onChangeAgentTeamMember?: (teamKey: string, memberSlug: string, agentMarkdown: string) => void;
  onSaveAgentTeamMember?: (teamKey: string, memberSlug: string) => void | Promise<void>;
  onCheckAgentTeamMemberExternalChange?: (teamKey: string, memberSlug: string) => void | Promise<void>;
  onLoadAgentTeamMemberExternalVersion?: (teamKey: string, memberSlug: string) => void;
  onOverwriteAgentTeamMemberExternalVersion?: (teamKey: string, memberSlug: string) => void | Promise<void>;
  onRetryAgentTeamMember?: (teamKey: string, memberSlug: string) => void;
  onDiscardAgentTeamMember?: (teamKey: string, memberSlug: string) => void;
  onDiscardAllAgentTeamDrafts?: (teamKey: string) => void;
  onSaveAllAgentTeamDrafts?: (teamKey: string) => Promise<{ failures: AgentTeamSaveAllFailureView[] }>;
  onDuplicateBuiltInAgentTeam?: (teamKey: string) => Promise<string>;
  onRecheckAgentTeam?: (teamKey: string) => void | Promise<void>;
  onRelocateAgentTeam?: (teamKey: string) => void | Promise<void>;
  onRemoveAgentTeamRecord?: (teamKey: string) => void | Promise<void>;
  agentTeamFileManagerLabel?: string;
  onOpenAgentTeamLocation?: (teamKey: string, memberSlug?: string) => void | Promise<void>;
  onDuplicateUserAgentTeam?: (teamKey: string) => Promise<string>;
  onDuplicateAgentTeamMember?: (teamKey: string, memberSlug: string) => void | Promise<void>;
  onTrashAgentTeamMember?: (teamKey: string, memberSlug: string) => void | Promise<void>;
  onTrashUserAgentTeam?: (teamKey: string) => void | Promise<void>;
  isSending?: boolean;
  isSelectionMutationPending?: boolean;
  isSessionProjectUpdating?: boolean;
  isProjectMutationPending?: boolean;
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
  projectListState = "ready",
  agentTeamsState = { status: "loading" },
  lastUsedAgentTeamKey = null,
  conversationAgentTeamKey = null,
  selectedAgentTeamKey,
  selectedAgentTeamMemberSlug,
  agentTeamDetailState,
  newConversation = null,
  onComposerChange,
  onSend,
  onStartNewConversation,
  onNewConversationProjectChange,
  onNewConversationTeamChange,
  onNewConversationDraftChange,
  onSubmitNewConversation,
  onAddNewConversationProject,
  onReorderProjects,
  onToggleProjectWorktree,
  onSelectSession,
  onChangeSessionProject,
  onShowProjectInFolder,
  onRenameProject,
  onRemoveProject,
  onSelectFolderForRepair,
  onRepairProjectFolder,
  onArchiveSession,
  onInterrupt,
  onOpenDiagnostics,
  onRetryProjectList,
  onRetryAgentTeams,
  onCreateAgentTeam,
  onOpenAgentTeam,
  onCloseAgentTeam,
  onSelectAgentTeamMember,
  onChangeAgentTeamPrimaryAgent,
  onAddAgentTeamMember,
  onUpdateAgentTeamInformation,
  onChangeAgentTeamMember,
  onSaveAgentTeamMember,
  onCheckAgentTeamMemberExternalChange,
  onLoadAgentTeamMemberExternalVersion,
  onOverwriteAgentTeamMemberExternalVersion,
  onRetryAgentTeamMember,
  onDiscardAgentTeamMember,
  onDiscardAllAgentTeamDrafts,
  onSaveAllAgentTeamDrafts,
  onDuplicateBuiltInAgentTeam,
  onRecheckAgentTeam,
  onRelocateAgentTeam,
  onRemoveAgentTeamRecord,
  agentTeamFileManagerLabel = "在文件管理器中打开",
  onOpenAgentTeamLocation,
  onDuplicateUserAgentTeam,
  onDuplicateAgentTeamMember,
  onTrashAgentTeamMember,
  onTrashUserAgentTeam,
  isSending = false,
  isSelectionMutationPending = false,
  isSessionProjectUpdating = false,
  isProjectMutationPending = false,
  sidebarOpen,
  isFirstRunOnboarding = false,
  onSidebarOpenChange,
  className,
}: OperatorConsoleProps): JSX.Element {
  const [uncontrolledSidebarOpen, setUncontrolledSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH_PX);
  const [isNarrowWindow, setIsNarrowWindow] = useState(() => viewportIsNarrow());
  const [useStackedTeamRows, setUseStackedTeamRows] = useState(() => viewportUsesStackedTeamRows());
  const sidebarResizeGestureRef = useRef<SidebarResizeGesture | null>(null);
  const [applicationView, setApplicationView] = useState<OperatorApplicationView>("conversation");
  const [applicationOverlay, setApplicationOverlay] = useState<OperatorApplicationOverlay | null>(null);
  const [pendingConversationRoute, setPendingConversationRoute] = useState<{
    run: ConversationRouteAction;
    cancel?: () => void;
  } | null>(null);
  const [conversationRouteConflictOpen, setConversationRouteConflictOpen] = useState(false);
  const [savingConversationRouteDrafts, setSavingConversationRouteDrafts] = useState(false);
  const [renameTarget, setRenameTarget] = useState<OperatorProject | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [runningRemovalTarget, setRunningRemovalTarget] = useState<OperatorProject | null>(null);
  const [removalRequest, setRemovalRequest] = useState<{ project: OperatorProject; force: boolean } | null>(null);
  const [repairRequest, setRepairRequest] = useState<{ project: OperatorProject; folderPath: string } | null>(null);
  const [repairPickerProjectId, setRepairPickerProjectId] = useState<string | null>(null);
  const [projectActionError, setProjectActionError] = useState<string | null>(null);
  const visibleProjects = projects ?? [project];
  const activeProjectId = selectedProjectId ?? project.projectId;
  const activeProject = visibleProjects.find((item) => item.projectId === activeProjectId) ?? project;
  const activeProjectUnavailable = activeProject.directoryAvailable === false;
  const projectListUnavailable = projectListState !== "ready";
  const projectConfigurationPending = isProjectMutationPending;
  const sidebarProjects = visibleProjects.map(toSidebarProject);
  const hasAgentTeamNeedingRepair = agentTeamsState.status === "ready"
    && agentTeamsState.teams.some((team) => team.status === "needs-repair");
  const conversationAgentTeam = agentTeamsState.status === "ready"
    ? agentTeamsState.teams.find((team) => team.teamKey === conversationAgentTeamKey)
    : undefined;
  const runtimeConversationAgentTeam = conversationAgentTeam === undefined || selectedSession?.agentTeamHealth == null
    ? conversationAgentTeam
    : {
        ...conversationAgentTeam,
        status: selectedSession.agentTeamHealth,
        canCreateConversation: selectedSession.agentTeamHealth === "usable",
      };
  const selectedAgentTeamNeedsRepair = selectedSession?.agentTeamHealth == null
    ? conversationAgentTeam?.status === "needs-repair"
    : selectedSession.agentTeamHealth === "needs-repair";
  const canSend = composerValue.trim() !== ""
    && activeRun === null
    && !isSending
    && !isSessionProjectUpdating
    && !activeProjectUnavailable
    && !selectedAgentTeamNeedsRepair;
  const emptyConversation = messages.length === 0 && activeRun === null;
  const requestedSidebarOpen = sidebarOpen ?? uncontrolledSidebarOpen;
  const sidebarAutoCollapsed = !isFirstRunOnboarding && requestedSidebarOpen && isNarrowWindow;
  const effectiveSidebarOpen = isFirstRunOnboarding || (requestedSidebarOpen && !isNarrowWindow);

  useEffect(() => {
    const updateResponsiveLayout = () => {
      setIsNarrowWindow(viewportIsNarrow());
      setUseStackedTeamRows(viewportUsesStackedTeamRows());
    };
    window.addEventListener("resize", updateResponsiveLayout);
    return () => window.removeEventListener("resize", updateResponsiveLayout);
  }, []);

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

  const openNewConversation = (projectId?: string) => {
    routeToConversation(() => onStartNewConversation?.(projectId));
  };

  const finishConversationRoute = () => {
    setPendingConversationRoute(null);
    setConversationRouteConflictOpen(false);
    setApplicationOverlay(null);
    setApplicationView("conversation");
  };

  const completeConversationRoute = (
    action: ConversationRouteAction = () => undefined,
  ): boolean | void | Promise<boolean | void> => {
    const result = action();
    if (isPromiseLike(result)) {
      return Promise.resolve(result).then((outcome) => {
        if (outcome !== false) {
          finishConversationRoute();
        }
        return outcome;
      });
    }
    if (result !== false) {
      finishConversationRoute();
    }
    return result;
  };

  const routeToConversation = (action?: ConversationRouteAction, onCancel?: () => void) => {
    if (applicationView !== "agent-teams") {
      return completeConversationRoute(action);
    }
    const editors = Object.values(agentTeamDetailState?.memberEditors ?? {});
    if (editors.some((editor) => editor?.externalChangeStatus === "conflict")) {
      setPendingConversationRoute({ run: action ?? (() => undefined), cancel: onCancel });
      setConversationRouteConflictOpen(true);
      return;
    }
    if (editors.some((editor) => editor?.isDirty === true)) {
      setPendingConversationRoute({ run: action ?? (() => undefined), cancel: onCancel });
      return;
    }
    return completeConversationRoute(action);
  };

  const resizeSidebar = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = sidebarResizeGestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    setSidebarWidth(clampSidebarWidth(gesture.startWidth + event.clientX - gesture.startX));
  };

  const finishSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = sidebarResizeGestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    sidebarResizeGestureRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div className={cn("relative flex h-screen min-h-[560px] overflow-hidden bg-canvas text-ink", className)}>
      <aside
        className={cn(
          "relative shrink-0 flex-col overflow-hidden border-r border-line bg-rail",
          effectiveSidebarOpen ? "flex" : "hidden",
        )}
        data-testid="operator-sidebar"
        hidden={!effectiveSidebarOpen}
        style={{ width: `${sidebarWidth}px` }}
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
            selected={newConversation !== null && applicationView === "conversation"}
            disabled={projectListUnavailable || isSelectionMutationPending || projectConfigurationPending}
            disabledReason={(projectListUnavailable ? "项目数据尚不可用" : undefined)
              ?? (isSelectionMutationPending || projectConfigurationPending ? "项目正在变更，请稍后再试" : undefined)}
            onClick={() => openNewConversation()}
          />
          <SidebarAction
            icon={Search}
            label="搜索"
            disabled={projectListUnavailable}
            disabledReason={projectListUnavailable ? "项目数据尚不可用" : undefined}
            onClick={() => setApplicationOverlay({ kind: "search" })}
          />
          <SidebarAction
            icon={Diamond}
            label="Agent 团队"
            selected={applicationView === "agent-teams"}
            statusIndicatorLabel={hasAgentTeamNeedingRepair ? AGENT_TEAMS_REPAIR_INDICATOR_LABEL : undefined}
            disabled={activeProjectUnavailable}
            disabledReason={activeProject.directoryUnavailableReason ?? undefined}
            onClick={() => setApplicationView("agent-teams")}
          />
        </nav>

        <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-2 text-xs font-medium text-hint">
          <span>项目</span>
          {projectConfigurationPending ? <span role="status">正在更新…</span> : null}
        </div>
        <ConversationSidebar
          projects={sidebarProjects}
          dataState={projectListState}
          selectedSessionId={newConversation === null ? selectedSessionId : undefined}
          showProjectPath={false}
          onSelectSession={(sessionId, projectId) => {
            if (!isSelectionMutationPending) {
              routeToConversation(() => onSelectSession({ sessionId, projectId }));
            }
          }}
          onNewConversation={(projectId) => {
            if (!isSelectionMutationPending) {
              openNewConversation(projectId);
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
          onArchiveSession={onArchiveSession === undefined ? undefined : (sessionId, projectId) => {
            const archive = () => void onArchiveSession(sessionId, projectId);
            if (sessionId === selectedSessionId) {
              routeToConversation(archive);
            } else {
              archive();
            }
          }}
          onReorderProjects={isSelectionMutationPending || isProjectMutationPending ? undefined : onReorderProjects}
          onRepairProject={onSelectFolderForRepair === undefined ? undefined : (sidebarProject) => {
            const target = visibleProjects.find((candidate) => candidate.projectId === sidebarProject.id);
            if (!target || repairPickerProjectId !== null) {
              return;
            }
            setProjectActionError(null);
            setRepairPickerProjectId(target.projectId);
            void onSelectFolderForRepair(target.projectId)
              .then((folderPath) => {
                if (folderPath !== null) {
                  setRepairRequest({ project: target, folderPath });
                }
              })
              .catch((error: unknown) => setProjectActionError(error instanceof Error ? error.message : String(error)))
              .finally(() => setRepairPickerProjectId(null));
          }}
          onRetry={onRetryProjectList}
          disabled={isSelectionMutationPending}
          disabledReason="项目正在变更，请稍后再试"
          projectActionsDisabled={projectConfigurationPending}
          projectActionsDisabledReason="项目配置正在更新"
          className="min-h-0 w-full flex-1 overflow-hidden border-0"
        />

        <footer className="shrink-0 border-t border-line p-2" data-testid="sidebar-footer">
          <SidebarAction icon={Settings} label="设置" />
        </footer>

        <div
          className="window-no-drag group absolute inset-y-0 right-0 z-30 w-1 cursor-col-resize touch-none"
          role="separator"
          aria-label="调整侧边栏宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH_PX}
          aria-valuemax={MAX_SIDEBAR_WIDTH_PX}
          aria-valuenow={sidebarWidth}
          aria-valuetext={`${sidebarWidth} 像素`}
          data-testid="sidebar-resize-handle"
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            sidebarResizeGestureRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startWidth: sidebarWidth,
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={resizeSidebar}
          onPointerUp={finishSidebarResize}
          onPointerCancel={finishSidebarResize}
        >
          <span className="absolute inset-y-0 right-0 w-px bg-line transition-colors group-hover:bg-accent group-active:bg-accent" />
        </div>
      </aside>

      <main
        className="relative flex min-w-0 flex-1 flex-col bg-canvas"
        data-testid="operator-main"
        data-sidebar-open={effectiveSidebarOpen ? "true" : "false"}
        data-sidebar-auto-collapsed={sidebarAutoCollapsed ? "true" : "false"}
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
          <AgentTeamsPage
            state={agentTeamsState}
            selectedTeamKey={selectedAgentTeamKey}
            selectedMemberSlug={selectedAgentTeamMemberSlug}
            detailState={agentTeamDetailState}
            useStackedRows={useStackedTeamRows}
            onRetry={onRetryAgentTeams}
            onCreateTeam={onCreateAgentTeam}
            onOpenTeam={onOpenAgentTeam}
            onCloseTeam={onCloseAgentTeam}
            onSelectMember={onSelectAgentTeamMember}
            onChangePrimaryAgent={onChangeAgentTeamPrimaryAgent}
            onAddMember={onAddAgentTeamMember}
            onUpdateTeamInformation={onUpdateAgentTeamInformation}
            onChangeMember={onChangeAgentTeamMember}
            onSaveMember={onSaveAgentTeamMember}
            onCheckMemberExternalChange={onCheckAgentTeamMemberExternalChange}
            onLoadMemberExternalVersion={onLoadAgentTeamMemberExternalVersion}
            onOverwriteMemberExternalVersion={onOverwriteAgentTeamMemberExternalVersion}
            onRetryMember={onRetryAgentTeamMember}
            onDiscardMember={onDiscardAgentTeamMember}
            onDiscardAll={onDiscardAllAgentTeamDrafts}
            onSaveAll={onSaveAllAgentTeamDrafts}
            onDuplicateBuiltInTeam={onDuplicateBuiltInAgentTeam}
            onRecheckTeam={onRecheckAgentTeam}
            onRelocateTeam={onRelocateAgentTeam}
            onRemoveTeamRecord={onRemoveAgentTeamRecord}
            fileManagerActionLabel={agentTeamFileManagerLabel}
            onOpenLocation={onOpenAgentTeamLocation}
            onDuplicateUserTeam={onDuplicateUserAgentTeam}
            onDuplicateMember={onDuplicateAgentTeamMember}
            onTrashMember={onTrashAgentTeamMember}
            onTrashUserTeam={onTrashUserAgentTeam}
            onBack={() => routeToConversation()}
          />
        ) : newConversation !== null ? (
          <NewConversationPage
            projects={visibleProjects.map((candidate) => ({
              projectId: candidate.projectId,
              title: candidate.title,
              available: candidate.directoryAvailable !== false && candidate.newConversationDisabledReason == null,
              workspaceLabel: candidate.worktreeMode ? "独立工作空间" : "默认工作空间",
              branchLabel: candidate.worktreeMode ? "会话分支" : "当前分支",
            }))}
            teams={agentTeamsState.status === "ready"
              ? agentTeamsState.teams
                .filter((team) => team.canCreateConversation)
                .map((team) => ({ teamKey: team.teamKey, label: team.name?.trim() || "未命名团队" }))
              : []}
            selectedProjectId={newConversation.selectedProjectId}
            selectedTeamKey={newConversation.selectedTeamKey}
            draft={newConversation.draft}
            isSubmitting={newConversation.isSubmitting}
            isProjectMutationPending={isSelectionMutationPending}
            error={newConversation.error}
            onSelectProject={(projectId) => onNewConversationProjectChange?.(projectId)}
            onAddProject={() => onAddNewConversationProject?.()}
            onSelectTeam={(teamKey) => onNewConversationTeamChange?.(teamKey)}
            onDraftChange={(value) => onNewConversationDraftChange?.(value)}
            onSubmit={() => onSubmitNewConversation?.()}
          />
        ) : (
          <>
            {selectedSession ? (
              <header className="window-drag-region absolute inset-x-0 top-0 z-10 px-8 pb-3 pt-12">
                <h1
                  className="mx-auto max-w-[760px] truncate text-base font-semibold text-ink"
                  title={selectedSession.title}
                >
                  {selectedSession.title}
                </h1>
              </header>
            ) : null}
            <section
              className="scroll-thin min-h-0 flex-1 overflow-auto px-8 pb-44 pt-20"
              aria-label="会话时间线"
            >
              {emptyConversation ? (
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

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-canvas via-canvas to-transparent px-6 pb-5 pt-12">
                <RoleComposer
                  value={composerValue}
                  onValueChange={onComposerChange}
                  onSubmit={submitComposer}
                  disabled={activeRun !== null || isSending || isSessionProjectUpdating || activeProjectUnavailable || selectedAgentTeamNeedsRepair}
                  placeholder={activeProjectUnavailable
                    ? "项目文件夹不可用，请先使用红色扳手修复"
                    : selectedAgentTeamNeedsRepair
                      ? "当前 Agent 团队需要修复"
                      : activeRun
                        ? "当前 agent 正在执行…"
                        : "描述你的目标，@ 一个角色开始…"}
                  statusText={activeProjectUnavailable
                    ? "历史对话只读；修复文件夹后可继续"
                    : selectedAgentTeamNeedsRepair
                      ? "历史对话仍可查看；修复团队后可继续发送"
                      : activeRun
                        ? "当前正在执行，完成后可继续发送"
                        : undefined}
                  context={
                    <ComposerContext
                      project={activeProject}
                      projects={visibleProjects}
                      selectedSession={selectedSession}
                      agentTeam={runtimeConversationAgentTeam}
                      canChangeProject={
                        selectedSession !== null &&
                        messages.length === 0 &&
                        activeRun === null &&
                        !selectedSession.parentSessionId &&
                        (selectedSession.childCount ?? 0) === 0
                      }
                      disabled={isSelectionMutationPending || activeProjectUnavailable}
                      onChangeSessionProject={onChangeSessionProject}
                      onToggleProjectWorktree={onToggleProjectWorktree}
                    />
                  }
                  className="pointer-events-auto mx-auto max-w-[720px]"
                />
            </div>
          </>
        )}
      </main>

      {applicationOverlay ? (
        <ApplicationPlaceholder overlay={applicationOverlay} onClose={() => setApplicationOverlay(null)} />
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

      {repairRequest ? (
        <ProjectActionDialog
          title="修复项目文件夹"
          description="确认后，Moebius 将从新位置继续使用原项目历史；不会移动、复制或重命名任何磁盘文件。"
          error={projectActionError}
          onCancel={() => {
            if (!isProjectMutationPending) {
              setRepairRequest(null);
            }
          }}
        >
          <dl className="grid gap-3 rounded-lg border border-line bg-rail p-3 text-xs">
            <div className="grid gap-1">
              <dt className="font-medium text-sub">原位置</dt>
              <dd className="break-all text-ink" data-testid="repair-original-folder">{repairRequest.project.folderPath}</dd>
            </div>
            <div className="grid gap-1 border-t border-line pt-3">
              <dt className="font-medium text-sub">新位置</dt>
              <dd className="break-all text-ink" data-testid="repair-new-folder">{repairRequest.folderPath}</dd>
            </div>
          </dl>
          <DialogButtons
            pending={isProjectMutationPending}
            confirmLabel="确认新位置"
            onCancel={() => setRepairRequest(null)}
            onConfirm={() => {
              void submitProjectFolderRepair(repairRequest, onRepairProjectFolder, setProjectActionError, setRepairRequest);
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
              const remove = () => void submitProjectRemoval(
                removalRequest,
                onRemoveProject,
                setProjectActionError,
                setRemovalRequest,
              );
              if (removalRequest.project.projectId === activeProjectId) {
                routeToConversation(remove);
              } else {
                remove();
              }
            }}
          />
        </ProjectActionDialog>
      ) : null}

      {pendingConversationRoute ? (
        <ProjectActionDialog
          title="还有未保存的修改"
          description="可以继续编辑、放弃全部修改，或保存全部后前往对话。"
          onCancel={() => {
            pendingConversationRoute.cancel?.();
            setPendingConversationRoute(null);
          }}
        >
          <DialogButtons
            pending={savingConversationRouteDrafts}
            confirmLabel="保存全部并离开"
            onCancel={() => {
              pendingConversationRoute.cancel?.();
              setPendingConversationRoute(null);
            }}
            onConfirm={() => {
              const teamKey = agentTeamDetailState?.teamKey;
              if (teamKey === undefined || onSaveAllAgentTeamDrafts === undefined) {
                return;
              }
              setSavingConversationRouteDrafts(true);
              void onSaveAllAgentTeamDrafts(teamKey).then((result) => {
                if (result.failures.length === 0) {
                  return completeConversationRoute(pendingConversationRoute.run);
                }
                return undefined;
              }).finally(() => setSavingConversationRouteDrafts(false));
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={savingConversationRouteDrafts}
            onClick={() => {
              const teamKey = agentTeamDetailState?.teamKey;
              if (teamKey !== undefined) {
                onDiscardAllAgentTeamDrafts?.(teamKey);
              }
              void completeConversationRoute(pendingConversationRoute.run);
            }}
          >
            放弃全部
          </Button>
        </ProjectActionDialog>
      ) : null}

      {conversationRouteConflictOpen ? (
        <ProjectActionDialog
          title="无法前往对话"
          description="有 Agent 文件在应用外被修改。请先在团队详情中选择载入外部版本或用当前内容覆盖。"
          onCancel={() => {
            pendingConversationRoute?.cancel?.();
            setPendingConversationRoute(null);
            setConversationRouteConflictOpen(false);
          }}
        >
          <div className="flex justify-end">
            <Button type="button" onClick={() => {
              pendingConversationRoute?.cancel?.();
              setPendingConversationRoute(null);
              setConversationRouteConflictOpen(false);
            }}>知道了</Button>
          </div>
        </ProjectActionDialog>
      ) : null}
    </div>
  );
}

function viewportIsNarrow(): boolean {
  return typeof window !== "undefined" && window.innerWidth < NARROW_WINDOW_WIDTH_PX;
}

function viewportUsesStackedTeamRows(): boolean {
  return typeof window !== "undefined" && window.innerWidth < STACKED_TEAM_ROW_WINDOW_WIDTH_PX;
}

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH_PX, Math.max(MIN_SIDEBAR_WIDTH_PX, width));
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

async function submitProjectFolderRepair(
  request: { project: OperatorProject; folderPath: string },
  onRepairProjectFolder: OperatorConsoleProps["onRepairProjectFolder"],
  setError: (error: string | null) => void,
  close: (value: { project: OperatorProject; folderPath: string } | null) => void,
): Promise<void> {
  if (!onRepairProjectFolder) {
    return;
  }
  setError(null);
  try {
    await onRepairProjectFolder(request.project.projectId, request.folderPath);
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
  statusIndicatorLabel,
  onClick,
  disabled = false,
  disabledReason,
}: {
  icon: LucideIcon;
  label: string;
  selected?: boolean;
  statusIndicatorLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-normal text-ink hover:bg-hover",
        selected ? "bg-sel" : "bg-transparent",
      )}
      aria-label={label}
      aria-current={selected ? "page" : undefined}
      aria-description={disabled ? disabledReason : undefined}
      title={disabled ? disabledReason ?? label : label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4 shrink-0 text-sub" strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
      {statusIndicatorLabel ? (
        <span
          className="ml-auto h-2 w-2 shrink-0 rounded-full bg-danger"
          role="img"
          aria-label={statusIndicatorLabel}
          title={statusIndicatorLabel}
        />
      ) : null}
    </button>
  );
}

function ApplicationPlaceholder({
  overlay,
  onClose,
}: {
  overlay: OperatorApplicationOverlay;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink/20 p-6" data-testid="application-overlay">
      <section
        className="w-full max-w-md rounded-xl border border-line bg-canvas p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-placeholder-title"
      >
        <h1 id="application-placeholder-title" className="text-lg font-semibold tracking-[-0.01em] text-ink">
          全局搜索
        </h1>
        <p className="mt-2 text-sm leading-6 text-sub">
          全局搜索将在后续任务中提供。关闭此窗口后会回到原来的项目和对话。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      </section>
    </div>
  );
}

export function resolveNewConversationAgentTeamKey(
  teams: readonly OperatorAgentTeam[],
  lastUsedAgentTeamKey: string | null,
): string | null {
  const recordedTeam = lastUsedAgentTeamKey === null
    ? undefined
    : teams.find((team) => team.teamKey === lastUsedAgentTeamKey && team.canCreateConversation);
  if (recordedTeam !== undefined) {
    return recordedTeam.teamKey;
  }
  return teams.find((team) => team.ownership === "system" && team.canCreateConversation)?.teamKey ?? null;
}

function ComposerContext({
  project,
  projects,
  selectedSession,
  agentTeam,
  canChangeProject,
  disabled,
  onChangeSessionProject,
  onToggleProjectWorktree,
}: {
  project: OperatorProject;
  projects: OperatorProject[];
  selectedSession: OperatorSession | null;
  agentTeam?: OperatorAgentTeam;
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
      {agentTeam ? <SessionAgentTeamButton team={agentTeam} /> : null}
      {onToggleProjectWorktree ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-hover hover:text-ink"
          aria-label={`工作区：${workspaceLabel}，点击切换`}
          aria-pressed={project.worktreeMode}
          disabled={disabled}
          title={disabled ? project.directoryUnavailableReason ?? "项目当前不可用" : undefined}
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

function SessionAgentTeamButton({ team }: { team: OperatorAgentTeam }): JSX.Element {
  const teamLabel = team.name?.trim() || "未命名团队";
  const needsRepair = team.status === "needs-repair";
  const accessibleLabel = needsRepair
    ? `Agent 团队：${teamLabel}，需要修复`
    : `Agent 团队：${teamLabel}`;

  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1",
        needsRepair ? "bg-danger/10 text-danger" : "text-sub",
      )}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {needsRepair ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <Diamond className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      )}
      <span className="truncate">{teamLabel}</span>
      {needsRepair ? <span className="whitespace-nowrap font-medium">需要修复</span> : null}
    </button>
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
  const sessionsById = new Map(project.sessions.map((session) => [session.sessionId, session]));
  return {
    id: project.projectId,
    path: project.folderPath,
    label: project.title,
    newConversationDisabledReason: project.newConversationDisabledReason,
    directoryAvailable: project.directoryAvailable,
    directoryUnavailableReason: project.directoryUnavailableReason,
    sessions: project.sessions.map((session) => ({
      id: session.sessionId,
      title: session.title,
      parentTitle: session.parentSessionId !== undefined
        && session.parentSessionId !== null
        && session.parentSessionId !== session.sessionId
        ? sessionsById.get(session.parentSessionId)?.title
        : undefined,
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
