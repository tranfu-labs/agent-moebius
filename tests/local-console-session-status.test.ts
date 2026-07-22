import { describe, expect, it } from "vitest";

import { resolveLocalSessionContinuation } from "../src/local-console/session-status.js";

describe("local console session continuation", () => {
  it.each([
    {
      name: "project folder unavailable",
      input: { projectDirectoryAvailable: false, agentTeamHealth: "usable" as const },
      expected: { kind: "project-unavailable", recoveryAction: "repair-project" },
    },
    {
      name: "team deleted",
      input: { projectDirectoryAvailable: true, agentTeamHealth: "deleted" as const },
      expected: { kind: "team-deleted", recoveryAction: "select-team" },
    },
    {
      name: "team needs repair",
      input: { projectDirectoryAvailable: true, agentTeamHealth: "needs-repair" as const },
      expected: { kind: "team-needs-repair", recoveryAction: "repair-or-select-team" },
    },
  ])("blocks $name with a distinct recovery", ({ input, expected }) => {
    expect(resolveLocalSessionContinuation(input)).toMatchObject({
      canContinue: false,
      ...expected,
    });
  });

  it("recovers automatically as soon as both project and team are usable", () => {
    expect(resolveLocalSessionContinuation({
      projectDirectoryAvailable: true,
      agentTeamHealth: "usable",
    })).toEqual({ canContinue: true, kind: "available", reason: null, recoveryAction: null });
  });

  it("keeps a missing project authoritative when the team is also unavailable", () => {
    expect(resolveLocalSessionContinuation({
      projectDirectoryAvailable: false,
      agentTeamHealth: "deleted",
    })).toMatchObject({ kind: "project-unavailable", recoveryAction: "repair-project" });
  });
});
