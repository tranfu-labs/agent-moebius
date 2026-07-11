import { describe, expect, it } from "vitest";
import { DESKTOP_RUNNER_ARGS, DESKTOP_RUNNER_MODE } from "../src/runner-launch.js";

describe("desktop runner launch", () => {
  it("keeps the supervised child in explicit GitHub mode", () => {
    expect(DESKTOP_RUNNER_MODE).toBe("github");
    expect(DESKTOP_RUNNER_ARGS).toEqual(["--github-mode"]);
  });
});
