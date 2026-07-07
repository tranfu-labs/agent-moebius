import { describe, expect, it } from "vitest";
import { compareVersions, decideUpdate, resolveUpdateStrategy } from "../src/updater.js";

describe("desktop updater", () => {
  it("uses manual download on macOS and auto update elsewhere", () => {
    expect(resolveUpdateStrategy("darwin")).toBe("manual-download");
    expect(resolveUpdateStrategy("win32")).toBe("auto-update");
    expect(resolveUpdateStrategy("linux")).toBe("auto-update");
  });

  it("compares semantic versions", () => {
    expect(compareVersions("1.2.1", "1.2.0")).toBe(1);
    expect(compareVersions("v1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("desktop-v1.2.1", "1.2.0")).toBe(1);
    expect(compareVersions("1.1.9", "1.2.0")).toBe(-1);
  });

  it("decides platform-specific update actions", () => {
    expect(
      decideUpdate({
        platform: "darwin",
        currentVersion: "0.1.0",
        latestVersion: "0.2.0",
        downloadUrl: "https://example.test/download",
      }),
    ).toMatchObject({ action: "open-download-page", updateAvailable: true });

    expect(
      decideUpdate({
        platform: "linux",
        currentVersion: "0.1.0",
        latestVersion: "0.2.0",
      }),
    ).toMatchObject({ action: "auto-update", updateAvailable: true });

    expect(
      decideUpdate({
        platform: "win32",
        currentVersion: "0.2.0",
        latestVersion: "0.2.0",
      }),
    ).toMatchObject({ action: "none", updateAvailable: false });
  });
});
