export const NEW_CONVERSATION_DRAFT_KEY = "draft:new";

export type ConversationDraftKey = typeof NEW_CONVERSATION_DRAFT_KEY | `draft:${string}`;

export function sessionDraftKey(sessionId: string): ConversationDraftKey {
  return `draft:${sessionId}`;
}

export interface ConversationDraftStore {
  read(key: ConversationDraftKey): string;
  write(key: ConversationDraftKey, value: string): void;
  clear(key: ConversationDraftKey): void;
}

export function createConversationDraftStore(storage: Storage): ConversationDraftStore {
  return {
    read(key) {
      try {
        return storage.getItem(key) ?? "";
      } catch {
        return "";
      }
    },
    write(key, value) {
      try {
        if (value === "") {
          storage.removeItem(key);
        } else {
          storage.setItem(key, value);
        }
      } catch {
        // Draft persistence is best-effort; typing must remain available.
      }
    },
    clear(key) {
      try {
        storage.removeItem(key);
      } catch {
        // A blocked storage backend must not break a successful send.
      }
    },
  };
}
