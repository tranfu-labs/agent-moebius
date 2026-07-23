export const RIGHT_SIDEBAR_TAB_TYPES = [
  "workspace-diff",
  "project-files",
  "run-output",
  "sub-session",
  "blank",
] as const;

export type RightSidebarTabType = (typeof RIGHT_SIDEBAR_TAB_TYPES)[number];

export const RIGHT_SIDEBAR_SELECTABLE_TAB_TYPES = [
  "workspace-diff",
  "project-files",
] as const satisfies readonly RightSidebarTabType[];

export type RightSidebarSelectableTabType = (typeof RIGHT_SIDEBAR_SELECTABLE_TAB_TYPES)[number];

export interface RightSidebarTab {
  id: string;
  type: RightSidebarTabType;
  title: string;
  sourceKey: string | null;
  closable: true;
  processScroll?: RightSidebarProcessScrollSnapshot;
}

export interface RightSidebarProcessScrollSnapshot {
  anchorEventKey: string | null;
  offsetPx: number;
  followLatest: boolean;
}

export interface RightSidebarTabsState {
  tabs: RightSidebarTab[];
  activeTabId: string | null;
}

export interface RightSidebarSourceTab {
  id: string;
  type: Exclude<RightSidebarTabType, "blank">;
  title: string;
  sourceKey: string;
}

export const EMPTY_RIGHT_SIDEBAR_TABS: RightSidebarTabsState = {
  tabs: [],
  activeTabId: null,
};

const RUN_OUTPUT_SOURCE_KEY_PREFIX = "run-output-v2:";

export function createRunOutputSourceKey(sessionId: string, runId: string): string {
  return `${RUN_OUTPUT_SOURCE_KEY_PREFIX}${encodeURIComponent(sessionId)}:${encodeURIComponent(runId)}`;
}

export function parseRunOutputSourceKey(
  sourceKey: string | null,
  legacySessionId?: string,
): { sessionId: string; runId: string } | null {
  if (sourceKey === null) {
    return null;
  }
  if (sourceKey.startsWith(RUN_OUTPUT_SOURCE_KEY_PREFIX)) {
    const encoded = sourceKey.slice(RUN_OUTPUT_SOURCE_KEY_PREFIX.length);
    const separator = encoded.indexOf(":");
    if (separator <= 0 || separator >= encoded.length - 1) {
      return null;
    }
    try {
      const sessionId = decodeURIComponent(encoded.slice(0, separator));
      const runId = decodeURIComponent(encoded.slice(separator + 1));
      return sessionId === "" || runId === "" ? null : { sessionId, runId };
    } catch {
      return null;
    }
  }
  if (legacySessionId === undefined) {
    return null;
  }
  const legacyPrefix = `run-output:${legacySessionId}:`;
  const runId = sourceKey.startsWith(legacyPrefix)
    ? sourceKey.slice(legacyPrefix.length)
    : "";
  return runId === "" ? null : { sessionId: legacySessionId, runId };
}

export function createBlankRightSidebarTab(id: string): RightSidebarTab {
  return {
    id,
    type: "blank",
    title: "新标签",
    sourceKey: null,
    closable: true,
  };
}

export function addBlankRightSidebarTab(
  state: RightSidebarTabsState,
  id: string,
): RightSidebarTabsState {
  const tab = createBlankRightSidebarTab(uniqueRightSidebarTabId(state, id));
  return {
    tabs: [...state.tabs, tab],
    activeTabId: tab.id,
  };
}

export function ensureRightSidebarTabsForOpen(
  state: RightSidebarTabsState,
  options: { id: string; isGitRepository: boolean },
): RightSidebarTabsState {
  if (state.tabs.length > 0) {
    return state.activeTabId === null
      ? { ...state, activeTabId: state.tabs[0]?.id ?? null }
      : state;
  }
  const tab: RightSidebarTab = options.isGitRepository
    ? {
        id: options.id,
        type: "workspace-diff",
        title: "改动",
        sourceKey: null,
        closable: true,
      }
    : {
        id: options.id,
        type: "project-files",
        title: "项目文件",
        sourceKey: null,
        closable: true,
      };
  return { tabs: [tab], activeTabId: tab.id };
}

