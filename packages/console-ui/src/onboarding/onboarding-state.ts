import type { OperatorAgentTeam } from "@/console/agent-teams-page";

export type OnboardingStep = 1 | 2 | 3 | 4;

export interface OnboardingShellState {
  step: OnboardingStep;
  environmentPassed: boolean;
  selectedTeamKey: string | null;
  teamBuilderOpen: boolean;
  relayRun: number;
}

export type OnboardingShellAction =
  | { type: "environment-passed" }
  | { type: "next" }
  | { type: "back" }
  | { type: "select-team"; teamKey: string }
  | { type: "open-team-builder" }
  | { type: "close-team-builder" }
  | { type: "replay-relay" };

export function createOnboardingShellState(
  environmentPassed = false,
): OnboardingShellState {
  return {
    step: 1,
    environmentPassed,
    selectedTeamKey: null,
    teamBuilderOpen: false,
    relayRun: 0,
  };
}

export function reduceOnboardingShell(
  state: OnboardingShellState,
  action: OnboardingShellAction,
): OnboardingShellState {
  switch (action.type) {
    case "environment-passed":
      return state.environmentPassed ? state : { ...state, environmentPassed: true };
    case "next":
      if (state.teamBuilderOpen || state.step === 4) {
        return state;
      }
      return {
        ...state,
        step: (state.step + 1) as OnboardingStep,
        relayRun: state.step === 2 ? state.relayRun + 1 : state.relayRun,
      };
    case "back":
      if (state.teamBuilderOpen || state.step === 1) {
        return state;
      }
      return {
        ...state,
        step: (state.step - 1) as OnboardingStep,
        relayRun: state.step === 4 ? state.relayRun + 1 : state.relayRun,
      };
    case "select-team":
      return { ...state, selectedTeamKey: action.teamKey };
    case "open-team-builder":
      return { ...state, teamBuilderOpen: true };
    case "close-team-builder":
      return { ...state, teamBuilderOpen: false };
    case "replay-relay":
      return { ...state, relayRun: state.relayRun + 1 };
  }
}

export function resolveDefaultOnboardingTeamKey(
  teams: readonly OperatorAgentTeam[],
): string | null {
  const builtIn = teams.filter((team) =>
    team.ownership === "system" && team.canCreateConversation);
  return builtIn.find((team) => team.id === "development")?.teamKey
    ?? builtIn[0]?.teamKey
    ?? null;
}
