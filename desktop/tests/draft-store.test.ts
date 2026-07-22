import { describe, expect, it } from "vitest";

import {
  createConversationDraftStore,
  NEW_CONVERSATION_DRAFT_KEY,
  sessionDraftKey,
} from "../src/console-page/draft-store.js";

describe("conversation draft store", () => {
  it("keeps new-conversation and per-session drafts isolated across store instances", () => {
    const storage = new MemoryStorage();
    const firstRun = createConversationDraftStore(storage);
    firstRun.write(NEW_CONVERSATION_DRAFT_KEY, "new draft");
    firstRun.write(sessionDraftKey("session-a"), "session A draft");
    firstRun.write(sessionDraftKey("session-b"), "session B draft");

    const restarted = createConversationDraftStore(storage);
    expect(restarted.read(NEW_CONVERSATION_DRAFT_KEY)).toBe("new draft");
    expect(restarted.read(sessionDraftKey("session-a"))).toBe("session A draft");
    expect(restarted.read(sessionDraftKey("session-b"))).toBe("session B draft");
  });

  it("clears only draft:new after a successful creation", () => {
    const storage = new MemoryStorage();
    const drafts = createConversationDraftStore(storage);
    drafts.write(NEW_CONVERSATION_DRAFT_KEY, "new draft");
    drafts.write(sessionDraftKey("session-a"), "existing draft");

    drafts.clear(NEW_CONVERSATION_DRAFT_KEY);

    expect(drafts.read(NEW_CONVERSATION_DRAFT_KEY)).toBe("");
    expect(drafts.read(sessionDraftKey("session-a"))).toBe("existing draft");
  });
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
