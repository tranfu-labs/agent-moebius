import { describe, expect, it } from "vitest";
import {
  formatConversationInterrupt,
  resolveConversationInterrupt,
  startPollingConversationInterruptMonitor,
} from "../src/conversation-interrupt.js";

describe("conversation interrupt", () => {
  it("does not interrupt while the message count is unchanged", () => {
    expect(
      resolveConversationInterrupt({
        baselineSnapshot: { messageCount: 2 },
        currentSnapshot: { messageCount: 2 },
      }),
    ).toBeNull();
  });

  it("interrupts when a driver reports new messages", () => {
    const interrupt = resolveConversationInterrupt({
      baselineSnapshot: { messageCount: 2 },
      currentSnapshot: { messageCount: 3 },
    });

    expect(interrupt).toEqual({
      reason: "new-message",
      baselineMessageCount: 2,
      currentMessageCount: 3,
    });
    expect(formatConversationInterrupt(interrupt!)).toBe("new-message:baseline=2,current=3");
  });

  it("polls snapshots without depending on a specific driver", async () => {
    const interrupts: string[] = [];
    let messageCount = 1;
    const monitor = startPollingConversationInterruptMonitor({
      baselineSnapshot: { messageCount },
      intervalMs: 1,
      fetchSnapshot: async () => ({ messageCount }),
      onInterrupt: (interrupt) => {
        interrupts.push(formatConversationInterrupt(interrupt));
      },
    });

    messageCount = 2;
    await new Promise((resolve) => setTimeout(resolve, 20));
    monitor.stop();

    expect(interrupts).toEqual(["new-message:baseline=1,current=2"]);
    expect(monitor.interrupt).toMatchObject({
      reason: "new-message",
      baselineMessageCount: 1,
      currentMessageCount: 2,
    });
  });
});
