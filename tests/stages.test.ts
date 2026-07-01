import { describe, expect, it } from "vitest";
import {
  ALL_STAGES,
  REFLECTOR_STAGES,
  isReflectorStage,
  isStage,
  parseStageMarkers,
  parseTrailingStageMarker,
} from "../src/stages.js";

describe("stages", () => {
  it("defines reflector stages as a subset of all stages", () => {
    expect(REFLECTOR_STAGES).toEqual(["plan-written", "code-verified"]);
    expect(ALL_STAGES).toEqual(["plan-written", "code-verified", "in-progress"]);
  });

  it("checks stage membership", () => {
    expect(isStage("in-progress")).toBe(true);
    expect(isStage("unknown")).toBe(false);
    expect(isReflectorStage("code-verified")).toBe(true);
    expect(isReflectorStage("in-progress")).toBe(false);
  });

  it("parses tolerant marker variants while preserving strict stage names", () => {
    expect(parseStageMarkers("done\n<!--  Agent-Moebius : stage = code-verified  -->")).toEqual(["code-verified"]);
    expect(parseStageMarkers("done\n<!-- agent-moebius:stage=Code-Verified -->")).toEqual([]);
  });

  it("requires trailing markers for CEO post-validation", () => {
    expect(parseTrailingStageMarker("body\n<!-- agent-moebius:stage=in-progress -->")).toBe("in-progress");
    expect(parseTrailingStageMarker("<!-- agent-moebius:stage=in-progress -->\nmore")).toBeNull();
  });
});
