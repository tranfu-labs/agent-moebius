import { describe, expect, it, vi } from "vitest";

import {
  SIDEBAR_VISIBILITY_STORAGE_KEY,
  isFirstRunOnboarding,
  readSidebarVisibilityPreference,
  writeSidebarVisibilityPreference,
} from "../src/console-page/sidebar-preference.js";

describe("sidebar visibility preference", () => {
  it("defaults to open and restores an explicit closed choice", () => {
    expect(readSidebarVisibilityPreference({ getItem: () => null })).toBe("open");
    expect(readSidebarVisibilityPreference({ getItem: () => "open" })).toBe("open");
    expect(readSidebarVisibilityPreference({ getItem: () => "closed" })).toBe("closed");
    expect(readSidebarVisibilityPreference({ getItem: () => "unexpected" })).toBe("open");
  });

  it("persists explicit choices without letting storage failures break the control", () => {
    const setItem = vi.fn();
    writeSidebarVisibilityPreference({ setItem }, "closed");
    expect(setItem).toHaveBeenCalledWith(SIDEBAR_VISIBILITY_STORAGE_KEY, "closed");

    expect(() => readSidebarVisibilityPreference({ getItem: () => { throw new Error("blocked"); } })).not.toThrow();
    expect(() => writeSidebarVisibilityPreference({ setItem: () => { throw new Error("full"); } }, "open")).not.toThrow();
  });

  it("recognizes the no-project configuration as first-run onboarding", () => {
    expect(isFirstRunOnboarding(null)).toBe(false);
    expect(isFirstRunOnboarding([])).toBe(true);
    expect(isFirstRunOnboarding([{ folderPath: "" }, { folderPath: "  " }])).toBe(true);
    expect(isFirstRunOnboarding([{ folderPath: "/Users/example/project" }])).toBe(false);
  });
});
