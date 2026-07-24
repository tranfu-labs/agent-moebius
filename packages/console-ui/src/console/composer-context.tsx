import { ChevronDown, FolderOpen, GitBranch, Laptop } from "lucide-react";
import { useEffect, useState } from "react";

import type { OperatorAgentTeam } from "@/console/agent-teams-page";
import type { OperatorProject, OperatorSession } from "@/console/operator-console";
import { SessionTeamMenu } from "@/console/session-team-menu";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

type WorkspaceMode = "direct" | "worktree";

export function ComposerContext({
  project,
  projects,
  selectedSession,
  agentTeam,
  pendingAgentTeam,
  missingAgentTeamId,
  agentTeamHealth,
  teams,
  canChangeProject,
  disabled,
  onChangeSessionProject,
  onChangeSessionWorkspace,
  onChangeSessionTeam,
}: {
  project: OperatorProject;
  projects: OperatorProject[];
  selectedSession: OperatorSession | null;
  agentTeam?: OperatorAgentTeam;
  pendingAgentTeam?: OperatorAgentTeam;
  missingAgentTeamId?: string | null;
  agentTeamHealth?: "usable" | "deleted" | "needs-repair" | null;
  teams: readonly OperatorAgentTeam[];
  canChangeProject: boolean;
  disabled: boolean;
  onChangeSessionProject?: (sessionId: string, projectId: string) => void;
  onChangeSessionWorkspace?: (sessionId: string, workspaceMode: WorkspaceMode) => void;
  onChangeSessionTeam?: (sessionId: string, team: OperatorAgentTeam) => void;
}): JSX.Element {
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === "undefined" ? 1440 : window.innerWidth);
  const visible = visibleComposerContextEntries(viewportWidth);
  const effectiveMode = selectedSession?.workspaceMode ?? "direct";
  const workspaceLabel = workspaceModeLabel(effectiveMode);
  const branchName = selectedSession?.branchName ?? project.branchName ?? "—";
  const independentUnavailable = selectedSession?.workspaceUnavailableReason === "not-git-repository";
  const pendingDescription = pendingAgentTeam === undefined
    ? null
    : `当前这一步跑完后换成${pendingAgentTeam.name?.trim() || "未命名团队"}`;

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  return (
    <div className="min-w-0 text-xs text-sub">
      <div className="flex min-w-0 items-center gap-1.5">
        {visible.project ? <span className="contents" data-context-entry="project">{canChangeProject && selectedSession && onChangeSessionProject ? (
          disabled ? (
            <button
              type="button"
              className={cn(COMPOSER_CHIP_CLASS, "opacity-40")}
              aria-label={`项目：${project.title}，点击切换`}
              disabled
            >
              <FolderOpen className="h-[13px] w-[13px] shrink-0 text-sub" strokeWidth={1.5} aria-hidden="true" />
              <span className="truncate">{project.title}</span>
              <ChevronDown className="h-[11px] w-[11px] shrink-0 text-hint" strokeWidth={1.5} aria-hidden="true" />
            </button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={COMPOSER_CHIP_CLASS}
                  aria-label={`项目：${project.title}，点击切换`}
                >
                  <FolderOpen className="h-[13px] w-[13px] shrink-0 text-sub" strokeWidth={1.5} aria-hidden="true" />
                  <span className="truncate">{project.title}</span>
                  <ChevronDown className="h-[11px] w-[11px] shrink-0 text-hint" strokeWidth={1.5} aria-hidden="true" />
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
          <span className={COMPOSER_LOCKED_CLASS} aria-label={`项目：${project.title}，已锁定`}>
            <FolderOpen className="h-[13px] w-[13px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span className="truncate">{project.title}</span>
          </span>
        )}</span> : null}

        {visible.workspace ? <span className="contents" data-context-entry="workspace">{selectedSession && onChangeSessionWorkspace ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={COMPOSER_CHIP_CLASS}
                aria-label={`工作空间：${workspaceLabel}，点击切换`}
                disabled={disabled}
              >
                <Laptop className="h-[13px] w-[13px] shrink-0 text-sub" strokeWidth={1.5} aria-hidden="true" />
                {workspaceLabel}
                <ChevronDown className="h-[11px] w-[11px] shrink-0 text-hint" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-72">
              <DropdownMenuCheckboxItem
                checked={effectiveMode === "direct"}
                onSelect={() => effectiveMode !== "direct" && onChangeSessionWorkspace(selectedSession.sessionId, "direct")}
              >
                <span className="grid gap-0.5">
                  <span>默认工作空间</span>
                  <span className="text-xs font-normal text-sub">直接改项目文件夹里的文件</span>
                </span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={effectiveMode === "worktree"}
                disabled={independentUnavailable}
                onSelect={() => effectiveMode !== "worktree" && onChangeSessionWorkspace(selectedSession.sessionId, "worktree")}
              >
                <span className="grid gap-0.5">
                  <span>独立工作空间</span>
                  <span className="text-xs font-normal text-sub">
                    {independentUnavailable
                      ? "这个项目文件夹不是 git 仓库，无法隔离改动"
                      : "把改动隔离在一份副本里"}
                  </span>
                </span>
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className={COMPOSER_LOCKED_CLASS} aria-label={`工作空间：${workspaceLabel}，已锁定`}>
            <Laptop className="h-[13px] w-[13px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {workspaceLabel}
          </span>
        )}</span> : null}

        {visible.branch ? <span className={COMPOSER_LOCKED_CLASS} aria-label={`分支：${branchName}`} data-context-entry="branch">
          <GitBranch className="h-[13px] w-[13px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span className="truncate font-mono text-[11.5px]">{branchName}</span>
        </span> : null}

        {visible.team ? <span className="contents" data-context-entry="team"><SessionTeamMenu
          team={agentTeam}
          pendingTeam={pendingAgentTeam}
          missingTeamId={missingAgentTeamId}
          health={agentTeamHealth}
          teams={teams}
          disabled={disabled}
          onSelectTeam={selectedSession && onChangeSessionTeam
            ? (team) => onChangeSessionTeam(selectedSession.sessionId, team)
            : undefined}
        /></span> : null}
      </div>

      {pendingDescription !== null ? (
        <p className="mt-1 pl-1 text-[11px] leading-4 text-sub" role="status">
          {pendingDescription}
        </p>
      ) : null}
    </div>
  );
}

/* 可点 chip：h28 r12 描边（moebius-desktop-spec .chip）；锁定项退化为纯文本 */
const COMPOSER_CHIP_CLASS =
  "inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-ink transition-colors hover:bg-hover";
const COMPOSER_LOCKED_CLASS =
  "inline-flex min-w-0 items-center gap-1.5 px-1 py-1 text-sub";

function workspaceModeLabel(mode: WorkspaceMode): string {
  return mode === "worktree" ? "独立工作空间" : "默认工作空间";
}

export function visibleComposerContextEntries(width: number): {
  branch: boolean;
  workspace: boolean;
  team: boolean;
  project: boolean;
} {
  return {
    branch: width >= 1_000,
    workspace: width >= 760,
    team: width >= 560,
    project: width >= 420,
  };
}
