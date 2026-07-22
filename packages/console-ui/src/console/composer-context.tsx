import { ChevronDown, FolderOpen, GitBranch, Laptop } from "lucide-react";
import { useState } from "react";

import type { OperatorAgentTeam } from "@/console/agent-teams-page";
import type { OperatorProject, OperatorSession } from "@/console/operator-console";
import { SessionTeamMenu } from "@/console/session-team-menu";
import { Button } from "@/ui/button";
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
  teams: readonly OperatorAgentTeam[];
  canChangeProject: boolean;
  disabled: boolean;
  onChangeSessionProject?: (sessionId: string, projectId: string) => void;
  onChangeSessionWorkspace?: (sessionId: string, workspaceMode: WorkspaceMode) => void;
  onChangeSessionTeam?: (sessionId: string, team: OperatorAgentTeam) => void;
}): JSX.Element {
  const [workspaceConfirmation, setWorkspaceConfirmation] = useState<WorkspaceMode | null>(null);
  const effectiveMode = selectedSession?.workspaceMode ?? "direct";
  const displayedMode = selectedSession?.workspacePendingMode ?? effectiveMode;
  const workspaceLabel = workspaceModeLabel(displayedMode);
  const branchName = selectedSession?.branchName ?? project.branchName ?? "—";
  const independentUnavailable = selectedSession?.workspaceUnavailableReason === "not-git-repository";
  const pendingDescriptions = [
    selectedSession?.workspacePendingMode === null || selectedSession?.workspacePendingMode === undefined
      ? null
      : `当前这一步跑完后换成${workspaceModeLabel(selectedSession.workspacePendingMode)}`,
    pendingAgentTeam === undefined
      ? null
      : `当前这一步跑完后换成${pendingAgentTeam.name?.trim() || "未命名团队"}`,
  ].filter((entry): entry is string => entry !== null);

  return (
    <div className="min-w-0 text-xs text-sub">
      <div className="flex min-w-0 items-center gap-3">
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

        {selectedSession && onChangeSessionWorkspace ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-hover hover:text-ink"
                aria-label={`工作空间：${workspaceLabel}，点击切换`}
                disabled={disabled}
              >
                <Laptop className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                {workspaceLabel}
                <ChevronDown className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-72">
              <DropdownMenuCheckboxItem
                checked={displayedMode === "direct"}
                onSelect={() => displayedMode !== "direct" && setWorkspaceConfirmation("direct")}
              >
                <span className="grid gap-0.5">
                  <span>默认工作空间</span>
                  <span className="text-xs font-normal text-sub">直接改项目文件夹里的文件</span>
                </span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={displayedMode === "worktree"}
                disabled={independentUnavailable}
                onSelect={() => displayedMode !== "worktree" && setWorkspaceConfirmation("worktree")}
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
          <span className="inline-flex items-center gap-1.5">
            <Laptop className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            {workspaceLabel}
          </span>
        )}

        <span className="inline-flex min-w-0 items-center gap-1.5" aria-label={`分支：${branchName}`}>
          <GitBranch className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span className="truncate">{branchName}</span>
        </span>

        <SessionTeamMenu
          team={agentTeam}
          pendingTeam={pendingAgentTeam}
          teams={teams}
          disabled={disabled}
          onSelectTeam={selectedSession && onChangeSessionTeam
            ? (team) => onChangeSessionTeam(selectedSession.sessionId, team)
            : undefined}
        />
      </div>

      {pendingDescriptions.length > 0 ? (
        <p className="mt-1 pl-1 text-[11px] leading-4 text-sub" role="status">
          {pendingDescriptions.join("；")}
        </p>
      ) : null}

      {workspaceConfirmation !== null && selectedSession ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/20 p-6">
          <section
            className="w-full max-w-md rounded-xl border border-line bg-canvas p-5 text-ink shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-label={workspaceConfirmation === "worktree" ? "换成独立工作空间" : "换回默认工作空间"}
          >
            <h2 className="text-base font-semibold">
              {workspaceConfirmation === "worktree" ? "换成独立工作空间" : "换回默认工作空间"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-sub">
              {workspaceConfirmation === "worktree"
                ? "副本基于项目当前所在的提交，不包含你还没提交的改动；此前已经在项目文件夹里产生的改动也不会被搬过去。"
                : "之后的改动会直接落在项目文件夹里。"}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setWorkspaceConfirmation(null)}>
                取消
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onChangeSessionWorkspace?.(selectedSession.sessionId, workspaceConfirmation);
                  setWorkspaceConfirmation(null);
                }}
              >
                {workspaceConfirmation === "worktree" ? "换过去" : "换回去"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function workspaceModeLabel(mode: WorkspaceMode): string {
  return mode === "worktree" ? "独立工作空间" : "默认工作空间";
}
