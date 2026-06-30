import { getLatestTimelineMessage } from "../conversation.js";
import type { TimelineMessage } from "../conversation.js";
import type { TriggerInput, TriggerResult } from "./types.js";

export const REFLECTOR_ROLE = "reflector";
export const REFLECTOR_STAGES = ["plan-written", "code-verified"] as const;

const REFLECTOR_STAGE_SET = new Set<string>(REFLECTOR_STAGES);
const METADATA_NAME = "[a-z0-9]+(?:-[a-z0-9]+)*";

export function resolveReflectorStageTrigger(input: TriggerInput): TriggerResult | null {
  if (!input.availableAgentNames.includes(REFLECTOR_ROLE)) {
    return null;
  }

  const latestMessage = getLatestTimelineMessage(input.timeline);
  if (latestMessage === null || !canTriggerReflector(latestMessage, input.availableAgentNames)) {
    return null;
  }

  const stage = parseFirstReflectorStage(latestMessage.body);
  if (stage === null || hasExistingStageHook(input.timeline, latestMessage.speaker, stage, latestMessage.index)) {
    return null;
  }

  return {
    kind: "post-comment",
    role: REFLECTOR_ROLE,
    reason: "reflector-stage",
    sourceRole: latestMessage.speaker,
    sourceIndex: latestMessage.index,
    stage,
    body: formatReflectorStageComment({
      sourceRole: latestMessage.speaker,
      sourceIndex: latestMessage.index,
      stage,
    }),
  };
}

export function parseReflectorStages(text: string): string[] {
  const stages: string[] = [];
  const pattern = new RegExp(`<!--\\s*agent-moebius:stage=(${METADATA_NAME})\\s*-->`, "g");

  for (const match of text.matchAll(pattern)) {
    const stage = match[1];
    if (stage !== undefined && REFLECTOR_STAGE_SET.has(stage)) {
      stages.push(stage);
    }
  }

  return stages;
}

export function parseStageHookMetadata(text: string): Array<{
  sourceRole: string;
  stage: string;
  sourceIndex: number;
}> {
  const hooks: Array<{ sourceRole: string; stage: string; sourceIndex: number }> = [];
  const pattern = new RegExp(
    `<!--\\s*agent-moebius:stage-hook\\s+source=(${METADATA_NAME})\\s+stage=(${METADATA_NAME})\\s+sourceIndex=(\\d+)\\s*-->`,
    "g",
  );

  for (const match of text.matchAll(pattern)) {
    const sourceRole = match[1];
    const stage = match[2];
    const sourceIndexText = match[3];
    if (sourceRole === undefined || stage === undefined || sourceIndexText === undefined) {
      continue;
    }

    hooks.push({
      sourceRole,
      stage,
      sourceIndex: Number.parseInt(sourceIndexText, 10),
    });
  }

  return hooks;
}

function canTriggerReflector(message: TimelineMessage, availableAgentNames: string[]): boolean {
  if (message.speaker === "user" || message.speaker === REFLECTOR_ROLE) {
    return false;
  }

  return availableAgentNames.includes(message.speaker);
}

function parseFirstReflectorStage(text: string): string | null {
  return parseReflectorStages(text)[0] ?? null;
}

function hasExistingStageHook(
  timeline: TimelineMessage[],
  sourceRole: string,
  stage: string,
  sourceIndex: number,
): boolean {
  return timeline.some((message) =>
    parseStageHookMetadata(message.body).some(
      (hook) => hook.sourceRole === sourceRole && hook.stage === stage && hook.sourceIndex === sourceIndex,
    ),
  );
}

function formatReflectorStageComment(input: { sourceRole: string; sourceIndex: number; stage: string }): string {
  return `&lt;${REFLECTOR_ROLE}&gt;:
@${input.sourceRole} 请针对「${input.stage}」做一次反思。

<!-- agent-moebius:role=${REFLECTOR_ROLE} -->
<!-- agent-moebius:stage-hook source=${input.sourceRole} stage=${input.stage} sourceIndex=${input.sourceIndex} -->`;
}
