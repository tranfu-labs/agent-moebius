import type { LocalConsoleWorkspaceMode } from "./types.js";

export interface SessionWorkspaceRow {
  workspaceMode: LocalConsoleWorkspaceMode;
  workspacePendingMode: LocalConsoleWorkspaceMode | null;
}

export interface ProjectWorkspaceRow {
  isGitRepository: boolean;
}

export interface ResolvedSessionWorkspaceContext {
  workspaceMode: LocalConsoleWorkspaceMode;
  workspacePendingMode: LocalConsoleWorkspaceMode | null;
  independentWorkspaceAvailable: boolean;
  independentWorkspaceUnavailableReason: string | null;
}

export function resolveSessionWorkspaceContext(
  session: SessionWorkspaceRow,
  project: ProjectWorkspaceRow,
): ResolvedSessionWorkspaceContext {
  return {
    workspaceMode: session.workspaceMode,
    workspacePendingMode: null,
    independentWorkspaceAvailable: project.isGitRepository,
    independentWorkspaceUnavailableReason: project.isGitRepository ? null : "not-git-repository",
  };
}
