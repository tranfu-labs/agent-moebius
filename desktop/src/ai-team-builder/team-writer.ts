import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  TEAM_AGENT_FILE,
  TEAM_MANIFEST_FILE,
  TEAM_MEMBERS_DIRECTORY,
  createUniqueAgentSlug,
  evaluateTeamStatus,
  parseAgentMarkdownIdentity,
  parseTeamDefinitionJson,
  serializeTeamDefinition,
  validateTeamStructure,
  type TeamDefinition,
} from "../team-model.js";
import {
  forgetTrashedUserTeamRecord,
  registerUserTeamSnapshot,
} from "../team-record-store.js";
import type {
  TeamMemberSnapshot,
  TeamSnapshot,
} from "../team-store.js";
import {
  renderAiTeamMemberMarkdown,
  validateAiTeamBuilderOutput,
  type AiTeamBuilderProposal,
} from "./validator.js";

export interface AiTeamWriterResult {
  teamId: string;
  snapshot: TeamSnapshot;
}

export interface AiTeamWriterOptions {
  register?: (snapshot: TeamSnapshot) => Promise<void>;
  rollbackRecord?: (input: { dataRoot: string; teamId: string }) => Promise<void>;
  createId?: () => string;
}

export class AiTeamWriter {
  private readonly register: (snapshot: TeamSnapshot) => Promise<void>;
  private readonly rollbackRecord: (input: { dataRoot: string; teamId: string }) => Promise<void>;
  private readonly createId: () => string;

  constructor(options: AiTeamWriterOptions = {}) {
    this.register = options.register ?? registerUserTeamSnapshot;
    this.rollbackRecord = options.rollbackRecord ?? forgetTrashedUserTeamRecord;
    this.createId = options.createId ?? randomUUID;
  }

  async create(dataRoot: string, proposal: AiTeamBuilderProposal): Promise<AiTeamWriterResult> {
    const validation = validateAiTeamBuilderOutput({ phase: "proposal", ...proposal });
    if (!validation.ok || validation.value.phase !== "proposal") {
      throw new AiTeamWriterError("The current AI team proposal is invalid.");
    }
    const normalized = validation.value;
    const resolvedDataRoot = path.resolve(dataRoot);
    const teamsRoot = path.join(resolvedDataRoot, "teams");
    const stagingRoot = path.join(resolvedDataRoot, ".state", "ai-team-builder-staging");
    await Promise.all([
      fs.mkdir(teamsRoot, { recursive: true }),
      fs.mkdir(stagingRoot, { recursive: true }),
    ]);
    await assertSameDevice(teamsRoot, stagingRoot);

    const teamId = createTeamId(normalized.team.name, this.createId());
    const destination = path.join(teamsRoot, teamId);
    const staging = await fs.mkdtemp(path.join(stagingRoot, `${teamId}-`));
    let renamed = false;
    try {
      await writeStagedTeam(staging, normalized);
      const stagedSnapshot = await rereadStagedTeam({
        dataRoot: resolvedDataRoot,
        teamId,
        directory: staging,
        proposal: normalized,
      });
      await fs.rename(staging, destination);
      renamed = true;
      const snapshot = relocateSnapshot(stagedSnapshot, destination);
      try {
        await this.register(snapshot);
      } catch (error) {
        await this.rollbackRecord({ dataRoot: resolvedDataRoot, teamId });
        throw error;
      }
      return { teamId, snapshot };
    } catch (error) {
      await fs.rm(renamed ? destination : staging, { recursive: true, force: true });
      throw error instanceof AiTeamWriterError
        ? error
        : new AiTeamWriterError("Could not create the AI team atomically.", { cause: error });
    }
  }
}

async function writeStagedTeam(
  directory: string,
  proposal: AiTeamBuilderProposal,
): Promise<void> {
  const definition: TeamDefinition = {
    name: proposal.team.name,
    description: proposal.team.purpose,
    primaryAgentSlug: proposal.primaryAgentSlug,
    memberOrder: proposal.members.map((member) => member.slug),
    relayBeats: proposal.relayBeats.map((beat) => ({ ...beat })),
  };
  await fs.writeFile(path.join(directory, TEAM_MANIFEST_FILE), serializeTeamDefinition(definition), "utf8");
  for (const member of proposal.members) {
    const memberDirectory = path.join(directory, TEAM_MEMBERS_DIRECTORY, member.slug);
    await fs.mkdir(memberDirectory, { recursive: true });
    await fs.writeFile(
      path.join(memberDirectory, TEAM_AGENT_FILE),
      renderAiTeamMemberMarkdown(member),
      "utf8",
    );
  }
}