export function openRightSidebarSourceTab(
  state: RightSidebarTabsState,
  source: RightSidebarSourceTab,
): RightSidebarTabsState {
  const existing = state.tabs.find((tab) => tab.sourceKey === source.sourceKey);
  if (existing !== undefined) {
    return state.activeTabId === existing.id
      ? state
      : { ...state, activeTabId: existing.id };
  }
  const tab: RightSidebarTab = {
    ...source,
    id: uniqueRightSidebarTabId(state, source.id),
    closable: true,
  };
  return {
    tabs: [...state.tabs, tab],
    activeTabId: tab.id,
  };
}

export function selectRightSidebarTab(
  state: RightSidebarTabsState,
  tabId: string,
): RightSidebarTabsState {
  return state.tabs.some((tab) => tab.id === tabId)
    ? { ...state, activeTabId: tabId }
    : state;
}

export function updateRightSidebarProcessScroll(
  state: RightSidebarTabsState,
  tabId: string,
  snapshot: RightSidebarProcessScrollSnapshot,
): RightSidebarTabsState {
  const normalized = normalizeProcessScrollSnapshot(snapshot);
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === tabId && tab.type === "run-output"
        ? { ...tab, processScroll: normalized }
        : tab),
  };
}

export function closeRightSidebarTab(
  state: RightSidebarTabsState,
  tabId: string,
  fallbackBlankId: string,
): RightSidebarTabsState {
  const closingIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  if (closingIndex < 0) {
    return state;
  }
  const remaining = state.tabs.filter((tab) => tab.id !== tabId);
  if (remaining.length === 0) {
    const blank = createBlankRightSidebarTab(fallbackBlankId);
    return {
      ...state,
      tabs: [blank],
      activeTabId: blank.id,
    };
  }
  if (state.activeTabId !== tabId) {
    return { ...state, tabs: remaining };
  }
  const nextActive = remaining[Math.min(closingIndex, remaining.length - 1)]!;
  return { tabs: remaining, activeTabId: nextActive.id };
}

export function convertBlankRightSidebarTab(
  state: RightSidebarTabsState,
  tabId: string,
  type: RightSidebarSelectableTabType,
): RightSidebarTabsState {
  const title = type === "workspace-diff" ? "改动" : "项目文件";
  return {
    tabs: state.tabs.map((tab) => tab.id === tabId && tab.type === "blank"
      ? { ...tab, type, title }
      : tab),
    activeTabId: state.activeTabId,
  };
}

export function parseRightSidebarTabsState(value: unknown): RightSidebarTabsState {
  if (!isRecord(value) || !Array.isArray(value.tabs)) {
    return EMPTY_RIGHT_SIDEBAR_TABS;
  }
  const tabs = value.tabs.flatMap((entry): RightSidebarTab[] => {
    if (
      !isRecord(entry)
      || typeof entry.id !== "string"
      || entry.id.trim() === ""
      || !isRightSidebarTabType(entry.type)
      || typeof entry.title !== "string"
      || !(typeof entry.sourceKey === "string" || entry.sourceKey === null)
    ) {
      return [];
    }
    return [{
      id: entry.id,
      type: entry.type,
      title: entry.title,
      sourceKey: entry.sourceKey,
      closable: true,
    }];
  });
  const uniqueTabs = tabs.filter(
    (tab, index) => tabs.findIndex((candidate) => candidate.id === tab.id) === index,
  );
  const activeTabId = typeof value.activeTabId === "string"
    && uniqueTabs.some((tab) => tab.id === value.activeTabId)
    ? value.activeTabId
    : uniqueTabs[0]?.id ?? null;
  return {
    tabs: uniqueTabs,
    activeTabId,
  };
}

export function serializeRightSidebarTabsState(state: RightSidebarTabsState): string {
  return JSON.stringify(parseRightSidebarTabsState(state));
}

function isRightSidebarTabType(value: unknown): value is RightSidebarTabType {
  return typeof value === "string" && RIGHT_SIDEBAR_TAB_TYPES.some((type) => type === value);
}

function uniqueRightSidebarTabId(state: RightSidebarTabsState, requestedId: string): string {
  if (!state.tabs.some((tab) => tab.id === requestedId)) {
    return requestedId;
  }
  let suffix = 2;
  while (state.tabs.some((tab) => tab.id === `${requestedId}-${String(suffix)}`)) {
    suffix += 1;
  }
  return `${requestedId}-${String(suffix)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeProcessScrollSnapshot(
  value: RightSidebarProcessScrollSnapshot,
): RightSidebarProcessScrollSnapshot {
  return {
    anchorEventKey: value.anchorEventKey,
    offsetPx: Math.max(0, value.offsetPx),
    followLatest: value.followLatest,
  };
}
