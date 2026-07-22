import { ChevronDown, Diamond, FolderOpen, GitBranch, Laptop, Plus } from "lucide-react";

import { RoleComposer } from "@/console/role-composer";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

export interface NewConversationProjectOption {
  projectId: string;
  title: string;
  available: boolean;
  workspaceLabel: string;
  branchLabel: string;
}

export interface NewConversationTeamOption {
  teamKey: string;
  label: string;
}

export interface NewConversationPageProps {
  projects: NewConversationProjectOption[];
  teams: NewConversationTeamOption[];
  selectedProjectId: string | null;
  selectedTeamKey: string | null;
  draft: string;
  isSubmitting?: boolean;
  isProjectMutationPending?: boolean;
  error?: string | null;
  onSelectProject(projectId: string): void;
  onAddProject(): void;
  onSelectTeam(teamKey: string): void;
  onDraftChange(value: string): void;
  onSubmit(): void;
  className?: string;
}

export function NewConversationPage({
  projects,
  teams,
  selectedProjectId,
  selectedTeamKey,
  draft,
  isSubmitting = false,
  isProjectMutationPending = false,
  error,
  onSelectProject,
  onAddProject,
  onSelectTeam,
  onDraftChange,
  onSubmit,
  className,
}: NewConversationPageProps): JSX.Element {
  const selectedProject = projects.find((project) => project.projectId === selectedProjectId && project.available);
  const hasAvailableProjects = projects.some((project) => project.available);
  const canSubmit = selectedProject !== undefined
    && selectedTeamKey !== null
    && draft.trim() !== ""
    && !isSubmitting
    && !isProjectMutationPending;
  const disabledReason = selectedProject === undefined
    ? hasAvailableProjects
      ? "选择一个项目后才能发送"
      : "还没有项目，从上面的项目按钮添加一个"
    : selectedTeamKey === null
      ? "选择一支可用的 Agent 团队后才能发送"
      : undefined;

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col", className)} aria-label="新建对话">
      <header className="window-drag-region shrink-0 px-8 pb-3 pt-12">
        <h1 className="mx-auto max-w-[760px] truncate text-base font-semibold text-ink" title="新对话">新对话</h1>
      </header>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-auto px-6 pb-6">
        <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center py-8">
          <p className="mb-8 text-center text-lg font-medium text-ink">描述你的目标，团队会开始推进</p>
          <RoleComposer
            value={draft}
            onValueChange={onDraftChange}
            onSubmit={onSubmit}
            disabled={isSubmitting}
            submitDisabled={!canSubmit}
            placeholder="描述你的目标…"
            statusText={disabledReason}
            context={(
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-sub">
                <ProjectMenu
                  projects={projects}
                  selectedProject={selectedProject}
                  disabled={isSubmitting || isProjectMutationPending}
                  onSelectProject={onSelectProject}
                  onAddProject={onAddProject}
                />
                {selectedProject ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 px-1.5 py-1">
                      <Laptop className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                      {selectedProject.workspaceLabel}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-1.5 py-1">
                      <GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                      {selectedProject.branchLabel}
                    </span>
                  </>
                ) : null}
                <label className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-hover hover:text-ink">
                  <Diamond className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  <span className="sr-only">Agent 团队</span>
                  <select
                    className="min-w-0 max-w-48 bg-transparent text-xs text-inherit outline-none"
                    aria-label="Agent 团队"
                    value={selectedTeamKey ?? ""}
                    disabled={isSubmitting || teams.length === 0}
                    onChange={(event) => onSelectTeam(event.currentTarget.value)}
                  >
                    {teams.length === 0 ? <option value="">没有可用团队</option> : null}
                    {teams.map((team) => <option key={team.teamKey} value={team.teamKey}>{team.label}</option>)}
                  </select>
                </label>
              </div>
            )}
          />
          {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}

function ProjectMenu({
  projects,
  selectedProject,
  disabled,
  onSelectProject,
  onAddProject,
}: {
  projects: NewConversationProjectOption[];
  selectedProject?: NewConversationProjectOption;
  disabled: boolean;
  onSelectProject(projectId: string): void;
  onAddProject(): void;
}): JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-hover hover:text-ink disabled:opacity-50"
          aria-label={selectedProject ? `项目：${selectedProject.title}，点击切换` : "项目：未选择，点击选择"}
          disabled={disabled}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span className="max-w-48 truncate">{selectedProject?.title ?? "选择项目"}</span>
          <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="min-w-52">
        {projects.filter((project) => project.available).map((project) => (
          <DropdownMenuCheckboxItem
            key={project.projectId}
            checked={project.projectId === selectedProject?.projectId}
            onSelect={() => onSelectProject(project.projectId)}
          >
            {project.title}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAddProject}>
          <Plus className="mr-2 h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          添加项目…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
