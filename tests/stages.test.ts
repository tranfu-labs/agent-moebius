import { describe, expect, it } from "vitest";
import {
  ALL_STAGES,
  isStage,
  parseStageMarkers,
  parseTrailingStageMarker,
} from "../src/stages.js";

describe("stages", () => {
  it("defines all supported stages", () => {
    expect(ALL_STAGES).toEqual(["plan-written", "code-verified", "in-progress"]);
  });

  it("checks stage membership", () => {
    expect(isStage("in-progress")).toBe(true);
    expect(isStage("unknown")).toBe(false);
  });

  it("parses tolerant marker variants while preserving strict stage names", () => {
    expect(parseStageMarkers("done\n<!--  Moebius : stage = code-verified  -->")).toEqual(["code-verified"]);
    expect(parseStageMarkers("done\n<!-- moebius:stage=Code-Verified -->")).toEqual([]);
  });

  it("does not recognize the legacy marker namespace", () => {
    const legacyNamespace = ["agent", "moebius"].join("-");

    expect(parseStageMarkers(`done\n<!-- ${legacyNamespace}:stage=code-verified -->`)).toEqual([]);
  });

  it("requires trailing markers for CEO post-validation", () => {
    expect(parseTrailingStageMarker("body\n<!-- moebius:stage=in-progress -->")).toBe("in-progress");
    expect(parseTrailingStageMarker("<!-- moebius:stage=in-progress -->\nmore")).toBeNull();
  });
});
