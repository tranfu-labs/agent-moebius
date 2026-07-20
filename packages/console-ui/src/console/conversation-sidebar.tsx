import * as React from "react";
import { Folder, MoreHorizontal, Plus } from "lucide-react";

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

export function ConversationSidebar({
  projects,
  selectedSessionId,
  onSelectSession,
  onNewConversation,
  onShowProjectInFolder,
  onRenameProject,
  onRemoveProject,
  disabled = false,
  disabledReason,
  showProjectPath = true,
  className
}: ConversationSidebarProps): JSX.Element {
  return (
    <aside
      className={cn("flex w-[248px] flex-col bg-rail text-ink", className)}
      aria-label="项目和会话"
    >
      <nav className="scroll-thin min-h-0 flex-1 overflow-auto px-2 pb-2" aria-label="项目列表">
        {projects.map((project) => {
          const projectName = projectDirectoryName(project);
          const orderedSessions = orderSessionsByCreatedAt(project.sessions);
          const newConversationDisabledReason = project.newConversationDisabledReason
            ?? (disabled ? disabledReason ?? "项目正在变更，请稍后再试" : null);

          return (
            <section key={project.id} className="mb-2" aria-label={`${projectName} 项目`}>
              <div className="mb-0.5 flex min-w-0 items-center gap-2 px-2 py-1.5">
                <Folder className="h-4 w-4 shrink-0 text-sub" strokeWidth={1.5} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold leading-5">{projectName}</h2>
                  {showProjectPath ? <p className="truncate text-xs text-hint">{project.path}</p> : null}
                </div>
                {onNewConversation ? (
                  <button
                    type="button"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sub hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`在 ${projectName} 中新建会话`}
                    aria-description={newConversationDisabledReason ?? undefined}
                    title={newConversationDisabledReason ?? `在 ${projectName} 中新建会话`}
                    disabled={newConversationDisabledReason !== null}
                    onClick={() => {
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

              <div className="space-y-0.5" role="list" aria-label={`${projectName} 对话`}>
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
              </div>
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
