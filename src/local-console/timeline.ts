import { buildTimeline, formatAgentComment, type TimelineMessage } from "../conversation.js";
import type { LocalConsoleMessage } from "./types.js";

export function buildLocalConsoleTimeline(
  messages: readonly LocalConsoleMessage[],
  availableAgentNames: readonly string[],
): TimelineMessage[] {
  if (messages.length === 0) {
    return [];
  }

  const bodies = messages.map(formatLocalMessageBody);
  const issueBody = bodies[0] ?? "";
  return buildTimeline(
    issueBody,
    bodies.slice(1).map((body) => ({ body })),
    [...availableAgentNames],
  );
}

function formatLocalMessageBody(message: LocalConsoleMessage): string {
  if (message.speaker === "agent" && message.role !== null) {
    return formatAgentComment(message.role, message.body);
  }
  return message.body;
}
