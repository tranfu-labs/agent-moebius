import { describe, expect, it } from "vitest";
import { resolveCeoLedgerPromptContext } from "../src/agent-prescripts/ceo-ledger-context.js";
import { createEmptyGoalLedgerState, withGoalLedgerEntry, type GoalLedgerState } from "../src/goal-ledger.js";
import { makeIssueSource } from "../src/issue-source.js";

const source = makeIssueSource({ owner: "tranfu-labs", repo: "agent-moebius", issueNumber: 77 });

describe("CEO ledger context prescript", () => {
  it("returns intake bootstrap context for a loadable issue with no active ledger owner", () => {
    const context = resolveCeoLedgerPromptContext({
      ledger: createEmptyGoalLedgerState(),
      source,
      scriptsPrompt: "goal-intake script",
    });

    expect(context.mode).toBe("intakeBootstrap");
    expect(context.visibleTasks).toEqual([]);
    expect(context.promptContext).toContain("Mode: intake bootstrap");
    expect(context.promptContext).toContain("goal_intake.propose");
  });

  it("keeps malformed multiple active owner candidates fail-closed", () => {
    const ledger = withGoalLedgerEntry(
      withGoalLedgerEntry(baseLedger(), "phases", "phase-a", {
        id: "phase-a",
        owner: { kind: "goal", id: "goal-1" },
        name: "phase a",
        status: "active",
        qualityBaseline: "demo",
        objective: "a",
        acceptanceStatements: ["a"],
        dependencies: [],
        provenance: [{ issue: { owner: source.owner, repo: source.repo, number: source.issueNumber }, messageIndex: 0, capturedAt: "2026-07-04T00:00:00.000Z" }],
      }),
      "phases",
      "phase-b",
      {
        id: "phase-b",
        owner: { kind: "goal", id: "goal-2" },
        name: "phase b",
        status: "active",
        qualityBaseline: "demo",
        objective: "b",
        acceptanceStatements: ["b"],
        dependencies: [],
        provenance: [{ issue: { owner: source.owner, repo: source.repo, number: source.issueNumber }, messageIndex: 0, capturedAt: "2026-07-04T00:00:00.000Z" }],
      },
    );

    expect(() =>
      resolveCeoLedgerPromptContext({
        ledger,
        source,
        scriptsPrompt: "scripts",
      }),
    ).toThrow(/active-candidates=2/);
  });
});

function baseLedger(): GoalLedgerState {
  const now = "2026-07-04T00:00:00.000Z";
  const makeGoal = (id: string) => ({
    id,
    title: id,
    status: "ready" as const,
    scope: id,
    acceptanceStatements: [id],
    dependencies: [],
    qualityBaseline: "demo" as const,
    issueRefs: [{ owner: source.owner, repo: source.repo, number: source.issueNumber, relation: "source" as const, status: "open" as const }],
    milestoneIds: [],
    provenance: [{ issue: { owner: source.owner, repo: source.repo, number: source.issueNumber }, messageIndex: 0, capturedAt: now }],
    missingFields: [],
    nextQuestions: [],
    createdAt: now,
    updatedAt: now,
  });
  return {
    schemaVersion: 1,
    goals: {
      "goal-1": makeGoal("goal-1"),
      "goal-2": makeGoal("goal-2"),
    },
    milestones: {},
    tasks: {},
    phases: {},
  };
}