async function rereadStagedTeam(input: {
  dataRoot: string;
  teamId: string;
  directory: string;
  proposal: AiTeamBuilderProposal;
}): Promise<TeamSnapshot> {
  const definition = parseTeamDefinitionJson(
    await fs.readFile(path.join(input.directory, TEAM_MANIFEST_FILE), "utf8"),
  );
  const structuralIssues = validateTeamStructure(definition);
  if (structuralIssues.length > 0) {
    throw new AiTeamWriterError("Staged team manifest failed structural validation.");
  }
  if (
    definition.name !== input.proposal.team.name
    || definition.description !== input.proposal.team.purpose
    || definition.primaryAgentSlug !== input.proposal.primaryAgentSlug
  ) {
    throw new AiTeamWriterError("Staged team manifest does not match the validated proposal.");
  }
  if (JSON.stringify(definition.memberOrder) !== JSON.stringify(input.proposal.members.map(({ slug }) => slug))) {
    throw new AiTeamWriterError("Staged team member order does not match the proposal.");
  }
  if (JSON.stringify(definition.relayBeats) !== JSON.stringify(input.proposal.relayBeats)) {
    throw new AiTeamWriterError("Staged team relay beats do not match the proposal.");
  }

  const members: TeamMemberSnapshot[] = [];
  for (const slug of definition.memberOrder) {
    const expectedMember = input.proposal.members.find((member) => member.slug === slug);
    if (expectedMember === undefined) {
      throw new AiTeamWriterError(`Staged team contains an unexpected member: ${slug}`);
    }
    const memberDirectory = path.join(input.directory, TEAM_MEMBERS_DIRECTORY, slug);
    const agentFile = path.join(memberDirectory, TEAM_AGENT_FILE);
    const agentMarkdown = await fs.readFile(agentFile, "utf8");
    const identity = parseAgentMarkdownIdentity(agentMarkdown);
    if (
      identity.displayName !== expectedMember.name
      || identity.description !== expectedMember.role
      || agentMarkdown !== renderAiTeamMemberMarkdown(expectedMember)
    ) {
      throw new AiTeamWriterError(`Staged member does not match the validated proposal: ${slug}`);
    }
    members.push({
      slug,
      directory: memberDirectory,
      agentFile,
      agentMarkdown,
      ...identity,
    });
  }
  const proposalValidation = validateAiTeamBuilderOutput({
    phase: "proposal",
    ...input.proposal,
  });
  if (!proposalValidation.ok || proposalValidation.value.phase !== "proposal") {
    throw new AiTeamWriterError("Staged team proposal failed final business validation.");
  }
  const readiness = evaluateTeamStatus({ definition });
  if (readiness.status !== "usable" || members.length !== input.proposal.members.length) {
    throw new AiTeamWriterError("Staged team is not complete and usable.");
  }
  return {
    location: {
      dataRoot: input.dataRoot,
      id: input.teamId,
      directory: input.directory,
      ownership: "user",
    },
    definition,
    members,
    status: readiness.status,
    canCreateConversation: readiness.canCreateConversation,
    issues: readiness.issues,
  };
}

function relocateSnapshot(snapshot: TeamSnapshot, destination: string): TeamSnapshot {
  return {
    ...snapshot,
    location: { ...snapshot.location, directory: destination },
    members: snapshot.members.map((member) => {
      const directory = path.join(destination, TEAM_MEMBERS_DIRECTORY, member.slug);
      return {
        ...member,
        directory,
        agentFile: path.join(directory, TEAM_AGENT_FILE),
      };
    }),
  };
}

async function assertSameDevice(teamsRoot: string, stagingRoot: string): Promise<void> {
  const [teams, staging] = await Promise.all([fs.stat(teamsRoot), fs.stat(stagingRoot)]);
  if (teams.dev !== staging.dev) {
    throw new AiTeamWriterError("AI team staging and teams directories must be on the same filesystem.");
  }
}

function createTeamId(teamName: string, randomPart: string): string {
  const nameSlug = createUniqueAgentSlug(teamName, []);
  const safeRandomPart = randomPart.toLowerCase().replace(/[^a-z0-9]/gu, "").slice(0, 12) || "generated";
  return `${nameSlug}-${safeRandomPart}`;
}

export class AiTeamWriterError extends Error {
  readonly code = "AI_TEAM_WRITE_FAILED";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AiTeamWriterError";
  }
}
