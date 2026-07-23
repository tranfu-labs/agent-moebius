export const RIGHT_SIDEBAR_VISIBILITY_STORAGE_KEY = "agent-moebius.right-sidebar.visibility";
export const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = "agent-moebius.right-sidebar.width";
export const DEFAULT_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX = 420;
export const MIN_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX = 320;
export const MAX_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX = 640;

export type RightSidebarVisibilityPreference = "open" | "closed";

interface RightSidebarPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readRightSidebarVisibilityPreference(
  storage: Pick<RightSidebarPreferenceStorage, "getItem">,
): RightSidebarVisibilityPreference {
  try {
    return storage.getItem(RIGHT_SIDEBAR_VISIBILITY_STORAGE_KEY) === "open" ? "open" : "closed";
  } catch {
    return "closed";
  }
}

export function writeRightSidebarVisibilityPreference(
  storage: Pick<RightSidebarPreferenceStorage, "setItem">,
  preference: RightSidebarVisibilityPreference,
): void {
  try {
    storage.setItem(RIGHT_SIDEBAR_VISIBILITY_STORAGE_KEY, preference);
  } catch {
    // Preference persistence is best-effort; the control must remain usable.
  }
}

export function readRightSidebarWidthPreference(
  storage: Pick<RightSidebarPreferenceStorage, "getItem">,
): number {
  try {
    const value = storage.getItem(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY);
    if (value === null || value.trim() === "") {
      return DEFAULT_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX;
    }
    const width = Number(value);
    return Number.isFinite(width)
      ? clampRightSidebarWidthPreference(width)
      : DEFAULT_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX;
  } catch {
    return DEFAULT_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX;
  }
}

export function writeRightSidebarWidthPreference(
  storage: Pick<RightSidebarPreferenceStorage, "setItem">,
  width: number,
): void {
  try {
    storage.setItem(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY, String(clampRightSidebarWidthPreference(width)));
  } catch {
    // Preference persistence is best-effort; resizing must remain available.
  }
}

function clampRightSidebarWidthPreference(width: number): number {
  return Math.min(
    MAX_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX,
    Math.max(MIN_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX, Math.round(width)),
  );
}
