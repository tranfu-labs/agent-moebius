export const ONBOARDING_IPC_CHANNELS = {
  status: "onboarding:get-status",
  complete: "onboarding:complete",
  checkCodex: "onboarding:check-codex",
  copyInstallCommand: "onboarding:copy-install-command",
  teamBuilderState: "onboarding:team-builder:state",
  teamBuilderStart: "onboarding:team-builder:start",
  teamBuilderSubmit: "onboarding:team-builder:submit",
  teamBuilderAdjust: "onboarding:team-builder:adjust",
  teamBuilderRetry: "onboarding:team-builder:retry",
  teamBuilderCommit: "onboarding:team-builder:commit",
} as const;
