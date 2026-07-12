import * as React from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Folder, Hand, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export type ConversationSessionStatus = "waiting" | "running" | "idle" | "completed";

export interface ConversationSidebarSession {
  id: string;
  title: string;
  status: ConversationSessionStatus;
  summary?: string;
}

export interface ConversationSidebarProject {
  id: string;
  path: string;
  label?: string;
  sessions: ConversationSidebarSession[];
}

export interface ConversationSidebarProps {
  projects: ConversationSidebarProject[];
  selectedSessionId?: string;
  onSelectSession?: (sessionId: string, projectId: string) => void;
  onCreateSession?: (projectId: string) => void;
  disabled?: boolean;
  showProjectPath?: boolean;
  className?: string;
}

const statusOrder: Record<ConversationSessionStatus, number> = {
  waiting: 0,
  running: 1,
  idle: 2,
  completed: 3
};

const statusLabel: Record<ConversationSessionStatus, string> = {
  waiting: "等你",
  running: "运行中",
  idle: "静止",
  completed: "已完成"
};

export function projectDirectoryName(project: Pick<ConversationSidebarProject, "path" | "label">): string {
  const trimmed = project.path.trim().replace(/[\\/]+$/u, "");
  const directory = trimmed.split(/[\\/]/u).filter(Boolean).at(-1);
  return directory || project.label || "未命名项目";
}

export function sortConversationSessions<T extends { status: ConversationSessionStatus }>(sessions: readonly T[]): T[] {
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((left, right) => {
      const byStatus = statusOrder[left.session.status] - statusOrder[right.session.status];
      return byStatus === 0 ? left.index - right.index : byStatus;
    })
    .map(({ session }) => session);
}

export function ConversationSidebar({
  projects,
  selectedSessionId,
  onSelectSession,
  onCreateSession,
  disabled = false,
  showProjectPath = true,
  className
}: ConversationSidebarProps): JSX.Element {
  const [openCompleted, setOpenCompleted] = React.useState<ReadonlySet<string>>(() => new Set());

  const toggleCompleted = (projectId: string) => {
    setOpenCompleted((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  return (
    <aside
      className={cn("flex w-[248px] flex-col bg-rail text-ink", className)}
      aria-label="项目和会话"
    >
      <nav className="scroll-thin min-h-0 flex-1 overflow-auto px-2 pb-2" aria-label="项目列表">
        {projects.map((project) => {
          const projectName = projectDirectoryName(project);
          const orderedSessions = sortConversationSessions(project.sessions);
          const activeSessions = orderedSessions.filter((session) => session.status !== "completed");
          const completedSessions = orderedSessions.filter((session) => session.status === "completed");
          const completedOpen = openCompleted.has(project.id);
          const completedPanelId = `${project.id}-completed-sessions`;

          return (
            <section key={project.id} className="mb-2" aria-label={`${projectName} 项目`}>
              <div className="mb-0.5 flex min-w-0 items-center gap-2 px-2 py-1.5">
                <Folder className="h-4 w-4 shrink-0 text-sub" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold leading-5">{projectName}</h2>
                  {showProjectPath ? <p className="truncate text-xs text-hint">{project.path}</p> : null}
                </div>
                {onCreateSession ? (
                  <button
                    type="button"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sub hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                    aria-label={`在 ${projectName} 中新建会话`}
                    disabled={disabled}
                    onClick={() => {
                      if (!disabled) {
                        onCreateSession(project.id);
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div className="space-y-0.5" role="list" aria-label={`${projectName} 活跃会话`}>
                {activeSessions.map((session) => (
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

              {completedSessions.length > 0 ? (
                <div className="mt-1">
                  <button
                    type="button"
                    className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs font-medium text-sub hover:bg-hover hover:text-ink"
                    aria-expanded={completedOpen}
                    aria-controls={completedPanelId}
                    onClick={() => toggleCompleted(project.id)}
                  >
                    {completedOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>已完成 ({completedSessions.length})</span>
                  </button>
                  {completedOpen ? (
                    <div id={completedPanelId} className="space-y-0.5" role="list" aria-label={`${projectName} 已完成会话`}>
                      {completedSessions.map((session) => (
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
                  ) : null}
                </div>
              ) : null}
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
  return (
    <button
      type="button"
      data-testid="conversation-sidebar-session"
      data-session-id={session.id}
      className={cn(
        "grid h-8 w-full grid-cols-[minmax(0,1fr)_18px] items-center gap-1.5 rounded-md px-2 text-left text-sm hover:bg-hover",
        selected ? "bg-sel" : "bg-transparent"
      )}
      aria-current={selected ? "page" : undefined}
      aria-label={`${session.title}，${statusLabel[session.status]}`}
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
      <StatusIcon status={session.status} />
    </button>
  );
}

function StatusIcon({ status }: { status: ConversationSessionStatus }): JSX.Element {
  if (status === "waiting") {
    return <Hand className="h-4 w-4 text-sub" aria-hidden="true" />;
  }

  if (status === "running") {
    return (
      <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-sub animate-breathe" />
      </span>
    );
  }

  if (status === "completed") {
    return <CheckCircle2 className="h-4 w-4 text-sub" aria-hidden="true" />;
  }

  return <Circle className="h-3.5 w-3.5 text-hint" aria-hidden="true" />;
}
