import type { TimelineMessage } from "../conversation.js";
import type { TriggerResult } from "./types.js";

export type SelfReflectStopReason =
  | "max-iterations"
  | "mention-not-self-reflected"
  | "trigger-skip";

export type SelfReflectStep =
  | { kind: "continue-hook"; reason: "stage-hook" }
  | { kind: "stop"; reason: SelfReflectStopReason };

export function appendPostedComment(
  timeline: TimelineMessage[],
  role: string,
  body: string,
): TimelineMessage[] {
  return [
    ...timeline,
    {
      index: timeline.length,
      speaker: role,
      body,
      source: "comment",
    },
  ];
}

export function decideNextSelfReflectStep(
  nextTrigger: TriggerResult,
  iteration: number,
  maxIterations: number,
): SelfReflectStep {
  if (nextTrigger.kind === "post-comment") {
    if (iteration > maxIterations) {
      return { kind: "stop", reason: "max-iterations" };
    }
    return { kind: "continue-hook", reason: "stage-hook" };
  }

  if (nextTrigger.kind === "run-agent") {
    return { kind: "stop", reason: "mention-not-self-reflected" };
  }

  return { kind: "stop", reason: "trigger-skip" };
}
