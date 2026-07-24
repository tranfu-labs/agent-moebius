import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("desktop release contract", () => {
  it("only configures arm64 DMG and ZIP artifacts for macOS", async () => {
    const desktopPackage = JSON.parse(
      await readFile(path.join(repoRoot, "desktop/package.json"), "utf8"),
    ) as DesktopPackage;

    expect(desktopPackage.scripts.dist).toContain("brand:check");
    expect(desktopPackage.scripts.dist).toContain("electron-builder --mac --arm64");
    expect(desktopPackage.build.win).toBeUndefined();
    expect(desktopPackage.build.linux).toBeUndefined();
    expect(desktopPackage.build.mac.icon).toBe("../assets/brand/generated/app-icon-1024.png");
    expect(desktopPackage.build.mac.artifactName).toContain("mac-${arch}");
    expect(desktopPackage.build.mac.target).toEqual([
      { target: "dmg", arch: ["arm64"] },
      { target: "zip", arch: ["arm64"] },
    ]);
  });

  it("uses one native Apple Silicon release job with an architecture gate", async () => {
    const workflow = parse(
      await readFile(path.join(repoRoot, ".github/workflows/release-desktop.yml"), "utf8"),
    ) as ReleaseWorkflow;
    const job = workflow.jobs.build;
    const scripts = job.steps
      .map((step) => step.run)
      .filter((run): run is string => run !== undefined)
      .join("\n");

    expect(job["runs-on"]).toBe("macos-latest");
    expect(job.strategy).toBeUndefined();
    expect(scripts).toContain('test "$RUNNER_ARCH" = "ARM64"');
    expect(scripts).toContain('test "$(uname -m)" = "arm64"');
    expect(scripts).toContain("pnpm --filter @moebius/desktop dist");
    expect(JSON.stringify(workflow)).not.toMatch(/windows-latest|ubuntu-latest/);
  });
});

interface DesktopPackage {
  scripts: { dist: string };
  build: {
    mac: {
      icon: string;
      artifactName: string;
      target: Array<{ target: string; arch: string[] }>;
    };
    win?: unknown;
    linux?: unknown;
  };
}

interface ReleaseWorkflow {
  jobs: {
    build: {
      "runs-on": string;
      strategy?: unknown;
      steps: Array<{ run?: string }>;
    };
  };
}
