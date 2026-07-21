import fs from "node:fs/promises";
import path from "node:path";

import type { LocalConsoleAgentFile } from "../../src/local-console/runtime.js";
import type { LocalConsoleSessionSummary } from "../../src/local-console/types.js";
import { resolveRecordedTeamLocation } from "./team-record-store.js";
import { readTeamSnapshot, resolveTeamLocation } from "./team-store.js";

export class AgentTeamRosterUnavailableError extends Error {
  readonly code = "AGENT_TEAM_ROSTER_UNAVAILABLE";

  constructor(teamId: string) {
    super(`当前会话绑定的 Agent 团队“${teamId}”需要修复，暂时无法解析可用 Agent。`);
    this.name = "AgentTeamRosterUnavailableError";
  }
}

export async function listSessionAgentFiles(input: {
  dataRoot: string;
  session: LocalConsoleSessionSummary;
}): Promise<LocalConsoleAgentFile[]> {
  if (input.session.agentTeamOwnership == null || input.session.agentTeamId == null) {
    return listSharedAgentFiles(path.join(input.dataRoot, "agents"));
  }
  const snapshot = await readBoundTeamSnapshot(input.dataRoot, input.session);
  if (snapshot.status !== "usable") {
    throw new AgentTeamRosterUnavailableError(input.session.agentTeamId);
  }
  return snapshot.members
    .map((member) => ({ name: member.slug, path: member.agentFile }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function resolveSessionAgentTeamHealth(input: {
  dataRoot: string;
  session: LocalConsoleSessionSummary;
}): Promise<{ health: "usable" | "needs-repair"; reason: string | null } | null> {
  if (input.session.agentTeamOwnership == null || input.session.agentTeamId == null) {
    return null;
  }
  const snapshot = await readBoundTeamSnapshot(input.dataRoot, input.session);
  return snapshot.status === "usable"
    ? { health: "usable", reason: null }
    : {
        health: "needs-repair",
        reason: snapshot.issues[0]?.message ?? `Agent 团队“${input.session.agentTeamId}”需要修复。`,
      };
}

async function readBoundTeamSnapshot(dataRoot: string, session: LocalConsoleSessionSummary) {
  const teamId = session.agentTeamId;
  const ownership = session.agentTeamOwnership;
  if (teamId == null || ownership == null) {
    throw new Error("Session has no Agent team binding");
  }
  const location = ownership === "system"
    ? resolveTeamLocation({ dataRoot, teamId, ownership: "system" })
    : await resolveRecordedTeamLocation(dataRoot, teamId);
  return readTeamSnapshot(location);
}

async function listSharedAgentFiles(directory: string): Promise<LocalConsoleAgentFile[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => ({ name: path.basename(entry.name, ".md"), path: path.join(directory, entry.name) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
