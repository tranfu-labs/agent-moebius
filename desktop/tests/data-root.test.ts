import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeedCopyPlan, resolveDesktopDataRoot, type SeedPlanFileSystem } from "../src/data-root.js";

const LEGACY_DATA_ROOT_ENV = ["AGENT", "MOEBIUS", "DATA", "ROOT"].join("_");

describe("desktop data root", () => {
  it("uses the environment override first", () => {
    expect(
      resolveDesktopDataRoot({
        env: { MOEBIUS_DATA_ROOT: "/tmp/custom-moebius" },
        isPackaged: true,
        projectRoot: "/repo",
        homeDir: "/home/alice",
      }),
    ).toBe("/tmp/custom-moebius");
  });

  it("uses ~/.moebius when packaged and project root during development", () => {
    expect(resolveDesktopDataRoot({ env: {}, isPackaged: true, projectRoot: "/repo", homeDir: "/home/alice" })).toBe(
      "/home/alice/.moebius",
    );
    expect(resolveDesktopDataRoot({ env: {}, isPackaged: false, projectRoot: "/repo", homeDir: "/home/alice" })).toBe(
      "/repo",
    );
  });

  it("does not read the legacy data root environment variable", () => {
    expect(
      resolveDesktopDataRoot({
        env: { [LEGACY_DATA_ROOT_ENV]: "/tmp/legacy-data" },
        isPackaged: true,
        projectRoot: "/repo",
        homeDir: "/home/alice",
      }),
    ).toBe("/home/alice/.moebius");
  });

  it("plans config and agents seed copies without overwriting existing destinations", async () => {
    const seedRoot = "/app/seed";
    const dataRoot = "/home/alice/.moebius";
    const existing = new Set([path.join(dataRoot, "agents", "dev.md")]);
    const fileSystem: SeedPlanFileSystem = {
      async exists(filePath) {
        return existing.has(filePath);
      },
      async listFiles(root) {
        expect(root).toBe(path.join(seedRoot, "agents"));
        return [
          path.join(seedRoot, "agents", "ceo-scripts", "goal-intake.md"),
          path.join(seedRoot, "agents", "dev.md"),
        ];
      },
    };

    const plan = await buildSeedCopyPlan({ seedRoot, dataRoot, fileSystem });

    expect(plan.skippedDestinations).toEqual([path.join(dataRoot, "agents", "dev.md")]);
    expect(plan.operations).toEqual([
      { source: path.join(seedRoot, "config.toml"), destination: path.join(dataRoot, "config.toml") },
      {
        source: path.join(seedRoot, "agents", "ceo-scripts", "goal-intake.md"),
        destination: path.join(dataRoot, "agents", "ceo-scripts", "goal-intake.md"),
      },
    ]);
  });
});
