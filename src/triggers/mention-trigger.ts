import { getLatestTimelineMessage, selectMentionedAgent } from "../conversation.js";
import type { TriggerInput, TriggerResult } from "./types.js";

const NON_CODEX_MENTION_ROLES = new Set(["ceo", "reflector"]);

export function resolveMentionTrigger(input: TriggerInput): TriggerResult | null {
  const latestMessage = getLatestTimelineMessage(input.timeline);
  if (latestMessage === null) {
    return { kind: "skip", reason: "empty-timeline" };
  }

  const codexAgentNames = input.availableAgentNames.filter((name) => !NON_CODEX_MENTION_ROLES.has(name));
  const selectedAgentName = selectMentionedAgent(latestMessage.body, codexAgentNames);
  if (selectedAgentName === null) {
    return null;
  }

  return {
    kind: "run-agent",
    role: selectedAgentName,
    reason: "mention",
  };
}
