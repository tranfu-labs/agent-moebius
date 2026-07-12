import { describe, expect, it } from "vitest";

import { integratedMainWindowOptions } from "../src/main-window-options.js";

describe("integratedMainWindowOptions", () => {
  it("integrates macOS traffic lights into the console rail", () => {
    expect(integratedMainWindowOptions("darwin")).toEqual({
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: "#ffffff",
    });
  });

  it("keeps native titlebar behavior on other platforms", () => {
    expect(integratedMainWindowOptions("win32")).toEqual({ backgroundColor: "#ffffff" });
    expect(integratedMainWindowOptions("linux")).toEqual({ backgroundColor: "#ffffff" });
  });
});
