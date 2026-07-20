import type { TeamDefinition, TeamOwnership, TeamRepairIssueCode, TeamStatus } from "./team-model.js";
import {
  listTeamLocations,
  readTeamSnapshot,
  resolveTeamLocation,
  setTeamPrimaryAgent,
  writeMemberAgentMarkdown,
  type TeamMemberSnapshot,
  type TeamSnapshot,
} from "./team-store.js";

export const TEAM_IPC_CHANNELS = {
  list: "agent-teams:list",
  readMember: "agent-teams:read-member",
  writeMember: "agent-teams:write-member",
  setPrimaryAgent: "agent-teams:set-primary-agent",
} as const;

export interface AgentTeamMemberSummary {
  slug: string;
  displayName: string;
  description: string;
}

export interface AgentTeamListItem {
  id: string;
  ownership: TeamOwnership;
  definition: TeamDefinition | null;
  members: AgentTeamMemberSummary[];
  status: TeamStatus;
  canCreateConversation: boolean;
  issues: Array<{ code: TeamRepairIssueCode; slug?: string }>;
}

export type AgentTeamListResponse =
  | { status: "loading" }
  | { status: "ready"; teams: AgentTeamListItem[] }
  | { status: "configuration-error" };

export interface AgentTeamMemberRequest {
  teamId: string;
  ownership: TeamOwnership;
  memberSlug: string;
}

export interface AgentTeamMemberWriteRequest extends AgentTeamMemberRequest {
  agentMarkdown: string;
}

export interface AgentTeamPrimaryAgentWriteRequest {
  teamId: string;
  ownership: TeamOwnership;
  primaryAgentSlug: string;
}

export interface AgentTeamMemberDocument extends AgentTeamMemberSummary {
  agentMarkdown: string;
}

export async function listAgentTeams(input: {
  dataRoot: string;
  seedPending: boolean;
}): Promise<AgentTeamListResponse> {
  if (input.seedPending) {
    return { status: "loading" };
  }

  const locations = await listTeamLocations(input.dataRoot);
  const snapshots = await Promise.all(locations.map((location) => readTeamSnapshot(location)));
  const hasReadableBuiltInTeam = snapshots.some(
    (snapshot) => snapshot.location.ownership === "system" && snapshot.status === "usable",
  );

  if (!hasReadableBuiltInTeam) {
    return { status: "configuration-error" };
  }

  return {
    status: "ready",
    teams: snapshots.map(toListItem),
  };
}

export async function readAgentTeamMember(dataRoot: string, rawRequest: unknown): Promise<AgentTeamMemberDocument> {
  const request = parseMemberRequest(rawRequest);
  const location = resolveTeamLocation({
    dataRoot,
    teamId: request.teamId,
    ownership: request.ownership,
  });
  const snapshot = await readTeamSnapshot(location);
  return toMemberDocument(findMember(snapshot, request.memberSlug));
}

export async function writeAgentTeamMember(dataRoot: string, rawRequest: unknown): Promise<AgentTeamMemberDocument> {
  const request = parseMemberWriteRequest(rawRequest);
  const location = resolveTeamLocation({
    dataRoot,
    teamId: request.teamId,
    ownership: request.ownership,
  });

  // The store remains the single authority for built-in ownership and write rejection.
  await writeMemberAgentMarkdown(location, request.memberSlug, request.agentMarkdown);
  const snapshot = await readTeamSnapshot(location);
  return toMemberDocument(findMember(snapshot, request.memberSlug));
}

export async function setAgentTeamPrimaryAgent(
  dataRoot: string,
  rawRequest: unknown,
): Promise<AgentTeamListItem> {
  const request = parsePrimaryAgentWriteRequest(rawRequest);
  const location = resolveTeamLocation({
    dataRoot,
    teamId: request.teamId,
    ownership: request.ownership,
  });

  // The store validates both write ownership and membership validity.
  return toListItem(await setTeamPrimaryAgent(location, request.primaryAgentSlug));
}

function toListItem(snapshot: TeamSnapshot): AgentTeamListItem {
  return {
    id: snapshot.location.id,
    ownership: snapshot.location.ownership,
    definition: snapshot.definition,
    members: snapshot.members.map(({ slug, displayName, description }) => ({ slug, displayName, description })),
    status: snapshot.status,
    canCreateConversation: snapshot.canCreateConversation,
    issues: snapshot.issues.map(({ code, slug }) => ({ code, ...(slug === undefined ? {} : { slug }) })),
  };
}

function toMemberDocument(member: TeamMemberSnapshot): AgentTeamMemberDocument {
  return {
    slug: member.slug,
    displayName: member.displayName,
    description: member.description,
    agentMarkdown: member.agentMarkdown,
  };
}

function findMember(snapshot: TeamSnapshot, memberSlug: string): TeamMemberSnapshot {
  const member = snapshot.members.find((candidate) => candidate.slug === memberSlug);
  if (member === undefined) {
    throw new AgentTeamIpcRequestError("The requested Agent is not available in this team.");
  }
  return member;
}

function parseMemberRequest(value: unknown): AgentTeamMemberRequest {
  if (!isPlainObject(value)) {
    throw new AgentTeamIpcRequestError("A team member request is required.");
  }
  if (typeof value.teamId !== "string" || value.teamId.trim().length === 0) {
    throw new AgentTeamIpcRequestError("A team id is required.");
  }
  if (value.ownership !== "system" && value.ownership !== "user") {
    throw new AgentTeamIpcRequestError("A valid team ownership is required.");
  }
  if (typeof value.memberSlug !== "string" || value.memberSlug.trim().length === 0) {
    throw new AgentTeamIpcRequestError("An Agent slug is required.");
  }
  return {
    teamId: value.teamId,
    ownership: value.ownership,
    memberSlug: value.memberSlug,
  };
}

function parseMemberWriteRequest(value: unknown): AgentTeamMemberWriteRequest {
  const request = parseMemberRequest(value);
  if (!isPlainObject(value) || typeof value.agentMarkdown !== "string") {
    throw new AgentTeamIpcRequestError("AGENT.md content is required.");
  }
  return { ...request, agentMarkdown: value.agentMarkdown };
}

function parsePrimaryAgentWriteRequest(value: unknown): AgentTeamPrimaryAgentWriteRequest {
  if (!isPlainObject(value)) {
    throw new AgentTeamIpcRequestError("A primary Agent request is required.");
  }
  if (typeof value.teamId !== "string" || value.teamId.trim().length === 0) {
    throw new AgentTeamIpcRequestError("A team id is required.");
  }
  if (value.ownership !== "system" && value.ownership !== "user") {
    throw new AgentTeamIpcRequestError("A valid team ownership is required.");
  }
  if (typeof value.primaryAgentSlug !== "string" || value.primaryAgentSlug.trim().length === 0) {
    throw new AgentTeamIpcRequestError("A primary Agent slug is required.");
  }
  return {
    teamId: value.teamId,
    ownership: value.ownership,
    primaryAgentSlug: value.primaryAgentSlug,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class AgentTeamIpcRequestError extends Error {
  readonly code = "AGENT_TEAM_IPC_REQUEST_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "AgentTeamIpcRequestError";
  }
}
