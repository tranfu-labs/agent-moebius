import { describe, expect, it, vi } from "vitest";

import {
  RIGHT_SIDEBAR_VISIBILITY_STORAGE_KEY,
  RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
  DEFAULT_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX,
  MAX_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX,
  MIN_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX,
  readRightSidebarVisibilityPreference,
  readRightSidebarWidthPreference,
  writeRightSidebarVisibilityPreference,
  writeRightSidebarWidthPreference,
} from "../src/console-page/right-sidebar-preference.js";

describe("right sidebar preferences", () => {
  it("defaults closed and restores only an explicit open choice", () => {
    expect(readRightSidebarVisibilityPreference({ getItem: () => null })).toBe("closed");
    expect(readRightSidebarVisibilityPreference({ getItem: () => "closed" })).toBe("closed");
    expect(readRightSidebarVisibilityPreference({ getItem: () => "unexpected" })).toBe("closed");
    expect(readRightSidebarVisibilityPreference({ getItem: () => "open" })).toBe("open");
  });

  it("restores and clamps the persisted width", () => {
    expect(readRightSidebarWidthPreference({ getItem: () => null })).toBe(DEFAULT_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX);
    expect(readRightSidebarWidthPreference({ getItem: () => "512" })).toBe(512);
    expect(readRightSidebarWidthPreference({ getItem: () => "-1" })).toBe(MIN_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX);
    expect(readRightSidebarWidthPreference({ getItem: () => "9999" })).toBe(MAX_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX);
    expect(readRightSidebarWidthPreference({ getItem: () => "not-a-number" })).toBe(DEFAULT_RIGHT_SIDEBAR_WIDTH_PREFERENCE_PX);
  });

  it("persists both preferences without allowing storage failures to break controls", () => {
    const setItem = vi.fn();
    writeRightSidebarVisibilityPreference({ setItem }, "open");
    writeRightSidebarWidthPreference({ setItem }, 512);
    expect(setItem).toHaveBeenCalledWith(RIGHT_SIDEBAR_VISIBILITY_STORAGE_KEY, "open");
    expect(setItem).toHaveBeenCalledWith(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY, "512");

    expect(() => readRightSidebarVisibilityPreference({
      getItem: () => { throw new Error("blocked"); },
    })).not.toThrow();
    expect(() => writeRightSidebarWidthPreference({
      setItem: () => { throw new Error("full"); },
    }, 400)).not.toThrow();
  });
});
