export interface ConversationSnapshot {
  messageCount: number;
}

export interface ConversationInterrupt {
  reason: "new-message";
  baselineMessageCount: number;
  currentMessageCount: number;
}

export interface PollingConversationInterruptMonitor {
  readonly interrupt: ConversationInterrupt | null;
  stop(): void;
}

export function resolveConversationInterrupt(input: {
  baselineSnapshot: ConversationSnapshot;
  currentSnapshot: ConversationSnapshot;
}): ConversationInterrupt | null {
  assertMessageCount("baselineSnapshot.messageCount", input.baselineSnapshot.messageCount);
  assertMessageCount("currentSnapshot.messageCount", input.currentSnapshot.messageCount);

  if (input.currentSnapshot.messageCount <= input.baselineSnapshot.messageCount) {
    return null;
  }

  return {
    reason: "new-message",
    baselineMessageCount: input.baselineSnapshot.messageCount,
    currentMessageCount: input.currentSnapshot.messageCount,
  };
}

export function formatConversationInterrupt(interrupt: ConversationInterrupt): string {
  return `${interrupt.reason}:baseline=${interrupt.baselineMessageCount},current=${interrupt.currentMessageCount}`;
}

export function startPollingConversationInterruptMonitor(input: {
  baselineSnapshot: ConversationSnapshot;
  fetchSnapshot: () => Promise<ConversationSnapshot>;
  intervalMs: number;
  onInterrupt: (interrupt: ConversationInterrupt) => void;
  onError?: (error: unknown) => void;
}): PollingConversationInterruptMonitor {
  assertMessageCount("baselineSnapshot.messageCount", input.baselineSnapshot.messageCount);
  if (!Number.isInteger(input.intervalMs) || input.intervalMs <= 0) {
    throw new Error("intervalMs must be a positive integer");
  }

  let stopped = false;
  let polling = false;
  let interrupt: ConversationInterrupt | null = null;

  const stop = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    clearInterval(timer);
  };

  const poll = async () => {
    if (stopped || polling || interrupt !== null) {
      return;
    }

    polling = true;
    try {
      const currentSnapshot = await input.fetchSnapshot();
      if (stopped) {
        return;
      }

      const nextInterrupt = resolveConversationInterrupt({
        baselineSnapshot: input.baselineSnapshot,
        currentSnapshot,
      });
      if (nextInterrupt === null) {
        return;
      }

      interrupt = nextInterrupt;
      input.onInterrupt(nextInterrupt);
      stop();
    } catch (error) {
      input.onError?.(error);
    } finally {
      polling = false;
    }
  };

  const timer = setInterval(() => {
    void poll();
  }, input.intervalMs);
  timer.unref();
  void poll();

  return {
    get interrupt() {
      return interrupt;
    },
    stop,
  };
}

function assertMessageCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}
