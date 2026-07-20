import * as React from "react";
import { ChevronRight, MoreHorizontal, Plus, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

export type ConversationSessionStatus = "red" | "blue" | "blink" | "none";

export interface ConversationSidebarSession {
  id: string;
  title: string;
  awaitsHumanReason: string | null;
  unreadSince: string | null;
  isRunning: boolean;
  createdAt: string;
  summary?: string;
}

export interface ConversationSidebarProject {
  id: string;
  path: string;
  label?: string;
  newConversationDisabledReason?: string | null;
  directoryAvailable?: boolean;
  directoryUnavailableReason?: string | null;
  sessions: ConversationSidebarSession[];
}

export interface ConversationSidebarProps {
  projects: ConversationSidebarProject[];
  selectedSessionId?: string;
  onSelectSession?: (sessionId: string, projectId: string) => void;
  onNewConversation?: (projectId: string) => void;
  onShowProjectInFolder?: (project: ConversationSidebarProject) => void;
  onRenameProject?: (project: ConversationSidebarProject) => void;
  onRemoveProject?: (project: ConversationSidebarProject) => void;
  onReorderProjects?: (projectIds: string[]) => boolean | void | Promise<boolean | void>;
  onRepairProject?: (project: ConversationSidebarProject) => void;
  disabled?: boolean;
  disabledReason?: string;
  showProjectPath?: boolean;
  className?: string;
}

const statusLabel: Record<ConversationSessionStatus, string> = {
  red: "需要你处理",
  blue: "有新结果",
  blink: "正在运行",
  none: ""
};

export function deriveStatusDot(
  session: Pick<ConversationSidebarSession, "awaitsHumanReason" | "unreadSince" | "isRunning">,
): ConversationSessionStatus {
  if (session.awaitsHumanReason !== null) {
    return "red";
  }
  if (session.unreadSince !== null) {
    return "blue";
  }
  if (session.isRunning) {
    return "blink";
  }
  return "none";
}

export function projectDirectoryName(project: Pick<ConversationSidebarProject, "path" | "label">): string {
  const displayName = project.label?.trim();
  if (displayName) {
    return displayName;
  }
  const trimmed = project.path.trim().replace(/[\\/]+$/u, "");
  const directory = trimmed.split(/[\\/]/u).filter(Boolean).at(-1);
  return directory || "未命名项目";
}

export function orderSessionsByCreatedAt<T extends { createdAt: string }>(sessions: readonly T[]): T[] {
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((left, right) => {
      const byCreatedAt = right.session.createdAt.localeCompare(left.session.createdAt);
      return byCreatedAt === 0 ? left.index - right.index : byCreatedAt;
    })
    .map(({ session }) => session);
}

export interface ProjectRowBounds {
  id: string;
  top: number;
  bottom: number;
}

export function orderProjectIdsForPointer(
  projectIds: readonly string[],
  draggedProjectId: string,
  clientY: number,
  rowBounds: readonly ProjectRowBounds[],
): string[] {
  const remaining = projectIds.filter((projectId) => projectId !== draggedProjectId);
  if (remaining.length === projectIds.length) {
    return [...projectIds];
  }
  let insertAt = remaining.length;
  for (let index = 0; index < remaining.length; index += 1) {
    const bounds = rowBounds.find((entry) => entry.id === remaining[index]);
    if (bounds !== undefined && clientY < (bounds.top + bounds.bottom) / 2) {
      insertAt = index;
      break;
    }
  }
  const next = [...remaining];
  next.splice(insertAt, 0, draggedProjectId);
  return next;
}

interface ProjectPointerGesture {
  pointerId: number;
  projectId: string;
  startX: number;
  startY: number;
  lastY: number;
  maxDistance: number;
  startedAt: number;
  activated: boolean;
  initialOrder: string[];
  activationTimer: number;
}

const PROJECT_DRAG_DISTANCE_PX = 5;
const PROJECT_DRAG_DELAY_MS = 150;

export function ConversationSidebar({
  projects,
  selectedSessionId,
  onSelectSession,
  onNewConversation,
  onShowProjectInFolder,
  onRenameProject,
  onRemoveProject,
  onReorderProjects,
  onRepairProject,
  disabled = false,
  disabledReason,
  showProjectPath = true,
  className
}: ConversationSidebarProps): JSX.Element {
  const [collapsedProjectIds, setCollapsedProjectIds] = React.useState<Set<string>>(() => new Set());
  const [draftProjectOrder, setDraftProjectOrder] = React.useState<string[] | null>(null);
  const [draggingProjectId, setDraggingProjectId] = React.useState<string | null>(null);
  const rowElements = React.useRef(new Map<string, HTMLDivElement>());
  const gestureRef = React.useRef<ProjectPointerGesture | null>(null);
  const projectIds = projects.map((project) => project.id);
  const projectOrderKey = projectIds.join("\u0000");

  React.useEffect(() => {
    setDraftProjectOrder((current) => {
      if (current === null) {
        return null;
      }
      const currentSet = new Set(current);
      return current.length === projectIds.length && projectIds.every((projectId) => currentSet.has(projectId))
        ? current
        : null;
    });
  }, [projectOrderKey]);

  React.useEffect(() => () => {
    const gesture = gestureRef.current;
    if (gesture !== null) {
      window.clearTimeout(gesture.activationTimer);
    }
  }, []);

  const visibleProjectIds = draftProjectOrder ?? projectIds;
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const visibleProjects = visibleProjectIds.flatMap((projectId) => {
    const project = projectsById.get(projectId);
    return project === undefined ? [] : [project];
  });

  const rowBounds = (): ProjectRowBounds[] => visibleProjectIds.flatMap((projectId) => {
    const element = rowElements.current.get(projectId);
    if (element === undefined) {
      return [];
    }
    const bounds = element.getBoundingClientRect();
    return [{ id: projectId, top: bounds.top, bottom: bounds.bottom }];
  });

  const updateDragOrder = (gesture: ProjectPointerGesture): void => {
    setDraftProjectOrder((current) => orderProjectIdsForPointer(
      current ?? gesture.initialOrder,
      gesture.projectId,
      gesture.lastY,
      rowBounds(),
    ));
  };

  const activateGesture = (gesture: ProjectPointerGesture): void => {
    if (
      disabled
      || onReorderProjects === undefined
      || gestureRef.current !== gesture
      || gesture.activated
      || gesture.maxDistance < PROJECT_DRAG_DISTANCE_PX
    ) {
      return;
    }
    gesture.activated = true;
    setDraggingProjectId(gesture.projectId);
    updateDragOrder(gesture);
  };

  const finishGesture = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      return;
    }
    window.clearTimeout(gesture.activationTimer);
    gestureRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (gesture.activated) {
      const nextOrder = orderProjectIdsForPointer(
        draftProjectOrder ?? gesture.initialOrder,
        gesture.projectId,
        gesture.lastY,
        rowBounds(),
      );
      setDraggingProjectId(null);
      if (cancelled) {
        setDraftProjectOrder(null);
      } else if (nextOrder.some((projectId, index) => projectId !== gesture.initialOrder[index])) {
        setDraftProjectOrder(nextOrder);
        void Promise.resolve(onReorderProjects?.(nextOrder)).then((accepted) => {
          if (accepted === false) {
            setDraftProjectOrder(null);
          }
        }, () => setDraftProjectOrder(null));
      } else {
        setDraftProjectOrder(null);
      }
      return;
    }
    if (!cancelled && gesture.maxDistance < PROJECT_DRAG_DISTANCE_PX) {
      setCollapsedProjectIds((current) => {
        const next = new Set(current);
        if (next.has(gesture.projectId)) {
          next.delete(gesture.projectId);
        } else {
          next.add(gesture.projectId);
        }
        return next;
      });
    }
  };

  return (
    <aside
      className={cn("flex w-[248px] flex-col bg-rail text-ink", className)}
      aria-label="项目和会话"
    >
      <nav className="scroll-thin min-h-0 flex-1 overflow-auto px-2 pb-2" aria-label="项目列表">
        {visibleProjects.map((project) => {
          const projectName = projectDirectoryName(project);
          const orderedSessions = orderSessionsByCreatedAt(project.sessions);
          const expanded = !collapsedProjectIds.has(project.id);
          const newConversationDisabledReason = project.newConversationDisabledReason
            ?? (disabled ? disabledReason ?? "项目正在变更，请稍后再试" : null);

          return (
            <section key={project.id} className="mb-2" aria-label={`${projectName} 项目`}>
              <div
                ref={(element) => {
                  if (element === null) {
                    rowElements.current.delete(project.id);
                  } else {
                    rowElements.current.set(project.id, element);
                  }
                }}
                data-testid="conversation-sidebar-project"
                data-project-id={project.id}
                className={cn(
                  "mb-0.5 flex min-w-0 cursor-grab touch-none select-none items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover",
                  draggingProjectId === project.id && "cursor-grabbing bg-sel opacity-80",
                )}
                onPointerDown={(event) => {
                  if (
                    event.button !== 0
                    || gestureRef.current !== null
                    || (event.target as Element).closest("[data-project-row-action]") !== null
                  ) {
                    return;
                  }
                  const gesture: ProjectPointerGesture = {
                    pointerId: event.pointerId,
                    projectId: project.id,
                    startX: event.clientX,
                    startY: event.clientY,
                    lastY: event.clientY,
                    maxDistance: 0,
                    startedAt: Date.now(),
                    activated: false,
                    initialOrder: [...visibleProjectIds],
                    activationTimer: 0,
                  };
                  gesture.activationTimer = window.setTimeout(() => activateGesture(gesture), PROJECT_DRAG_DELAY_MS);
                  gestureRef.current = gesture;
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const gesture = gestureRef.current;
                  if (gesture === null || gesture.pointerId !== event.pointerId) {
                    return;
                  }
                  gesture.lastY = event.clientY;
                  gesture.maxDistance = Math.max(
                    gesture.maxDistance,
                    Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY),
                  );
                  if (!gesture.activated && Date.now() - gesture.startedAt >= PROJECT_DRAG_DELAY_MS) {
                    activateGesture(gesture);
                  } else if (gesture.activated) {
                    updateDragOrder(gesture);
                  }
                }}
                onPointerUp={(event) => finishGesture(event, false)}
                onPointerCancel={(event) => finishGesture(event, true)}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  aria-label={`${projectName} 项目，${expanded ? "已展开" : "已折叠"}`}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setCollapsedProjectIds((current) => {
                        const next = new Set(current);
                        if (next.has(project.id)) {
                          next.delete(project.id);
                        } else {
                          next.add(project.id);
                        }
                        return next;
                      });
                    }
                  }}
                >
                  <ChevronRight
                    className={cn("h-4 w-4 shrink-0 text-sub transition-transform", expanded && "rotate-90")}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold leading-5">{projectName}</h2>
                    {showProjectPath ? <p className="truncate text-xs text-hint">{project.path}</p> : null}
                  </div>
                </div>
                {project.directoryAvailable === false && onRepairProject ? (
                  <button
                    type="button"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-danger hover:bg-danger/10 disabled:pointer-events-none disabled:opacity-40"
                    aria-label={`修复 ${projectName} 项目文件夹`}
                    aria-description={project.directoryUnavailableReason ?? undefined}
                    data-project-row-action="repair-project"
                    title={project.directoryUnavailableReason ?? "当前项目本地文件夹未找到，可以指定新的文件夹"}
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRepairProject(project);
                    }}
                  >
                    <Wrench className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
                  </button>
                ) : null}
                {onNewConversation ? (
                  <button
                    type="button"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sub hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`在 ${projectName} 中新建会话`}
                    aria-description={newConversationDisabledReason ?? undefined}
                    data-project-row-action="new-conversation"
                    title={newConversationDisabledReason ?? `在 ${projectName} 中新建会话`}
                    disabled={newConversationDisabledReason !== null}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (newConversationDisabledReason === null) {
                        onNewConversation(project.id);
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                ) : null}
                {onShowProjectInFolder || onRenameProject || onRemoveProject ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sub hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                        aria-label={`${projectName} 项目菜单`}
                        title={`${projectName} 项目菜单`}
                        data-project-row-action="project-menu"
                        disabled={disabled}
                      >
                        <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" aria-label={`${projectName} 项目操作`} className="min-w-48">
                      {onShowProjectInFolder ? (
                        <DropdownMenuItem onSelect={() => onShowProjectInFolder(project)}>
                          在文件管理器中显示
                        </DropdownMenuItem>
                      ) : null}
                      {onRenameProject ? (
                        <DropdownMenuItem onSelect={() => onRenameProject(project)}>
                          修改显示名称
                        </DropdownMenuItem>
                      ) : null}
                      {onRemoveProject ? <DropdownMenuSeparator /> : null}
                      {onRemoveProject ? (
                        <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => onRemoveProject(project)}>
                          移除项目
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>

              {expanded ? <div className="space-y-0.5" role="list" aria-label={`${projectName} 对话`}>
                {orderedSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    projectId={project.id}
                    session={session}
                    selected={session.id === selectedSessionId}
                    onSelectSession={onSelectSession}
                    disabled={disabled}
                  />
                ))}
              </div> : null}
            </section>
          );
        })}
      </nav>
    </aside>
  );
}

