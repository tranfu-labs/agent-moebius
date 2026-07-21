import type { TeamOwnership } from "../team-model.js";
import type { CreatedSession } from "./state-sync.js";

export interface ConversationAgentTeamIdentity {
  teamId: string;
  ownership: TeamOwnership;
}

export type CreateConversationAndRecordResult =
  | { created: false }
  | { created: true; preferenceRecorded: true }
  | { created: true; preferenceRecorded: false; preferenceError: unknown };

export async function createConversationAndRecordTeam(input: {
  projectId: string;
  team: ConversationAgentTeamIdentity;
  createSession(projectId: string, team: ConversationAgentTeamIdentity): Promise<CreatedSession | null>;
  recordSuccessfulTeam(request: ConversationAgentTeamIdentity & { sessionId: string }): Promise<unknown>;
}): Promise<CreateConversationAndRecordResult> {
  const session = await input.createSession(input.projectId, input.team);
  if (session === null) {
    return { created: false };
  }

  try {
    await input.recordSuccessfulTeam({ sessionId: session.sessionId, ...input.team });
    return { created: true, preferenceRecorded: true };
  } catch (preferenceError) {
    return { created: true, preferenceRecorded: false, preferenceError };
  }
}
