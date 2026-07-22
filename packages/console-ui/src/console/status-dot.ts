export type ConversationStatusDot = "red" | "blue" | "blink" | "none";

export interface StatusDotFacts {
  /** Legacy field retained only for source compatibility; it never affects the dot. */
  awaitsHumanReason?: string | null;
  unresolvedSystemEventKind?: "run-not-started" | "run-stuck" | "retry-exhausted" | null;
  isNonContinuable?: boolean;
  unreadSince: string | null;
  isRunning: boolean;
  lastMessageMentionsAgent?: boolean;
}

export function deriveStatusDot(facts: StatusDotFacts): ConversationStatusDot {
  if ((facts.unresolvedSystemEventKind ?? null) !== null || facts.isNonContinuable === true) {
    return "red";
  }
  if (!facts.isRunning && facts.unreadSince !== null && facts.lastMessageMentionsAgent !== true) {
    return "blue";
  }
  if (facts.isRunning) {
    return "blink";
  }
  return "none";
}

export function deriveProjectStatusDot(sessions: readonly StatusDotFacts[]): ConversationStatusDot {
  let highest: ConversationStatusDot = "none";
  for (const session of sessions) {
    const status = deriveStatusDot(session);
    if (status === "red") return "red";
    if (status === "blue") highest = "blue";
    else if (status === "blink" && highest === "none") highest = "blink";
  }
  return highest;
}
