import { describe, expect, it } from "vitest";
import {
  assertGoalLedgerState,
  applyGoalIntakeProposal,
  buildTaskAcceptanceFactKey,
  confirmGoalIntakeProposal,
  computeReadyMissingFields,
  createEmptyGoalLedgerState,
  evaluateIntegrationAcceptanceJoin,
  listArchivedPhaseReferences,
  markGoalReady,
  parseGoalLedgerState,
  projectActivePhaseContext,
  recordIntegrationAcceptanceEvent,
  recordTaskAcceptanceFact,
  resolveGoalIntakeProposal,
  switchActivePhase,
  upsertGoalIntakeDraft,
  withGoalLedgerEntry,
  type PhaseArtifactReference,
  type PhaseRecord,
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

  it("writes a pending goal-intake bundle without exposing active phase context", () => {
    const state = applyGoalIntakeProposal(createEmptyGoalLedgerState(), makeGoalIntakeProposalInput());

    expect(state.goals["goal-intake"]?.status).toBe("pending");
    expect(state.tasks["task-1"]?.status).toBe("pending");
    expect(state.phases["phase-1"]?.status).toBe("pending");
    expect(projectActivePhaseContext(state, { kind: "goal", id: "goal-intake" })).toEqual({
      status: "no-active",
      owner: { kind: "goal", id: "goal-intake" },
    });
    expect(resolveGoalIntakeProposal(state, "agent-moebius-goal-intake-proposal-key:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")?.tasks).toHaveLength(3);
  });

  it("treats identical goal-intake proposals as idempotent and conflicts as fail-closed", () => {
    const input = makeGoalIntakeProposalInput();
    const first = applyGoalIntakeProposal(createEmptyGoalLedgerState(), input);
    const second = applyGoalIntakeProposal(first, input);

    expect(second).toBe(first);
    expect(() =>
      applyGoalIntakeProposal(first, {
        ...input,
        goal: { ...input.goal, title: "冲突标题" },
      }),
    ).toThrow(/conflicting goals\/goal-intake/);
  });

  it("confirms a goal-intake proposal into ready entries and a single active phase", () => {
    const proposed = applyGoalIntakeProposal(createEmptyGoalLedgerState(), makeGoalIntakeProposalInput());
    const confirmed = confirmGoalIntakeProposal(proposed, {
      proposalKey: "agent-moebius-goal-intake-proposal-key:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      taskIds: ["task-1", "task-2", "task-3"],
      now: "2026-07-04T00:10:00.000Z",
      provenance: { ...makeProvenance(), note: "confirmed" },
    });

    expect(confirmed.goals["goal-intake"]?.status).toBe("ready");
    expect(confirmed.tasks["task-1"]?.status).toBe("ready");
    expect(confirmed.phases["phase-1"]).toMatchObject({
      status: "active",
      startedAt: "2026-07-04T00:10:00.000Z",
    });
    expect(projectActivePhaseContext(confirmed, { kind: "goal", id: "goal-intake" })).toMatchObject({
      status: "active",
      current: {
        phaseId: "phase-1",
        qualityBaseline: "demo",
      },
    });

    const repeated = confirmGoalIntakeProposal(confirmed, {
      proposalKey: "agent-moebius-goal-intake-proposal-key:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      taskIds: ["task-1", "task-2", "task-3"],
      now: "2026-07-04T00:20:00.000Z",
      provenance: { ...makeProvenance(), note: "confirmed again" },
    });
    expect(repeated.phases["phase-1"]?.startedAt).toBe("2026-07-04T00:10:00.000Z");
    expect(Object.values(repeated.phases).filter((phase) => phase.status === "active")).toHaveLength(1);
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

  it("phase switch archives old active phase and starts the target phase with timestamps", () => {
    const state = stateWithTaskPhases();
    const artifactRefs = [makeArtifactReference("run-manifest")];

    const switched = switchActivePhase(state, {
      owner: taskOwner(),
      targetPhaseId: "phase-next",
      archiveSummary: "方案阶段完成",
      artifactRefs,
      provenance: makeProvenance(),
      now: "2026-07-04T00:05:00.000Z",
    });

    expect(switched.phases["phase-current"]).toMatchObject({
      status: "completed",
      completedAt: "2026-07-04T00:05:00.000Z",
      archivedAt: "2026-07-04T00:05:00.000Z",
      archiveSummary: "方案阶段完成",
      artifactRefs,
    });
    expect(switched.phases["phase-next"]).toMatchObject({
      status: "active",
      startedAt: "2026-07-04T00:05:00.000Z",
    });
  });

  it("phase switch fails closed without archive inputs and records explicit no-artifact archives", () => {
    const state = stateWithTaskPhases();

    expect(() =>
      switchActivePhase(state, {
        owner: taskOwner(),
        targetPhaseId: "phase-next",
        artifactRefs: [],
        provenance: makeProvenance(),
        now: "2026-07-04T00:05:00.000Z",
      }),
    ).toThrow(/archiveSummary/);
    expect(state.phases["phase-current"]?.status).toBe("active");
    expect(state.phases["phase-next"]?.status).toBe("pending");

    expect(() =>
      switchActivePhase(state, {
        owner: taskOwner(),
        targetPhaseId: "phase-next",
        archiveSummary: "无产物归档",
        provenance: makeProvenance(),
        now: "2026-07-04T00:05:00.000Z",
      }),
    ).toThrow(/artifactRefs/);

    const switched = switchActivePhase(state, {
      owner: taskOwner(),
      targetPhaseId: "phase-next",
      archiveSummary: "无产物归档",
      artifactRefs: [],
      provenance: makeProvenance(),
      now: "2026-07-04T00:05:00.000Z",
    });
    expect(switched.phases["phase-current"]?.artifactRefs).toEqual([]);
  });

  it("phase switch is a deterministic no-op when the target phase is already the only active phase", () => {
    const state = stateWithTaskPhases();

    const switched = switchActivePhase(state, {
      owner: taskOwner(),
      targetPhaseId: "phase-current",
      archiveSummary: "should not be used",
      artifactRefs: [makeArtifactReference("path")],
      provenance: makeProvenance(),
      now: "2026-07-04T00:05:00.000Z",
    });

    expect(switched).toBe(state);
    expect(switched.phases["phase-current"]).toMatchObject({
      status: "active",
      startedAt: "2026-07-04T00:00:00.000Z",
    });
    expect(switched.phases["phase-current"]?.completedAt).toBeUndefined();
    expect(switched.phases["phase-current"]?.archiveSummary).toBeUndefined();
  });

  it("active phase context projection excludes old artifacts and uses the phase baseline", () => {
    const switched = switchActivePhase(stateWithTaskPhases("production"), {
      owner: taskOwner(),
      targetPhaseId: "phase-next",
      archiveSummary: "旧阶段归档",
      artifactRefs: [makeArtifactReference("path")],
      provenance: makeProvenance(),
      now: "2026-07-04T00:05:00.000Z",
    });

    expect(projectActivePhaseContext(switched, taskOwner())).toEqual({
      status: "active",
      current: {
        owner: taskOwner(),
        phaseId: "phase-next",
        phaseName: "实现阶段",
        objective: "实现阶段作用域隔离",
        qualityBaseline: "data-correct",
        acceptanceStatements: ["跑 pnpm test -- goal-ledger"],
        dependencies: [],
      },
    });
    expect(JSON.stringify(projectActivePhaseContext(switched, taskOwner()))).not.toContain("旧阶段归档");
    expect(JSON.stringify(projectActivePhaseContext(switched, taskOwner()))).not.toContain("docs/old-plan.md");
  });

  it("archived lookup returns completed phase summaries and references separately from current context", () => {
    const switched = switchActivePhase(stateWithTaskPhases(), {
      owner: taskOwner(),
      targetPhaseId: "phase-next",
      archiveSummary: "旧阶段归档",
      artifactRefs: [makeArtifactReference("path")],
      provenance: makeProvenance(),
      now: "2026-07-04T00:05:00.000Z",
    });

    expect(listArchivedPhaseReferences(switched, taskOwner())).toEqual([
      {
        owner: taskOwner(),
        phaseId: "phase-current",
        phaseName: "方案阶段",
        completedAt: "2026-07-04T00:05:00.000Z",
        archivedAt: "2026-07-04T00:05:00.000Z",
        archiveSummary: "旧阶段归档",
        artifactRefs: [makeArtifactReference("path")],
      },
    ]);
  });

  it("phase context fails closed for multiple active phases and returns no-active without fallback", () => {
    const noActive = withGoalLedgerEntry(readyTaskState(), "phases", "phase-pending", {
      ...makePhase("phase-pending", "pending", taskOwner()),
    });

    expect(projectActivePhaseContext(noActive, taskOwner())).toEqual({ status: "no-active", owner: taskOwner() });

    const invalid = withGoalLedgerEntry(
      withGoalLedgerEntry(readyTaskState(), "phases", "phase-a", makePhase("phase-a", "active", taskOwner())),
      "phases",
      "phase-b",
      makePhase("phase-b", "active", taskOwner()),
    );
    expect(() => assertGoalLedgerState(invalid)).toThrow(/multiple active phases/);
    expect(() => projectActivePhaseContext(invalid, taskOwner())).toThrow(/multiple active phases/);
    expect(() =>
      switchActivePhase(invalid, {
        owner: taskOwner(),
        targetPhaseId: "phase-a",
        provenance: makeProvenance(),
        now: NOW,
      }),
    ).toThrow(/multiple active phases/);
  });

  it("old T1 phase records parse but projection and switch fail closed without current fields", () => {
    const oldT1State = withGoalLedgerEntry(readyTaskState(), "phases", "old-phase", {
      id: "old-phase",
      owner: taskOwner(),
      name: "旧 T1 阶段",
      status: "active",
      qualityBaseline: "data-correct",
      startedAt: NOW,
      provenance: [makeProvenance()],
    });

    expect(() => parseGoalLedgerState(oldT1State)).not.toThrow();
    expect(() => projectActivePhaseContext(oldT1State, taskOwner())).toThrow(/missing objective/);
    expect(() =>
      switchActivePhase(oldT1State, {
        owner: taskOwner(),
        targetPhaseId: "old-phase",
        provenance: makeProvenance(),
        now: NOW,
      }),
    ).toThrow(/missing objective/);
  });

  it("different owners can each have one active phase while the same owner cannot have two", () => {
    const valid = withGoalLedgerEntry(
      withGoalLedgerEntry(readyTaskState(), "phases", "goal-phase", makePhase("goal-phase", "active", goalOwner())),
      "phases",
      "task-phase",
      makePhase("task-phase", "active", taskOwner()),
    );
    expect(() => assertGoalLedgerState(valid)).not.toThrow();

    const invalid = withGoalLedgerEntry(valid, "phases", "task-phase-2", makePhase("task-phase-2", "active", taskOwner()));
    expect(() => assertGoalLedgerState(invalid)).toThrow(/multiple active phases/);
  });

  it("typed artifact references accept bounded summaries and locators while rejecting unsafe payloads", () => {
    expect(() =>
      assertGoalLedgerState(
        withGoalLedgerEntry(readyTaskState(), "phases", "phase-artifacts", {
          ...makePhase("phase-artifacts", "completed", taskOwner()),
          archiveSummary: "归档",
          archivedAt: NOW,
          artifactRefs: [
            makeArtifactReference("run-manifest"),
            makeArtifactReference("acceptance-evidence"),
            makeArtifactReference("issue-comment"),
            makeArtifactReference("path"),
            makeArtifactReference("other"),
          ],
        }),
      ),
    ).not.toThrow();

    for (const artifactRef of [
      { ...makeArtifactReference("path"), path: "../secret.txt" },
      { ...makeArtifactReference("acceptance-evidence"), path: "/tmp/evidence.png" },
      { ...makeArtifactReference("other"), locator: "" },
      { ...makeArtifactReference("other"), locator: JSON.stringify({ body: "full run manifest" }) },
      { ...makeArtifactReference("other"), locator: "full comment body" },
      { ...makeArtifactReference("other"), summary: "" },
    ] as PhaseArtifactReference[]) {
      expect(() =>
        assertGoalLedgerState(
          withGoalLedgerEntry(readyTaskState(), "phases", "bad-artifact", {
            ...makePhase("bad-artifact", "completed", taskOwner()),
            artifactRefs: [artifactRef],
          }),
        ),
      ).toThrow();
    }
  });

  it("upserts child acceptance facts by a stable source key so repeated comments do not change join digest", () => {
    const state = stateWithGoalJoinChildren();
    const factInput = {
      taskId: "task-1",
      issue: { owner: "tranfu-labs", repo: "agent-moebius", number: 101 },
      role: "product-manager",
      status: "passed" as const,
      statementResults: [{ id: "1", status: "passed" as const, statement: "跑 task-1" }],
      messageIndex: 3,
      commentId: "comment-101-pass",
      capturedAt: "2026-07-04T00:10:00.000Z",
    };

    const once = recordTaskAcceptanceFact(state, factInput);
    const twice = recordTaskAcceptanceFact(once, { ...factInput, capturedAt: "2026-07-04T00:11:00.000Z" });

    expect(twice.tasks["task-1"]?.acceptanceFacts).toHaveLength(1);
    expect(twice.tasks["task-1"]?.acceptanceFacts?.[0]?.factKey).toBe(buildTaskAcceptanceFactKey(factInput));
  });

  it("evaluates integration acceptance join only when every in-scope child has a passed fact", () => {
    const state = stateWithGoalJoinChildren();
    const onePassed = recordTaskAcceptanceFact(state, {
      taskId: "task-1",
      issue: { owner: "tranfu-labs", repo: "agent-moebius", number: 101 },
      role: "product-manager",
      status: "passed",
      statementResults: [{ id: "1", status: "passed", statement: "跑 task-1" }],
      messageIndex: 3,
      commentId: "comment-101-pass",
      capturedAt: "2026-07-04T00:10:00.000Z",
    });

    expect(
      evaluateIntegrationAcceptanceJoin(onePassed, {
        owner: goalOwner(),
        parentIssue: { owner: "tranfu-labs", repo: "agent-moebius", number: 63 },
        reviewerRole: "product-manager",
      }),
    ).toMatchObject({
      status: "waiting",
      pending: [{ taskId: "task-2", issue: { number: 102 }, reason: "missing" }],
    });

    const allPassed = recordTaskAcceptanceFact(onePassed, {
      taskId: "task-2",
      issue: { owner: "tranfu-labs", repo: "agent-moebius", number: 102 },
      role: "product-manager",
      status: "passed",
      statementResults: [{ id: "1", status: "passed", statement: "跑 task-2" }],
      messageIndex: 4,
      commentId: "comment-102-pass",
      capturedAt: "2026-07-04T00:12:00.000Z",
    });
    const ready = evaluateIntegrationAcceptanceJoin(allPassed, {
      owner: goalOwner(),
      parentIssue: { owner: "tranfu-labs", repo: "agent-moebius", number: 63 },
      reviewerRole: "product-manager",
    });

    expect(ready).toMatchObject({
      status: "ready",
      phaseId: "goal-phase",
      reviewerRole: "product-manager",
      childPassFacts: [{ taskId: "task-1" }, { taskId: "task-2" }],
    });
    expect(ready.status === "ready" ? ready.joinKey : "").toContain("agent-moebius-integration-acceptance-key:");
  });

  it("records integration acceptance events idempotently by join key and status", () => {
    const state = stateWithGoalJoinChildren();
    const childPassDigest = "a".repeat(64);
    const targetAcceptanceDigest = "b".repeat(64);
    const once = recordIntegrationAcceptanceEvent(state, {
      phaseId: "goal-phase",
      parentIssue: { owner: "tranfu-labs", repo: "agent-moebius", number: 63 },
      reviewerRole: "product-manager",
      status: "requested",
      childPassDigest,
      targetAcceptanceDigest,
      capturedAt: "2026-07-04T00:10:00.000Z",
    });
    const twice = recordIntegrationAcceptanceEvent(once, {
      phaseId: "goal-phase",
      parentIssue: { owner: "tranfu-labs", repo: "agent-moebius", number: 63 },
      reviewerRole: "product-manager",
      status: "requested",
      childPassDigest,
      targetAcceptanceDigest,
      capturedAt: "2026-07-04T00:11:00.000Z",
      note: "retried",
    });

    expect(twice.phases["goal-phase"]?.integrationAcceptance).toHaveLength(1);
    expect(twice.phases["goal-phase"]?.integrationAcceptance?.[0]).toMatchObject({
      status: "requested",
      note: "retried",
    });
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

function readyTaskState(taskQualityBaseline: TaskRecord["qualityBaseline"] = "data-correct"): GoalLedgerState {
  return withGoalLedgerEntry(readyGoalState(), "tasks", "task-1", {
    id: "task-1",
    goalId: "goal-1",
    title: "阶段作用域隔离",
    status: "ready",
    scope: "goal-ledger phase scope isolation",
    acceptanceStatements: ["跑 pnpm test -- goal-ledger"],
    dependencies: [],
    qualityBaseline: taskQualityBaseline,
    phaseIds: [],
    childIssueRefs: [],
    runManifestRefs: [],
    provenance: [makeProvenance()],
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function stateWithTaskPhases(taskQualityBaseline: TaskRecord["qualityBaseline"] = "data-correct"): GoalLedgerState {
  return withGoalLedgerEntry(
    withGoalLedgerEntry(readyTaskState(taskQualityBaseline), "phases", "phase-current", {
      ...makePhase("phase-current", "active", taskOwner()),
      name: "方案阶段",
      objective: "写出阶段作用域隔离方案",
      startedAt: NOW,
    }),
    "phases",
    "phase-next",
    {
      ...makePhase("phase-next", "pending", taskOwner()),
      name: "实现阶段",
      objective: "实现阶段作用域隔离",
    },
  );
}

function stateWithGoalJoinChildren(): GoalLedgerState {
  const base = readyGoalState();
  const withTasks = withGoalLedgerEntry(
    withGoalLedgerEntry(base, "tasks", "task-1", {
      id: "task-1",
      goalId: "goal-1",
      title: "child 1",
      status: "ready",
      scope: "child 1",
      acceptanceStatements: ["跑 task-1"],
      dependencies: [],
      qualityBaseline: "data-correct",
      phaseIds: [],
      parentIssueRef: { owner: "tranfu-labs", repo: "agent-moebius", number: 63, relation: "parent", status: "open" },
      childIssueRefs: [{ owner: "tranfu-labs", repo: "agent-moebius", number: 101, relation: "child", status: "open" }],
      runManifestRefs: [],
      provenance: [makeProvenance()],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    "tasks",
    "task-2",
    {
      id: "task-2",
      goalId: "goal-1",
      title: "child 2",
      status: "ready",
      scope: "child 2",
      acceptanceStatements: ["跑 task-2"],
      dependencies: [],
      qualityBaseline: "data-correct",
      phaseIds: [],
      parentIssueRef: { owner: "tranfu-labs", repo: "agent-moebius", number: 63, relation: "parent", status: "open" },
      childIssueRefs: [{ owner: "tranfu-labs", repo: "agent-moebius", number: 102, relation: "child", status: "open" }],
      runManifestRefs: [],
      provenance: [makeProvenance()],
      createdAt: NOW,
      updatedAt: NOW,
    },
  );
  return withGoalLedgerEntry(withTasks, "phases", "goal-phase", {
    ...makePhase("goal-phase", "active", goalOwner()),
    acceptanceStatements: ["目标级验收 1", "目标级验收 2"],
  });
}

function makePhase(id: string, status: PhaseRecord["status"], owner: PhaseRecord["owner"]): PhaseRecord {
  return {
    id,
    owner,
    name: id,
    status,
    qualityBaseline: "data-correct",
    objective: `${id} objective`,
    acceptanceStatements: ["跑 pnpm test -- goal-ledger"],
    dependencies: [],
    provenance: [makeProvenance()],
  };
}

function goalOwner(): PhaseRecord["owner"] {
  return { kind: "goal", id: "goal-1" };
}

function taskOwner(): PhaseRecord["owner"] {
  return { kind: "task", id: "task-1" };
}

function makeArtifactReference(kind: PhaseArtifactReference["kind"]): PhaseArtifactReference {
  if (kind === "run-manifest") {
    return {
      kind,
      summary: "run manifest",
      locator: { kind: "jsonl-line", path: ".state/run-manifests.jsonl", line: 12 },
    };
  }
  if (kind === "acceptance-evidence") {
    return {
      kind,
      summary: "acceptance evidence",
      path: "artifacts/acceptance/t2.png",
    };
  }
  if (kind === "issue-comment") {
    return {
      kind,
      summary: "issue comment",
      issue: { owner: "tranfu-labs", repo: "agent-moebius", number: 65 },
      commentId: "IC_kwDOP",
    };
  }
  if (kind === "path") {
    return {
      kind,
      summary: "path ref",
      path: "docs/old-plan.md",
    };
  }
  return {
    kind,
    summary: "generic ref",
    locator: "artifact:t2",
  };
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

function makeGoalIntakeProposalInput(): Parameters<typeof applyGoalIntakeProposal>[1] {
  return {
    proposalKey: "agent-moebius-goal-intake-proposal-key:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourceIssue: { owner: "tranfu-labs", repo: "agent-moebius", number: 63 },
    messageIndex: 1,
    commentId: "comment-1",
    capturedAt: NOW,
    provenanceNote: "goal-intake proposal",
    goal: {
      id: "goal-intake",
      title: "支付宝 demo",
      summary: "做一个支付宝风格 demo",
      scope: "只做演示闭环",
      acceptanceStatements: ["跑 pnpm test -- goal-intake → 应退出码 0"],
      dependencies: [],
      qualityBaseline: "demo",
    },
    milestones: [
      { id: "ms-1", title: "阶段一", qualityBaseline: "demo" },
      { id: "ms-2", title: "阶段二", qualityBaseline: "demo" },
    ],
    phaseOne: {
      id: "phase-1",
      name: "阶段一",
      objective: "完成 demo 入口",
      acceptanceStatements: ["跑 pnpm test -- goal-intake → 应退出码 0"],
      dependencies: [],
      qualityBaseline: "demo",
    },
    tasks: ["task-1", "task-2", "task-3"].map((id) => ({
      id,
      milestoneId: "ms-1",
      title: `任务 ${id}`,
      scope: `实现 ${id}`,
      acceptanceStatements: [`跑 pnpm test -- ${id} → 应退出码 0`],
      dependencies: [],
      qualityBaseline: "demo" as const,
      provenance: "phase-one task",
    })),
  };
}

function makeProvenance(): LedgerProvenance {
  return {
    issue: { owner: "tranfu-labs", repo: "agent-moebius", number: 63 },
    messageIndex: 1,
    capturedAt: NOW,
  };
}
