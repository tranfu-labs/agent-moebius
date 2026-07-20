import type { AgentTeamListItem } from "../team-ipc.js";

export interface AgentTeamSelection {
  teamKey: string;
  memberSlug: string | null;
}

export function getAgentTeamKey(team: Pick<AgentTeamListItem, "id" | "ownership">): string {
  return `${team.ownership}:${team.id}`;
}

export function reconcileAgentTeamSelection(
  teams: readonly AgentTeamListItem[],
  current: AgentTeamSelection | null,
): AgentTeamSelection | null {
  const currentTeam = current === null
    ? undefined
    : teams.find((team) => getAgentTeamKey(team) === current.teamKey);
  const team = currentTeam ?? teams[0];
  if (team === undefined) {
    return null;
  }

  const memberSlugs = new Set(team.members.map((member) => member.slug));
  const canKeepMember = currentTeam !== undefined
    && current?.memberSlug !== null
    && current?.memberSlug !== undefined
    && memberSlugs.has(current.memberSlug);
  const preferredMemberSlug = team.definition?.primaryAgentSlug;
  const memberSlug = canKeepMember
    ? current.memberSlug
    : preferredMemberSlug !== null && preferredMemberSlug !== undefined && memberSlugs.has(preferredMemberSlug)
      ? preferredMemberSlug
      : team.members[0]?.slug ?? null;

  return {
    teamKey: getAgentTeamKey(team),
    memberSlug,
  };
}
