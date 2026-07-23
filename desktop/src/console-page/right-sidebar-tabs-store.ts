import {
  EMPTY_RIGHT_SIDEBAR_TABS,
  parseRightSidebarTabsState,
  serializeRightSidebarTabsState,
  type RightSidebarTabsState,
} from "../../../packages/console-ui/src/console/right-sidebar-tabs.js";

export type RightSidebarTabsKey = `tabs:${string}`;

export function rightSidebarTabsKey(sessionId: string): RightSidebarTabsKey {
  return `tabs:${sessionId}`;
}

export interface RightSidebarTabsStore {
  read(sessionId: string): RightSidebarTabsState;
  write(sessionId: string, state: RightSidebarTabsState): void;
}

export function createRightSidebarTabsStore(storage: Storage): RightSidebarTabsStore {
  return {
    read(sessionId) {
      try {
        const serialized = storage.getItem(rightSidebarTabsKey(sessionId));
        return serialized === null
          ? EMPTY_RIGHT_SIDEBAR_TABS
          : parseRightSidebarTabsState(JSON.parse(serialized) as unknown);
      } catch {
        return EMPTY_RIGHT_SIDEBAR_TABS;
      }
    },
    write(sessionId, state) {
      try {
        storage.setItem(rightSidebarTabsKey(sessionId), serializeRightSidebarTabsState(state));
      } catch {
        // A blocked or full localStorage must not break tab interactions.
      }
    },
  };
}
