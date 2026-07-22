import type { TeamOwnership } from "../team-model.js";
import type { CreatedSession } from "./state-sync.js";

export interface ConversationAgentTeamIdentity {
  teamId: string;
  ownership: TeamOwnership;
}

export interface NewConversationDraftState {
  projectId: string | null;
  teamKey: string | null;
  draft: string;
  isSubmitting: boolean;
  error: string | null;
}

export type NewConversationDraftEvent =
  | { type: "open"; draft: NewConversationDraftState }
  | { type: "close" }
  | { type: "select-project"; projectId: string | null }
  | { type: "select-team"; teamKey: string | null }
  | { type: "edit-draft"; draft: string }
  | { type: "submit-started" }
  | { type: "submit-failed"; error: string };

export type SubmitNewConversationResult =
  | { created: false }
  | { created: true; sessionId: string; preferenceRecorded: true }
  | { created: true; sessionId: string; preferenceRecorded: false; preferenceError: unknown };

export function createNewConversationDraft(input: {
  projectId?: string;
  teamKey: string | null;
  draft: string;
}): NewConversationDraftState {
  return {
    projectId: input.projectId ?? null,
    teamKey: input.teamKey,
    draft: input.draft,
    isSubmitting: false,
    error: null,
  };
}

export function canSubmitNewConversation(state: NewConversationDraftState): boolean {
  return state.projectId !== null
    && state.teamKey !== null
    && state.draft.trim() !== ""
    && !state.isSubmitting;
}

export function reduceNewConversationDraft(
  state: NewConversationDraftState | null,
  event: NewConversationDraftEvent,
): NewConversationDraftState | null {
  if (event.type === "open") {
    return event.draft;
  }
  if (event.type === "close") {
    return null;
  }
  if (state === null) {
    return null;
  }

  switch (event.type) {
    case "select-project":
      return { ...state, projectId: event.projectId, error: null };
    case "select-team":
      return { ...state, teamKey: event.teamKey, error: null };
    case "edit-draft":
      return { ...state, draft: event.draft, error: null };
    case "submit-started":
      return { ...state, isSubmitting: true, error: null };
    case "submit-failed":
      return { ...state, isSubmitting: false, error: event.error };
  }
}

export async function submitNewConversation(input: {
  projectId: string;
  initialMessage: string;
  team: ConversationAgentTeamIdentity;
  createSessionWithFirstMessage(
    projectId: string,
    initialMessage: string,
    team: ConversationAgentTeamIdentity,
  ): Promise<CreatedSession | null>;
  recordSuccessfulTeam(request: ConversationAgentTeamIdentity & { sessionId: string }): Promise<unknown>;
}): Promise<SubmitNewConversationResult> {
  const session = await input.createSessionWithFirstMessage(input.projectId, input.initialMessage, input.team);
  if (session === null) {
    return { created: false };
  }

  try {
    await input.recordSuccessfulTeam({ sessionId: session.sessionId, ...input.team });
    return { created: true, sessionId: session.sessionId, preferenceRecorded: true };
  } catch (preferenceError) {
    return { created: true, sessionId: session.sessionId, preferenceRecorded: false, preferenceError };
  }
}
