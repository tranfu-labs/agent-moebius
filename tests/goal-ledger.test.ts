import { describe, expect, it } from "vitest";
import {
  assertGoalLedgerState,
  computeReadyMissingFields,
  createEmptyGoalLedgerState,
  markGoalReady,
  parseGoalLedgerState,
  upsertGoalIntakeDraft,
  withGoalLedgerEntry,
  type GoalLedgerState,
  type IssueReference,
  type LedgerProvenance,
  type RunManifestReference,
  type TaskRecord,
} from "../src/goal-ledger.js";

const NOW = "2026-07-04T00:00:00.000Z";

describe("goal ledger", () => {
  it("admits partial goals as draft or pending with missing fields and provenance", () => {
    const result = upsertGoalIntakeDraft(createEmptyGoalLedgerState(), {
      goalId: "goal-1",
      title: "目标账本",
      summary: "沉淀本地事实源",
      provenance: makeProvenance(),
      nextQuestions: ["请补验收语句"],
      now: NOW,
    });

    expect(result.goal.status).toBe("draft");
    expect(result.missingFields).toEqual(["scope", "acceptanceStatements", "dependencies", "qualityBaseline"]);
    expect(result.goal.provenance).toEqual([makeProvenance()]);
    expect(result.goal.nextQuestions).toEqual(["请补验收语句"]);
    expect(() => markGoalReady(result.state, "goal-1", NOW)).toThrow(/missing scope,acceptanceStatements,dependencies,qualityBaseline/);
  });

  it("marks a goal ready only after required fields are present", () => {
    const draft = upsertGoalIntakeDraft(createEmptyGoalLedgerState(), {
      goalId: "goal-1",
      title: "目标账本",
      provenance: makeProvenance(),
      now: NOW,
    }).state;

    const completed = upsertGoalIntakeDraft(draft, {
      goalId: "goal-1",
      title: "目标账本",
      scope: "本地状态 schema 和 adapter",
      acceptanceStatements: ["跑 pnpm test -- goal-ledger"],
      dependencies: [],
      qualityBaseline: "data-correct",
      provenance: { ...makeProvenance(), messageIndex: 2 },
      now: "2026-07-04T00:01:00.000Z",
    });
    const ready = markGoalReady(completed.state, "goal-1", "2026-07-04T00:02:00.000Z");

    expect(ready.goals["goal-1"]?.status).toBe("ready");
    expect(ready.goals["goal-1"]?.missingFields).toEqual([]);
    expect(ready.goals["goal-1"]?.nextQuestions).toEqual([]);
  });

  it("validates entity references and ready invariants", () => {
    const state = readyGoalState();
    const invalidTask: TaskRecord = {
      id: "task-1",
      goalId: "missing-goal",
      title: "任务",
      status: "ready",
      scope: "scope",
      acceptanceStatements: ["accept"],
      dependencies: [],
      qualityBaseline: "data-correct",
      phaseIds: [],
      childIssueRefs: [],
      runManifestRefs: [],
      provenance: [makeProvenance()],
      createdAt: NOW,
      updatedAt: NOW,
    };

    expect(() => assertGoalLedgerState(withGoalLedgerEntry(state, "tasks", "task-1", invalidTask))).toThrow(
      /goalId missing/,
    );

    expect(() =>
      parseGoalLedgerState({
        ...state,
        goals: {
          "goal-1": {
            ...state.goals["goal-1"],
            acceptanceStatements: [],
          },
        },
      }),
    ).toThrow(/ready fields missing/);
  });

  it("accepts run manifest refs only when linked refs have a stable locator", () => {
    const linked: RunManifestReference = {
      locator: { kind: "jsonl-line", path: ".state/run-manifests.jsonl", line: 12 },
      issue: { owner: "tranfu-labs", repo: "agent-moebius", number: 63 },
      role: "dev",
      completedAt: NOW,
      stage: "code-verified",
      resolution: "linked",
    };
    const unresolved: RunManifestReference = {
      issue: { owner: "tranfu-labs", repo: "agent-moebius", number: 63 },
      role: "dev",
      completedAt: NOW,
      stage: "code-verified",
      resolution: "unresolved",
    };
    const state = withGoalLedgerEntry(readyGoalState(), "tasks", "task-1", {
      id: "task-1",
      goalId: "goal-1",
      title: "任务",
      status: "ready",
      scope: "scope",
      acceptanceStatements: ["accept"],
      dependencies: [],
      qualityBaseline: "data-correct",
      phaseIds: [],
      childIssueRefs: [makeIssueReference("child")],
      runManifestRefs: [linked, unresolved],
      provenance: [makeProvenance()],
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(() => assertGoalLedgerState(state)).not.toThrow();
    expect(() =>
      parseGoalLedgerState({
        ...state,
        tasks: {
          "task-1": {
            ...state.tasks["task-1"],
            runManifestRefs: [{ ...unresolved, resolution: "linked" }],
          },
        },
      }),
    ).toThrow(/locator/);
  });

  it("computes missing dependencies by field presence so an empty confirmed list is valid", () => {
    expect(
      computeReadyMissingFields({
        scope: "scope",
        acceptanceStatements: ["accept"],
        dependencies: [],
        qualityBaseline: "data-correct",
      }),
    ).toEqual([]);
  });
});

function readyGoalState(): GoalLedgerState {
  return markGoalReady(
    upsertGoalIntakeDraft(createEmptyGoalLedgerState(), {
      goalId: "goal-1",
      title: "目标账本",
      scope: "scope",
      acceptanceStatements: ["accept"],
      dependencies: [],
      qualityBaseline: "data-correct",
      issueRefs: [makeIssueReference("source")],
      provenance: makeProvenance(),
      now: NOW,
    }).state,
    "goal-1",
    NOW,
  );
}

function makeIssueReference(relation: IssueReference["relation"]): IssueReference {
  return {
    owner: "tranfu-labs",
    repo: "agent-moebius",
    number: 63,
    relation,
    status: "open",
  };
}

function makeProvenance(): LedgerProvenance {
  return {
    issue: { owner: "tranfu-labs", repo: "agent-moebius", number: 63 },
    messageIndex: 1,
    capturedAt: NOW,
  };
}
