import type {
  LocalConsoleAgentTeamHealth,
  LocalConsoleContinuationStatus,
} from "./types.js";

export function resolveLocalSessionContinuation(input: {
  projectDirectoryAvailable: boolean;
  agentTeamHealth: LocalConsoleAgentTeamHealth | null | undefined;
  agentTeamHealthReason?: string | null;
}): LocalConsoleContinuationStatus {
  if (!input.projectDirectoryAvailable) {
    return {
      canContinue: false,
      kind: "project-unavailable",
      reason: "项目文件夹找不到了，修复后才能继续。",
      recoveryAction: "repair-project",
    };
  }
  if (input.agentTeamHealth === "deleted") {
    return {
      canContinue: false,
      kind: "team-deleted",
      reason: "这支团队已经被删除，改选一支团队后可以继续。",
      recoveryAction: "select-team",
    };
  }
  if (input.agentTeamHealth === "needs-repair") {
    return {
      canContinue: false,
      kind: "team-needs-repair",
      reason: "这支团队需要修复，修复或改选后可以继续。",
      recoveryAction: "repair-or-select-team",
    };
  }
  return { canContinue: true, kind: "available", reason: null, recoveryAction: null };
}

export function nonContinuableSystemMessage(status: LocalConsoleContinuationStatus): string | null {
  if (status.canContinue) {
    return null;
  }
  return status.reason;
}
