import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { TEAM_MANIFEST_FILE, type TeamDefinition } from "./team-model.js";

export const TEAM_ONBOARDING_ORCHESTRATION_FILE = "onboarding-orchestration.json";

export interface TeamRelayBeat {
  speakerSlug: string;
  message: string;
}

export interface TeamOnboardingOrchestration {
  version: 1;
  relayBeats: TeamRelayBeat[];
}

export type TeamOnboardingOrchestrationReadResult =
  | {
      status: "ready";
      source: "independent" | "embedded";
      orchestration: TeamOnboardingOrchestration;
    }
  | { status: "missing" }
  | { status: "invalid" };

export function parseTeamOnboardingOrchestrationJson(
  source: string,
  memberOrder: readonly string[],
): TeamOnboardingOrchestration {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new TeamOnboardingOrchestrationError(
      `${TEAM_ONBOARDING_ORCHESTRATION_FILE} must contain valid JSON`,
    );
  }
  return parseTeamOnboardingOrchestrationValue(value, memberOrder);
}

export function serializeTeamOnboardingOrchestration(
  orchestration: TeamOnboardingOrchestration,
): string {
  return `${JSON.stringify(orchestration, null, 2)}\n`;
}

export function readLegacyEmbeddedOnboardingOrchestration(
  value: unknown,
  memberOrder: readonly string[],
): TeamOnboardingOrchestrationReadResult {
  if (!isPlainObject(value) || !Object.hasOwn(value, "relayBeats")) {
    return { status: "missing" };
  }
  try {
    return {
      status: "ready",
      source: "embedded",
      orchestration: parseTeamOnboardingOrchestrationValue({
        version: 1,
        relayBeats: value.relayBeats,
      }, memberOrder),
    };
  } catch {
    return { status: "invalid" };
  }
}

export async function readTeamOnboardingOrchestration(input: {
  directory: string;
  memberOrder: readonly string[];
}): Promise<TeamOnboardingOrchestrationReadResult> {
  try {
    const source = await fs.readFile(
      path.join(input.directory, TEAM_ONBOARDING_ORCHESTRATION_FILE),
      "utf8",
    );
    try {
      return {
        status: "ready",
        source: "independent",
        orchestration: parseTeamOnboardingOrchestrationJson(source, input.memberOrder),
      };
    } catch {
      return { status: "invalid" };
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      return { status: "invalid" };
    }
  }

  try {
    const manifestValue: unknown = JSON.parse(
      await fs.readFile(path.join(input.directory, TEAM_MANIFEST_FILE), "utf8"),
    );
    return readLegacyEmbeddedOnboardingOrchestration(manifestValue, input.memberOrder);
  } catch {
    return { status: "missing" };
  }
}

export async function writeTeamOnboardingOrchestration(
  directory: string,
  orchestration: TeamOnboardingOrchestration,
  memberOrder: readonly string[],
): Promise<void> {
  const normalized = parseTeamOnboardingOrchestrationJson(
    serializeTeamOnboardingOrchestration(orchestration),
    memberOrder,
  );
  await writeTextFileAtomically(
    path.join(directory, TEAM_ONBOARDING_ORCHESTRATION_FILE),
    serializeTeamOnboardingOrchestration(normalized),
  );
}

export async function preserveLegacyEmbeddedOnboardingOrchestration(
  directory: string,
): Promise<void> {
  try {
    await fs.access(path.join(directory, TEAM_ONBOARDING_ORCHESTRATION_FILE));
    return;
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  let source: string;
  try {
    source = await fs.readFile(path.join(directory, TEAM_MANIFEST_FILE), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return;
  }
  if (!isPlainObject(value) || !Array.isArray(value.memberOrder)) {
    return;
  }
  const memberOrder = value.memberOrder.filter((candidate): candidate is string =>
    typeof candidate === "string");
  const embedded = readLegacyEmbeddedOnboardingOrchestration(value, memberOrder);
  if (embedded.status !== "ready") {
    return;
  }
  await writeTeamOnboardingOrchestration(
    directory,
    embedded.orchestration,
    memberOrder,
  );
}

export function serializeLegacyRelayInclusiveTeamDefinition(
  definition: TeamDefinition,
  relayBeats: readonly TeamRelayBeat[],
): string {
  return `${JSON.stringify({
    name: definition.name,
    description: definition.description,
    primaryAgentSlug: definition.primaryAgentSlug,
    memberOrder: definition.memberOrder,
    relayBeats,
  }, null, 2)}\n`;
}

export class TeamOnboardingOrchestrationError extends Error {
  readonly code = "TEAM_ONBOARDING_ORCHESTRATION_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "TeamOnboardingOrchestrationError";
  }
}

function parseTeamOnboardingOrchestrationValue(
  value: unknown,
  memberOrder: readonly string[],
): TeamOnboardingOrchestration {
  if (!isPlainObject(value)) {
    throw new TeamOnboardingOrchestrationError(
      `${TEAM_ONBOARDING_ORCHESTRATION_FILE} must contain a JSON object`,
    );
  }
  const unexpectedTopLevelKey = Object.keys(value)
    .find((key) => key !== "version" && key !== "relayBeats");
  if (unexpectedTopLevelKey !== undefined || value.version !== 1 || !Array.isArray(value.relayBeats)) {
    throw new TeamOnboardingOrchestrationError(
      `${TEAM_ONBOARDING_ORCHESTRATION_FILE} has an unsupported shape`,
    );
  }
  if (value.relayBeats.length === 0) {
    throw new TeamOnboardingOrchestrationError(
      `${TEAM_ONBOARDING_ORCHESTRATION_FILE} relayBeats must be a non-empty array`,
    );
  }
  const relayBeats = value.relayBeats.map((candidate, index) => {
    if (!isPlainObject(candidate)) {
      throw new TeamOnboardingOrchestrationError(
        `${TEAM_ONBOARDING_ORCHESTRATION_FILE} relayBeats[${String(index)}] must be an object`,
      );
    }
    const unexpectedBeatKey = Object.keys(candidate)
      .find((key) => key !== "speakerSlug" && key !== "message");
    if (
      unexpectedBeatKey !== undefined
      || typeof candidate.speakerSlug !== "string"
      || candidate.speakerSlug.trim().length === 0
      || candidate.speakerSlug.trim() !== candidate.speakerSlug
      || typeof candidate.message !== "string"
      || candidate.message.trim().length === 0
      || !memberOrder.includes(candidate.speakerSlug)
    ) {
      throw new TeamOnboardingOrchestrationError(
        `${TEAM_ONBOARDING_ORCHESTRATION_FILE} relayBeats[${String(index)}] is invalid`,
      );
    }
    return {
      speakerSlug: candidate.speakerSlug,
      message: candidate.message,
    };
  });
  return { version: 1, relayBeats };
}

async function writeTextFileAtomically(filePath: string, source: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.writeFile(temporaryPath, source, "utf8");
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