function SessionRow({
  projectId,
  session,
  selected,
  onSelectSession,
  disabled
}: {
  projectId: string;
  session: ConversationSidebarSession;
  selected: boolean;
  onSelectSession?: (sessionId: string, projectId: string) => void;
  disabled: boolean;
}): JSX.Element {
  const status = deriveStatusDot(session);
  const accessibleName = status === "none" ? session.title : `${session.title}，${statusLabel[status]}`;
  return (
    <button
      type="button"
      data-testid="conversation-sidebar-session"
      data-session-id={session.id}
      data-status-dot={status}
      className={cn(
        "grid h-8 w-full grid-cols-[minmax(0,1fr)_18px] items-center gap-1.5 rounded-md px-2 text-left text-sm hover:bg-hover",
        selected ? "bg-sel" : "bg-transparent"
      )}
      aria-current={selected ? "page" : undefined}
      aria-label={accessibleName}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onSelectSession?.(session.id, projectId);
        }
      }}
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-normal leading-4">{session.title}</span>
      </span>
      <StatusIcon status={status} />
    </button>
  );
}

function StatusIcon({ status }: { status: ConversationSessionStatus }): JSX.Element {
  if (status === "red") {
    return (
      <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-danger" />
      </span>
    );
  }

  if (status === "blue") {
    return (
      <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-accent" />
      </span>
    );
  }

  if (status === "blink") {
    return (
      <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-sub animate-breathe" />
      </span>
    );
  }

  return <span className="h-4 w-4" aria-hidden="true" />;
}
