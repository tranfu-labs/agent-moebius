import crypto from "node:crypto";

export type QualityBaseline = "demo" | "data-correct" | "production";
export type LedgerReadinessStatus = "draft" | "pending" | "ready";
export type PhaseStatus = "pending" | "active" | "completed";
export type IssueRelation = "source" | "parent" | "child" | "acceptance" | "implementation";
export type IssueReferenceStatus = "planned" | "open" | "closed" | "unknown";
export type MissingGoalField = "scope" | "acceptanceStatements" | "dependencies" | "qualityBaseline";
export type GoalLedgerEntryKind = "goals" | "milestones" | "tasks" | "phases";
export type RunManifestStage = "plan-written" | "code-verified" | "in-progress" | "unknown";
export type PhaseOwner = { kind: "goal" | "milestone" | "task"; id: string };

const MAX_PHASE_ARTIFACT_SUMMARY_LENGTH = 500;
const MAX_PHASE_ARTIFACT_LOCATOR_LENGTH = 500;
const MAX_ISSUE_REFERENCE_NOTE_LENGTH = 500;
const MAX_ACCEPTANCE_NOTE_LENGTH = 500;
const MAX_ACCEPTANCE_STATEMENT_ID_LENGTH = 200;
const MAX_ACCEPTANCE_STATEMENT_TEXT_LENGTH = 2_000;

export const INTEGRATION_ACCEPTANCE_KEY_PREFIX = "agent-moebius-integration-acceptance-key";

export interface IssueReference {
  owner: string;
  repo: string;
  number: number;
  relation: IssueRelation;
  status: IssueReferenceStatus;
  note?: string;
}

export interface LedgerProvenance {
  issue: {
    owner: string;
    repo: string;
    number: number;
  };
  messageIndex: number;
  commentId?: string;
  capturedAt: string;
  note?: string;
}

export type AcceptanceFactStatus = "passed" | "failed";
export type IntegrationAcceptanceStatus = "requested" | "passed" | "failed" | "blocked";

export interface AcceptanceStatementResult {
  id: string;
  status: AcceptanceFactStatus;
  statement?: string;
}

export interface TaskAcceptanceRecord {
  factKey: string;
  issue: {
    owner: string;
    repo: string;
    number: number;
  };
  role: string;
  status: AcceptanceFactStatus;
  statementResults: AcceptanceStatementResult[];
  messageIndex: number;
  commentId?: string;
  capturedAt: string;
  note?: string;
}

export interface IntegrationAcceptanceRecord {
  joinKey: string;
  phaseId: string;
  parentIssue: {
    owner: string;
    repo: string;
    number: number;
  };
  reviewerRole: string;
  status: IntegrationAcceptanceStatus;
  childPassDigest: string;
  targetAcceptanceDigest: string;
  sourceComment?: {
    issue: {
      owner: string;
      repo: string;
      number: number;
    };
    messageIndex: number;
    commentId?: string;
  };
  failedStatementIds?: string[];
  repairTaskIds?: string[];
  capturedAt: string;
  note?: string;
}

export type RunManifestLocator =
  | { kind: "jsonl-line"; path: ".state/run-manifests.jsonl"; line: number }
  | { kind: "run-dir"; runDir: string };

export type RunManifestReference =
  | {
      locator: RunManifestLocator;
      issue: { owner: string; repo: string; number: number };
      role: string;
      completedAt: string;
      stage: RunManifestStage;
      resolution: "linked" | "missing";
    }
  | {
      locator?: undefined;
      issue: { owner: string; repo: string; number: number };
      role: string;
      completedAt: string;
      stage: RunManifestStage;
      resolution: "unresolved";
    };

export type PhaseArtifactReference =
  | {
      kind: "run-manifest";
      summary: string;
      locator: RunManifestLocator;
    }
  | {
      kind: "acceptance-evidence";
      summary: string;
      path: string;
    }
  | {
      kind: "issue-comment";
      summary: string;
      issue: { owner: string; repo: string; number: number };
      commentId?: string;
      url?: string;
    }
  | {
      kind: "path";
      summary: string;
      path: string;
    }
  | {
      kind: "other";
      summary: string;
      locator: string;
    };

export interface GoalRecord {
  id: string;
  title: string;
  status: LedgerReadinessStatus;
  summary?: string;
  scope?: string;
  acceptanceStatements?: string[];
  dependencies?: string[];
  qualityBaseline?: QualityBaseline;
  issueRefs: IssueReference[];
  milestoneIds: string[];
  provenance: LedgerProvenance[];
  missingFields: MissingGoalField[];
  nextQuestions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneRecord {
  id: string;
  goalId: string;
  title: string;
  qualityBaseline: QualityBaseline;
  taskIds: string[];
  phaseIds: string[];
  issueRefs: IssueReference[];
  provenance: LedgerProvenance[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecord {
  id: string;
  goalId: string;
  milestoneId?: string;
  title: string;
  status: LedgerReadinessStatus;
  scope?: string;
  acceptanceStatements?: string[];
  dependencies?: string[];
  qualityBaseline?: QualityBaseline;
  phaseIds: string[];
  parentIssueRef?: IssueReference;
  childIssueRefs: IssueReference[];
  acceptanceFacts?: TaskAcceptanceRecord[];
  runManifestRefs: RunManifestReference[];
  provenance: LedgerProvenance[];
  createdAt: string;
  updatedAt: string;
}

export interface PhaseRecord {
  id: string;
  owner: PhaseOwner;
  name: string;
  status: PhaseStatus;
  qualityBaseline: QualityBaseline;
  objective?: string;
  acceptanceStatements?: string[];
  dependencies?: string[];
  artifactRefs?: PhaseArtifactReference[];
  integrationAcceptance?: IntegrationAcceptanceRecord[];
  archiveSummary?: string;
  archivedAt?: string;
  startedAt?: string;
  completedAt?: string;
  provenance: LedgerProvenance[];
}

export interface GoalLedgerState {
  schemaVersion: 1;
  goals: Record<string, GoalRecord>;
  milestones: Record<string, MilestoneRecord>;
  tasks: Record<string, TaskRecord>;
  phases: Record<string, PhaseRecord>;
}

export type GoalLedgerEntry = GoalRecord | MilestoneRecord | TaskRecord | PhaseRecord;

export interface GoalIntakeDraftInput {
  goalId: string;
  title: string;
  summary?: string;
  scope?: string;
  acceptanceStatements?: string[];
  dependencies?: string[];
  qualityBaseline?: QualityBaseline;
  issueRefs?: IssueReference[];
  provenance: LedgerProvenance;
  nextQuestions?: string[];
  now: string;
}

export interface GoalIntakeDraftResult {
  state: GoalLedgerState;
  goal: GoalRecord;
  missingFields: MissingGoalField[];
}

export interface GoalIntakeProposalLedgerInput {
  proposalKey: string;
  sourceIssue: LedgerProvenance["issue"];
  messageIndex: number;
  commentId?: string;
  capturedAt: string;
  provenanceNote: string;
  goal: {
    id: string;
    title: string;
    summary: string;
    scope: string;
    acceptanceStatements: string[];
    dependencies: string[];
    qualityBaseline: QualityBaseline;
  };
  milestones: Array<{
    id: string;
    title: string;
    qualityBaseline: QualityBaseline;
  }>;
  phaseOne: {
    id: string;
    name: string;
    objective: string;
    acceptanceStatements: string[];
    dependencies: string[];
    qualityBaseline: QualityBaseline;
  };
  tasks: Array<{
    id: string;
    milestoneId: string;
    title: string;
    scope: string;
    acceptanceStatements: string[];
    dependencies: string[];
    qualityBaseline: QualityBaseline;
    provenance: string;
  }>;
}

export interface GoalIntakeConfirmLedgerInput {
  proposalKey: string;
  taskIds: string[];
  now: string;
  provenance: LedgerProvenance;
}

export interface GoalIntakeProposalBundle {
  proposalKey: string;
  goal: GoalRecord;
  milestones: MilestoneRecord[];
  phase: PhaseRecord;
  tasks: TaskRecord[];
}

export interface SwitchActivePhaseInput {
  owner: PhaseOwner;
  targetPhaseId: string;
  now: string;
  provenance: LedgerProvenance;
  archiveSummary?: string;
  artifactRefs?: PhaseArtifactReference[];
}

export type ActivePhaseContextProjection =
  | {
      status: "active";
      current: {
        owner: PhaseOwner;
        phaseId: string;
        phaseName: string;
        objective: string;
        qualityBaseline: QualityBaseline;
        acceptanceStatements: string[];
        dependencies: string[];
      };
    }
  | {
      status: "no-active";
      owner: PhaseOwner;
    };

export interface ArchivedPhaseReference {
  owner: PhaseOwner;
  phaseId: string;
  phaseName: string;
  completedAt?: string;
  archivedAt?: string;
  archiveSummary?: string;
  artifactRefs: PhaseArtifactReference[];
}

export interface RecordTaskAcceptanceFactInput {
  taskId: string;
  issue: TaskAcceptanceRecord["issue"];
  role: string;
  status: AcceptanceFactStatus;
  statementResults: AcceptanceStatementResult[];
  messageIndex: number;
  commentId?: string;
  capturedAt: string;
  note?: string;
}

export interface EvaluateIntegrationAcceptanceJoinInput {
  owner: PhaseOwner;
  parentIssue: IntegrationAcceptanceRecord["parentIssue"];
  reviewerRole: string;
}

export type IntegrationAcceptanceJoinEvaluation =
  | {
      status: "ready";
      owner: PhaseOwner;
      phaseId: string;
      parentIssue: IntegrationAcceptanceRecord["parentIssue"];
      reviewerRole: string;
      acceptanceStatements: string[];
      childPassFacts: Array<{ taskId: string; fact: TaskAcceptanceRecord }>;
      joinKey: string;
      childPassDigest: string;
      targetAcceptanceDigest: string;
    }
  | {
      status: "waiting";
      owner: PhaseOwner;
      phaseId: string;
      pending: Array<{ taskId: string; issue: TaskAcceptanceRecord["issue"]; reason: "missing" | "failed" }>;
    }
  | {
      status: "blocked";
      owner: PhaseOwner;
      reason: string;
    };

export interface RecordIntegrationAcceptanceEventInput {
  phaseId: string;
  parentIssue: IntegrationAcceptanceRecord["parentIssue"];
  reviewerRole: string;
  status: IntegrationAcceptanceStatus;
  childPassDigest: string;
  targetAcceptanceDigest: string;
  sourceComment?: IntegrationAcceptanceRecord["sourceComment"];
  failedStatementIds?: string[];
  repairTaskIds?: string[];
  capturedAt: string;
  note?: string;
  joinKey?: string;
}

export function createEmptyGoalLedgerState(): GoalLedgerState {
  return {
    schemaVersion: 1,
    goals: {},
    milestones: {},
    tasks: {},
    phases: {},
  };
}

export function upsertGoalIntakeDraft(state: GoalLedgerState, input: GoalIntakeDraftInput): GoalIntakeDraftResult {
  assertGoalLedgerState(state);
  assertNonEmptyString(input.goalId, "goalId");
  assertNonEmptyString(input.title, "title");
  assertLedgerProvenance(input.provenance, "provenance");
  assertIsoLikeString(input.now, "now");

  const existing = state.goals[input.goalId];
  const merged: GoalRecord = {
    id: input.goalId,
    title: input.title,
    status: existing?.status ?? "draft",
    summary: input.summary ?? existing?.summary,
    scope: input.scope ?? existing?.scope,
    acceptanceStatements: input.acceptanceStatements ?? existing?.acceptanceStatements,
    dependencies: input.dependencies ?? existing?.dependencies,
    qualityBaseline: input.qualityBaseline ?? existing?.qualityBaseline,
    issueRefs: mergeIssueRefs(existing?.issueRefs ?? [], input.issueRefs ?? []),
    milestoneIds: existing?.milestoneIds ?? [],
    provenance: [...(existing?.provenance ?? []), input.provenance],
    missingFields: [],
    nextQuestions: input.nextQuestions ?? existing?.nextQuestions ?? [],
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  };
  const missingFields = computeReadyMissingFields(merged);
  merged.missingFields = missingFields;
  if (merged.status !== "ready") {
    merged.status = existing === undefined ? "draft" : "pending";
  }
  if (merged.status === "ready" && missingFields.length > 0) {
    merged.status = "pending";
  }

  const nextState = withGoalLedgerEntry(state, "goals", merged.id, merged);
  assertGoalLedgerState(nextState);
  return { state: nextState, goal: merged, missingFields };
}

export function applyGoalIntakeProposal(state: GoalLedgerState, input: GoalIntakeProposalLedgerInput): GoalLedgerState {
  assertGoalLedgerState(state);
  assertGoalIntakeProposalInput(input);

  const provenance = goalIntakeLedgerProvenance(input, input.provenanceNote);
  const issueRef: IssueReference = {
    owner: input.sourceIssue.owner,
    repo: input.sourceIssue.repo,
    number: input.sourceIssue.number,
    relation: "source",
    status: "open",
    note: input.proposalKey,
  };
  const parentRef: IssueReference = {
    ...issueRef,
    relation: "parent",
  };

  let nextState = state;
  const goal: GoalRecord = {
    id: input.goal.id,
    title: input.goal.title,
    status: "pending",
    summary: input.goal.summary,
    scope: input.goal.scope,
    acceptanceStatements: input.goal.acceptanceStatements,
    dependencies: input.goal.dependencies,
    qualityBaseline: input.goal.qualityBaseline,
    issueRefs: [issueRef],
    milestoneIds: input.milestones.map((milestone) => milestone.id),
    provenance: [provenance],
    missingFields: [],
    nextQuestions: [],
    createdAt: input.capturedAt,
    updatedAt: input.capturedAt,
  };
  goal.missingFields = computeReadyMissingFields(goal);
  nextState = upsertGoalIntakeProposalEntry(nextState, "goals", goal.id, goal, input.proposalKey);

  for (const milestoneInput of input.milestones) {
    const taskIds = input.tasks.filter((task) => task.milestoneId === milestoneInput.id).map((task) => task.id);
    const milestone: MilestoneRecord = {
      id: milestoneInput.id,
      goalId: input.goal.id,
      title: milestoneInput.title,
      qualityBaseline: milestoneInput.qualityBaseline,
      taskIds,
      phaseIds: [input.phaseOne.id],
      issueRefs: [issueRef],
      provenance: [provenance],
      createdAt: input.capturedAt,
      updatedAt: input.capturedAt,
    };
    nextState = upsertGoalIntakeProposalEntry(nextState, "milestones", milestone.id, milestone, input.proposalKey);
  }

  for (const taskInput of input.tasks) {
    const taskProvenance = goalIntakeLedgerProvenance(input, taskInput.provenance);
    const task: TaskRecord = {
      id: taskInput.id,
      goalId: input.goal.id,
      milestoneId: taskInput.milestoneId,
      title: taskInput.title,
      status: "pending",
      scope: taskInput.scope,
      acceptanceStatements: taskInput.acceptanceStatements,
      dependencies: taskInput.dependencies,
      qualityBaseline: taskInput.qualityBaseline,
      phaseIds: [input.phaseOne.id],
      parentIssueRef: parentRef,
      childIssueRefs: [],
      runManifestRefs: [],
      provenance: [taskProvenance],
      createdAt: input.capturedAt,
      updatedAt: input.capturedAt,
    };
    nextState = upsertGoalIntakeProposalEntry(nextState, "tasks", task.id, task, input.proposalKey);
  }

  const phase: PhaseRecord = {
    id: input.phaseOne.id,
    owner: { kind: "goal", id: input.goal.id },
    name: input.phaseOne.name,
    status: "pending",
    qualityBaseline: input.phaseOne.qualityBaseline,
    objective: input.phaseOne.objective,
    acceptanceStatements: input.phaseOne.acceptanceStatements,
    dependencies: input.phaseOne.dependencies,
    provenance: [provenance],
  };
  nextState = upsertGoalIntakeProposalEntry(nextState, "phases", phase.id, phase, input.proposalKey);

  assertGoalLedgerState(nextState);
  return nextState;
}

export function confirmGoalIntakeProposal(state: GoalLedgerState, input: GoalIntakeConfirmLedgerInput): GoalLedgerState {
  assertGoalLedgerState(state);
  assertGoalIntakeProposalKey(input.proposalKey, "proposalKey");
  assertStringArray(input.taskIds, "taskIds");
  if (input.taskIds.length === 0 || !input.taskIds.every(isNonEmptyString)) {
    throw new Error("Invalid goal intake confirm: taskIds invalid");
  }
  assertIsoLikeString(input.now, "now");
  assertLedgerProvenance(input.provenance, "provenance");

  const bundle = resolveGoalIntakeProposal(state, input.proposalKey);
  if (bundle === null) {
    throw new Error(`Invalid goal intake confirm: missing proposal ${input.proposalKey}`);
  }
  const expectedTaskIds = bundle.tasks.map((task) => task.id).sort();
  const providedTaskIds = [...new Set(input.taskIds)].sort();
  if (expectedTaskIds.join("\n") !== providedTaskIds.join("\n")) {
    throw new Error(`Invalid goal intake confirm: task mismatch expected=${expectedTaskIds.join(",")} actual=${providedTaskIds.join(",")}`);
  }
  if (!(bundle.goal.status === "pending" || bundle.goal.status === "ready")) {
    throw new Error(`Invalid goal intake confirm: goal status ${bundle.goal.status}`);
  }
  if (!(bundle.phase.status === "pending" || bundle.phase.status === "active")) {
    throw new Error(`Invalid goal intake confirm: phase status ${bundle.phase.status}`);
  }

  let nextState = state;
  if (bundle.goal.status !== "ready") {
    nextState = markGoalReady(nextState, bundle.goal.id, input.now);
  }
  for (const task of bundle.tasks) {
    const current = nextState.tasks[task.id];
    if (current === undefined) {
      throw new Error(`Invalid goal intake confirm: missing task ${task.id}`);
    }
    const missing = computeReadyMissingFields(current);
    if (missing.length > 0) {
      throw new Error(`Invalid goal intake confirm: task ${task.id} missing ${missing.join(",")}`);
    }
    if (current.status !== "ready") {
      nextState = withGoalLedgerEntry(nextState, "tasks", task.id, {
        ...current,
        status: "ready",
        updatedAt: input.now,
      });
    }
  }

  nextState = switchActivePhase(nextState, {
    owner: bundle.phase.owner,
    targetPhaseId: bundle.phase.id,
    now: input.now,
    provenance: input.provenance,
  });
  assertGoalLedgerState(nextState);
  return nextState;
}

export function resolveGoalIntakeProposal(state: GoalLedgerState, proposalKey: string): GoalIntakeProposalBundle | null {
  assertGoalLedgerState(state);
  assertGoalIntakeProposalKey(proposalKey, "proposalKey");
  const goals = Object.values(state.goals).filter((goal) => goalLedgerEntryHasNote(goal, proposalKey));
  const phases = Object.values(state.phases).filter((phase) => goalLedgerEntryHasNote(phase, proposalKey));
  if (goals.length !== 1 || phases.length !== 1) {
    return null;
  }
  const goal = goals[0]!;
  const phase = phases[0]!;
  if (phase.owner.kind !== "goal" || phase.owner.id !== goal.id) {
    return null;
  }
  const tasks = Object.values(state.tasks).filter((task) => goalLedgerEntryHasNote(task, proposalKey) && task.goalId === goal.id);
  const milestones = Object.values(state.milestones).filter((milestone) => goalLedgerEntryHasNote(milestone, proposalKey) && milestone.goalId === goal.id);
  if (tasks.length === 0 || milestones.length === 0) {
    return null;
  }
  return {
    proposalKey,
    goal,
    milestones: milestones.sort((left, right) => left.id.localeCompare(right.id)),
    phase,
    tasks: tasks.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function markGoalReady(state: GoalLedgerState, goalId: string, now: string): GoalLedgerState {
  assertGoalLedgerState(state);
  assertIsoLikeString(now, "now");
  const goal = state.goals[goalId];
  if (goal === undefined) {
    throw new Error(`Invalid goal ledger state: missing goal ${goalId}`);
  }

  const missingFields = computeReadyMissingFields(goal);
  if (missingFields.length > 0) {
    throw new Error(`Invalid goal ready state: missing ${missingFields.join(",")}`);
  }

  const readyGoal: GoalRecord = {
    ...goal,
    status: "ready",
    missingFields: [],
    nextQuestions: [],
    updatedAt: now,
  };
  const nextState = withGoalLedgerEntry(state, "goals", goalId, readyGoal);
  assertGoalLedgerState(nextState);
  return nextState;
}

export function computeReadyMissingFields(record: Pick<GoalRecord | TaskRecord, "scope" | "acceptanceStatements" | "dependencies" | "qualityBaseline">): MissingGoalField[] {
  const missing: MissingGoalField[] = [];
  if (!isNonEmptyString(record.scope)) {
    missing.push("scope");
  }
  if (!Array.isArray(record.acceptanceStatements) || record.acceptanceStatements.filter(isNonEmptyString).length === 0) {
    missing.push("acceptanceStatements");
  }
  if (!Array.isArray(record.dependencies)) {
    missing.push("dependencies");
  }
  if (!isQualityBaseline(record.qualityBaseline)) {
    missing.push("qualityBaseline");
  }
  return missing;
}

export function withGoalLedgerEntry(
  state: GoalLedgerState,
  kind: GoalLedgerEntryKind,
  id: string,
  entry: GoalLedgerEntry | null,
): GoalLedgerState {
  assertNonEmptyString(id, "id");
  if (entry !== null && entry.id !== id) {
    throw new Error(`Invalid goal ledger entry: id mismatch for ${kind}/${id}`);
  }

  const nextCollection = { ...state[kind] } as Record<string, GoalLedgerEntry>;
  if (entry === null) {
    delete nextCollection[id];
  } else {
    nextCollection[id] = entry;
  }

  return {
    ...state,
    [kind]: nextCollection,
  };
}

export function switchActivePhase(state: GoalLedgerState, input: SwitchActivePhaseInput): GoalLedgerState {
  assertGoalLedgerState(state);
  assertPhaseOwner(input.owner, "owner");
  assertNonEmptyString(input.targetPhaseId, "targetPhaseId");
  assertIsoLikeString(input.now, "now");
  assertLedgerProvenance(input.provenance, "provenance");
  assertOwnerExists(state, input.owner, "owner");

  const target = state.phases[input.targetPhaseId];
  if (target === undefined) {
    throw new Error(`Invalid phase switch: missing target phase ${input.targetPhaseId}`);
  }
  if (!samePhaseOwner(target.owner, input.owner)) {
    throw new Error(`Invalid phase switch: target phase owner mismatch`);
  }

  const activePhases = findActivePhasesForOwner(state, input.owner);
  if (activePhases.length > 1) {
    throw new Error(`Invalid phase switch: multiple active phases for ${phaseOwnerKey(input.owner)}`);
  }

  assertPhaseHasCurrentContextFields(target, "target phase");

  const currentActive = activePhases[0];
  if (currentActive?.id === target.id) {
    return state;
  }
  if (target.status === "completed") {
    throw new Error(`Invalid phase switch: target phase already completed`);
  }

  let nextState = state;
  if (currentActive !== undefined) {
    assertArchiveInput(input.archiveSummary, input.artifactRefs);
    const completedPhase: PhaseRecord = {
      ...currentActive,
      status: "completed",
      completedAt: input.now,
      archiveSummary: input.archiveSummary,
      archivedAt: input.now,
      artifactRefs: input.artifactRefs,
      provenance: [...currentActive.provenance, input.provenance],
    };
    nextState = withGoalLedgerEntry(nextState, "phases", completedPhase.id, completedPhase);
  }

  const { completedAt: _completedAt, archiveSummary: _archiveSummary, archivedAt: _archivedAt, ...targetRest } = target;
  const activeTarget: PhaseRecord = {
    ...targetRest,
    status: "active",
    startedAt: target.startedAt ?? input.now,
    provenance: [...target.provenance, input.provenance],
  };
  nextState = withGoalLedgerEntry(nextState, "phases", activeTarget.id, activeTarget);
  assertGoalLedgerState(nextState);
  return nextState;
}

export function projectActivePhaseContext(state: GoalLedgerState, owner: PhaseOwner): ActivePhaseContextProjection {
  assertGoalLedgerState(state);
  assertPhaseOwner(owner, "owner");
  assertOwnerExists(state, owner, "owner");
  const activePhases = findActivePhasesForOwner(state, owner);
  if (activePhases.length > 1) {
    throw new Error(`Invalid phase context projection: multiple active phases for ${phaseOwnerKey(owner)}`);
  }
  const active = activePhases[0];
  if (active === undefined) {
    return { status: "no-active", owner };
  }

  const current = getPhaseCurrentContext(active);
  return {
    status: "active",
    current: {
      owner: active.owner,
      phaseId: active.id,
      phaseName: active.name,
      objective: current.objective,
      qualityBaseline: active.qualityBaseline,
      acceptanceStatements: current.acceptanceStatements,
      dependencies: current.dependencies,
    },
  };
}

export function listArchivedPhaseReferences(state: GoalLedgerState, owner: PhaseOwner): ArchivedPhaseReference[] {
  assertGoalLedgerState(state);
  assertPhaseOwner(owner, "owner");
  assertOwnerExists(state, owner, "owner");

  return Object.values(state.phases)
    .filter((phase) => phase.status === "completed" && samePhaseOwner(phase.owner, owner))
    .map((phase) => ({
      owner: phase.owner,
      phaseId: phase.id,
      phaseName: phase.name,
      completedAt: phase.completedAt,
      archivedAt: phase.archivedAt,
      archiveSummary: phase.archiveSummary,
      artifactRefs: phase.artifactRefs ?? [],
    }));
}

export function recordTaskAcceptanceFact(
  state: GoalLedgerState,
  input: RecordTaskAcceptanceFactInput,
): GoalLedgerState {
  assertGoalLedgerState(state);
  assertNonEmptyString(input.taskId, "taskId");
  assertIssueLike(input.issue, "issue");
  assertNonEmptyString(input.role, "role");
  assertAcceptanceFactStatus(input.status, "status");
  assertAcceptanceStatementResults(input.statementResults, "statementResults");
  if (!isNonNegativeInteger(input.messageIndex)) {
    throw new Error("Invalid task acceptance fact: messageIndex invalid");
  }
  assertOptionalNonEmptyString(input.commentId, "commentId");
  assertIsoLikeString(input.capturedAt, "capturedAt");
  assertOptionalAcceptanceNote(input.note, "note");

  const task = state.tasks[input.taskId];
  if (task === undefined) {
    throw new Error(`Invalid task acceptance fact: missing task ${input.taskId}`);
  }
  if (!task.childIssueRefs.some((reference) => issueReferenceMatchesIssue(reference, input.issue) && reference.relation === "child")) {
    throw new Error(`Invalid task acceptance fact: issue is not a child ref for ${input.taskId}`);
  }

  const factKey = buildTaskAcceptanceFactKey(input);
  const fact: TaskAcceptanceRecord = {
    factKey,
    issue: input.issue,
    role: input.role,
    status: input.status,
    statementResults: input.statementResults,
    messageIndex: input.messageIndex,
    ...(input.commentId === undefined ? {} : { commentId: input.commentId }),
    capturedAt: input.capturedAt,
    ...(input.note === undefined ? {} : { note: input.note }),
  };
  const existingFacts = task.acceptanceFacts ?? [];
  const withoutDuplicate = existingFacts.filter((existing) => existing.factKey !== factKey);
  const nextTask: TaskRecord = {
    ...task,
    acceptanceFacts: [...withoutDuplicate, fact],
    updatedAt: input.capturedAt,
  };
  const nextState = withGoalLedgerEntry(state, "tasks", task.id, nextTask);
  assertGoalLedgerState(nextState);
  return nextState;
}

export function evaluateIntegrationAcceptanceJoin(
  state: GoalLedgerState,
  input: EvaluateIntegrationAcceptanceJoinInput,
): IntegrationAcceptanceJoinEvaluation {
  assertGoalLedgerState(state);
  assertPhaseOwner(input.owner, "owner");
  assertIssueLike(input.parentIssue, "parentIssue");
  assertNonEmptyString(input.reviewerRole, "reviewerRole");

  let projection: ActivePhaseContextProjection;
  try {
    projection = projectActivePhaseContext(state, input.owner);
  } catch (error) {
    return { status: "blocked", owner: input.owner, reason: formatError(error) };
  }
  if (projection.status !== "active") {
    return { status: "blocked", owner: input.owner, reason: "no-active-phase" };
  }
  if (projection.current.acceptanceStatements.length === 0) {
    return { status: "blocked", owner: input.owner, reason: "missing-target-acceptance-statements" };
  }

  const visibleTasks = resolveVisibleTasksForOwner(state, input.owner);
  const childRefs = visibleTasks.flatMap((task) =>
    task.childIssueRefs
      .filter((reference) => reference.relation === "child")
      .map((reference) => ({ task, reference })),
  );
  if (childRefs.length === 0) {
    return { status: "blocked", owner: input.owner, reason: "no-child-issue-refs" };
  }

  const passed: Array<{ taskId: string; fact: TaskAcceptanceRecord }> = [];
  const pending: Array<{ taskId: string; issue: TaskAcceptanceRecord["issue"]; reason: "missing" | "failed" }> = [];

  for (const { task, reference } of childRefs) {
    if (reference.owner !== input.parentIssue.owner || reference.repo !== input.parentIssue.repo) {
      return { status: "blocked", owner: input.owner, reason: `cross-repository-child:${task.id}` };
    }
    const latest = latestAcceptanceFactForIssue(task.acceptanceFacts ?? [], reference);
    if (latest === undefined) {
      pending.push({ taskId: task.id, issue: issueFromReference(reference), reason: "missing" });
      continue;
    }
    if (latest.status !== "passed") {
      pending.push({ taskId: task.id, issue: issueFromReference(reference), reason: "failed" });
      continue;
    }
    passed.push({ taskId: task.id, fact: latest });
  }

  if (pending.length > 0) {
    return {
      status: "waiting",
      owner: input.owner,
      phaseId: projection.current.phaseId,
      pending,
    };
  }

  const childPassDigest = digestStrings(passed.map((item) => `${item.taskId}:${item.fact.factKey}`).sort());
  const targetAcceptanceDigest = digestStrings(projection.current.acceptanceStatements);
  const joinKey = buildIntegrationAcceptanceJoinKey({
    parentIssue: input.parentIssue,
    phaseId: projection.current.phaseId,
    childPassDigest,
    targetAcceptanceDigest,
  });

  return {
    status: "ready",
    owner: input.owner,
    phaseId: projection.current.phaseId,
    parentIssue: input.parentIssue,
    reviewerRole: input.reviewerRole,
    acceptanceStatements: projection.current.acceptanceStatements,
    childPassFacts: passed,
    joinKey,
    childPassDigest,
    targetAcceptanceDigest,
  };
}

export function recordIntegrationAcceptanceEvent(
  state: GoalLedgerState,
  input: RecordIntegrationAcceptanceEventInput,
): GoalLedgerState {
  assertGoalLedgerState(state);
  assertNonEmptyString(input.phaseId, "phaseId");
  assertIssueLike(input.parentIssue, "parentIssue");
  assertNonEmptyString(input.reviewerRole, "reviewerRole");
  assertIntegrationAcceptanceStatus(input.status, "status");
  assertDigest(input.childPassDigest, "childPassDigest");
  assertDigest(input.targetAcceptanceDigest, "targetAcceptanceDigest");
  assertOptionalSourceComment(input.sourceComment, "sourceComment");
  assertOptionalStringArray(input.failedStatementIds, "failedStatementIds", { requireNonEmptyItems: true });
  assertOptionalStringArray(input.repairTaskIds, "repairTaskIds", { requireNonEmptyItems: true });
  assertIsoLikeString(input.capturedAt, "capturedAt");
  assertOptionalAcceptanceNote(input.note, "note");

  const phase = state.phases[input.phaseId];
  if (phase === undefined) {
    throw new Error(`Invalid integration acceptance event: missing phase ${input.phaseId}`);
  }

  const joinKey =
    input.joinKey ??
    buildIntegrationAcceptanceJoinKey({
      parentIssue: input.parentIssue,
      phaseId: input.phaseId,
      childPassDigest: input.childPassDigest,
      targetAcceptanceDigest: input.targetAcceptanceDigest,
    });
  assertIntegrationJoinKey(joinKey, "joinKey");

  const event: IntegrationAcceptanceRecord = {
    joinKey,
    phaseId: input.phaseId,
    parentIssue: input.parentIssue,
    reviewerRole: input.reviewerRole,
    status: input.status,
    childPassDigest: input.childPassDigest,
    targetAcceptanceDigest: input.targetAcceptanceDigest,
    ...(input.sourceComment === undefined ? {} : { sourceComment: input.sourceComment }),
    ...(input.failedStatementIds === undefined ? {} : { failedStatementIds: input.failedStatementIds }),
    ...(input.repairTaskIds === undefined ? {} : { repairTaskIds: input.repairTaskIds }),
    capturedAt: input.capturedAt,
    ...(input.note === undefined ? {} : { note: input.note }),
  };
  const existing = phase.integrationAcceptance ?? [];
  const withoutDuplicate = existing.filter((candidate) => candidate.joinKey !== joinKey || candidate.status !== event.status);
  const nextPhase: PhaseRecord = {
    ...phase,
    integrationAcceptance: [...withoutDuplicate, event],
  };
  const nextState = withGoalLedgerEntry(state, "phases", phase.id, nextPhase);
  assertGoalLedgerState(nextState);
  return nextState;
}

export function resolveVisibleTasksForOwner(state: GoalLedgerState, owner: PhaseOwner): TaskRecord[] {
  assertGoalLedgerState(state);
  assertPhaseOwner(owner, "owner");
  assertOwnerExists(state, owner, "owner");
  if (owner.kind === "task") {
    const task = state.tasks[owner.id];
    return task === undefined ? [] : [task];
  }
  if (owner.kind === "milestone") {
    const milestone = state.milestones[owner.id];
    return milestone === undefined
      ? []
      : milestone.taskIds.map((taskId) => state.tasks[taskId]).filter((task): task is TaskRecord => task !== undefined);
  }
  return Object.values(state.tasks).filter((task) => task.goalId === owner.id);
}

export function buildTaskAcceptanceFactKey(input: {
  issue: TaskAcceptanceRecord["issue"];
  statementResults: AcceptanceStatementResult[];
  messageIndex: number;
  commentId?: string;
}): string {
  assertIssueLike(input.issue, "issue");
  assertAcceptanceStatementResults(input.statementResults, "statementResults");
  if (!isNonNegativeInteger(input.messageIndex)) {
    throw new Error("Invalid task acceptance fact key: messageIndex invalid");
  }
  const version = input.commentId ?? `message-${String(input.messageIndex)}`;
  return `task-acceptance:${digestStrings([
    `${input.issue.owner}/${input.issue.repo}/${String(input.issue.number)}`,
    version,
    digestStatementResults(input.statementResults),
  ])}`;
}

export function buildIntegrationAcceptanceJoinKey(input: {
  parentIssue: IntegrationAcceptanceRecord["parentIssue"];
  phaseId: string;
  childPassDigest: string;
  targetAcceptanceDigest: string;
}): string {
  assertIssueLike(input.parentIssue, "parentIssue");
  assertNonEmptyString(input.phaseId, "phaseId");
  assertDigest(input.childPassDigest, "childPassDigest");
  assertDigest(input.targetAcceptanceDigest, "targetAcceptanceDigest");
  return `${INTEGRATION_ACCEPTANCE_KEY_PREFIX}:${digestStrings([
    `${input.parentIssue.owner}/${input.parentIssue.repo}/${String(input.parentIssue.number)}`,
    input.phaseId,
    input.childPassDigest,
    input.targetAcceptanceDigest,
  ])}`;
}

export function buildAcceptanceStatementsDigest(statements: string[]): string {
  assertStringArray(statements, "statements");
  if (!statements.every(isNonEmptyString)) {
    throw new Error("Invalid acceptance statements digest: contains empty statement");
  }
  return digestStrings(statements);
}

function upsertGoalIntakeProposalEntry<T extends GoalLedgerEntry>(
  state: GoalLedgerState,
  kind: GoalLedgerEntryKind,
  id: string,
  candidate: T,
  proposalKey: string,
): GoalLedgerState {
  const existing = state[kind][id] as T | undefined;
  if (existing !== undefined) {
    if (!goalLedgerEntryHasNote(existing, proposalKey)) {
      throw new Error(`Invalid goal intake proposal: ${kind}/${id} already exists`);
    }
    assertGoalIntakeProposalEntryMatches(existing, candidate, proposalKey, `${kind}/${id}`);
    return state;
  }
  return withGoalLedgerEntry(state, kind, id, candidate);
}

function assertGoalIntakeProposalInput(input: GoalIntakeProposalLedgerInput): void {
  assertGoalIntakeProposalKey(input.proposalKey, "proposalKey");
  assertIssueLike(input.sourceIssue, "sourceIssue");
  if (!isNonNegativeInteger(input.messageIndex)) {
    throw new Error("Invalid goal intake proposal: messageIndex invalid");
  }
  assertOptionalNonEmptyString(input.commentId, "commentId");
  assertIsoLikeString(input.capturedAt, "capturedAt");
  assertNonEmptyString(input.provenanceNote, "provenanceNote");
  assertNonEmptyString(input.goal.id, "goal.id");
  assertNonEmptyString(input.goal.title, "goal.title");
  assertNonEmptyString(input.goal.summary, "goal.summary");
  assertNonEmptyString(input.goal.scope, "goal.scope");
  assertStringArray(input.goal.acceptanceStatements, "goal.acceptanceStatements");
  if (!input.goal.acceptanceStatements.every(isNonEmptyString)) {
    throw new Error("Invalid goal intake proposal: goal acceptance invalid");
  }
  assertStringArray(input.goal.dependencies, "goal.dependencies");
  assertQualityBaseline(input.goal.qualityBaseline, "goal.qualityBaseline");
  if (input.milestones.length < 2 || input.milestones.length > 5) {
    throw new Error(`Invalid goal intake proposal: milestone count ${String(input.milestones.length)}`);
  }
  const milestoneIds = new Set<string>();
  for (const milestone of input.milestones) {
    assertNonEmptyString(milestone.id, "milestone.id");
    assertNonEmptyString(milestone.title, "milestone.title");
    assertQualityBaseline(milestone.qualityBaseline, "milestone.qualityBaseline");
    if (milestoneIds.has(milestone.id)) {
      throw new Error(`Invalid goal intake proposal: duplicate milestone ${milestone.id}`);
    }
    milestoneIds.add(milestone.id);
  }
  assertNonEmptyString(input.phaseOne.id, "phaseOne.id");
  assertNonEmptyString(input.phaseOne.name, "phaseOne.name");
  assertNonEmptyString(input.phaseOne.objective, "phaseOne.objective");
  assertStringArray(input.phaseOne.acceptanceStatements, "phaseOne.acceptanceStatements");
  if (!input.phaseOne.acceptanceStatements.every(isNonEmptyString)) {
    throw new Error("Invalid goal intake proposal: phase acceptance invalid");
  }
  assertStringArray(input.phaseOne.dependencies, "phaseOne.dependencies");
  assertQualityBaseline(input.phaseOne.qualityBaseline, "phaseOne.qualityBaseline");
  if (input.tasks.length < 3 || input.tasks.length > 7) {
    throw new Error(`Invalid goal intake proposal: task count ${String(input.tasks.length)}`);
  }
  const taskIds = new Set<string>();
  for (const task of input.tasks) {
    assertNonEmptyString(task.id, "task.id");
    assertNonEmptyString(task.milestoneId, "task.milestoneId");
    if (!milestoneIds.has(task.milestoneId)) {
      throw new Error(`Invalid goal intake proposal: unknown milestone ${task.milestoneId}`);
    }
    assertNonEmptyString(task.title, "task.title");
    assertNonEmptyString(task.scope, "task.scope");
    assertStringArray(task.acceptanceStatements, "task.acceptanceStatements");
    if (task.acceptanceStatements.length < 1 || task.acceptanceStatements.length > 3 || !task.acceptanceStatements.every(isNonEmptyString)) {
      throw new Error(`Invalid goal intake proposal: task ${task.id} acceptance invalid`);
    }
    assertStringArray(task.dependencies, "task.dependencies");
    assertQualityBaseline(task.qualityBaseline, "task.qualityBaseline");
    assertNonEmptyString(task.provenance, "task.provenance");
    if (taskIds.has(task.id)) {
      throw new Error(`Invalid goal intake proposal: duplicate task ${task.id}`);
    }
    taskIds.add(task.id);
  }
}

function assertGoalIntakeProposalEntryMatches(
  existing: GoalLedgerEntry,
  candidate: GoalLedgerEntry,
  proposalKey: string,
  path: string,
): void {
  const existingComparable = normalizeGoalIntakeProposalEntry(existing, proposalKey);
  const candidateComparable = normalizeGoalIntakeProposalEntry(candidate, proposalKey);
  if (JSON.stringify(existingComparable) !== JSON.stringify(candidateComparable)) {
    throw new Error(`Invalid goal intake proposal: conflicting ${path}`);
  }
}

function normalizeGoalIntakeProposalEntry(entry: GoalLedgerEntry, proposalKey: string): unknown {
  if ("milestoneIds" in entry) {
    return {
      id: entry.id,
      title: entry.title,
      status: entry.status,
      summary: entry.summary,
      scope: entry.scope,
      acceptanceStatements: entry.acceptanceStatements ?? [],
      dependencies: entry.dependencies ?? [],
      qualityBaseline: entry.qualityBaseline,
      milestoneIds: entry.milestoneIds,
      issueRefs: normalizeIssueRefs(entry.issueRefs, proposalKey),
    };
  }
  if ("taskIds" in entry) {
    return {
      id: entry.id,
      goalId: entry.goalId,
      title: entry.title,
      qualityBaseline: entry.qualityBaseline,
      taskIds: entry.taskIds,
      phaseIds: entry.phaseIds,
      issueRefs: normalizeIssueRefs(entry.issueRefs, proposalKey),
    };
  }
  if ("owner" in entry) {
    return {
      id: entry.id,
      owner: entry.owner,
      name: entry.name,
      status: entry.status,
      qualityBaseline: entry.qualityBaseline,
      objective: entry.objective,
      acceptanceStatements: entry.acceptanceStatements ?? [],
      dependencies: entry.dependencies ?? [],
    };
  }
  return {
    id: entry.id,
    goalId: entry.goalId,
    milestoneId: entry.milestoneId,
    title: entry.title,
    status: entry.status,
    scope: entry.scope,
    acceptanceStatements: entry.acceptanceStatements ?? [],
    dependencies: entry.dependencies ?? [],
    qualityBaseline: entry.qualityBaseline,
    phaseIds: entry.phaseIds,
    parentIssueRef: entry.parentIssueRef === undefined ? undefined : normalizeIssueReference(entry.parentIssueRef, proposalKey),
  };
}

function normalizeIssueRefs(refs: readonly IssueReference[], proposalKey: string): IssueReference[] {
  return refs.map((reference) => normalizeIssueReference(reference, proposalKey));
}

function normalizeIssueReference(reference: IssueReference, proposalKey: string): IssueReference {
  return reference.note === proposalKey ? { ...reference, note: proposalKey } : reference;
}

function goalIntakeLedgerProvenance(input: GoalIntakeProposalLedgerInput, note: string): LedgerProvenance {
  return {
    issue: input.sourceIssue,
    messageIndex: input.messageIndex,
    ...(input.commentId === undefined ? {} : { commentId: input.commentId }),
    capturedAt: input.capturedAt,
    note: truncateText(`${input.proposalKey}; ${note.replace(/\s+/g, " ").trim()}`, MAX_ISSUE_REFERENCE_NOTE_LENGTH),
  };
}

function goalLedgerEntryHasNote(entry: GoalLedgerEntry, proposalKey: string): boolean {
  if (entry.provenance.some((item) => item.note?.includes(proposalKey))) {
    return true;
  }
  if ("issueRefs" in entry && entry.issueRefs.some((reference) => reference.note?.includes(proposalKey))) {
    return true;
  }
  if ("parentIssueRef" in entry && entry.parentIssueRef?.note?.includes(proposalKey)) {
    return true;
  }
  return false;
}

function assertGoalIntakeProposalKey(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !/^agent-moebius-goal-intake-proposal-key:[a-f0-9]{32}$/u.test(value)) {
    throw new Error(`Invalid goal intake proposal: ${path} invalid`);
  }
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength - 1).trimEnd();
}

export function parseGoalLedgerState(value: unknown): GoalLedgerState {
  assertGoalLedgerState(value);
  return value;
}

export function assertGoalLedgerState(value: unknown): asserts value is GoalLedgerState {
  if (!isPlainObject(value)) {
    throw new Error("Invalid goal ledger state: top-level is not an object");
  }
  if (value.schemaVersion !== 1) {
    throw new Error("Invalid goal ledger state: unsupported schemaVersion");
  }
  if (!isRecord(value.goals) || !isRecord(value.milestones) || !isRecord(value.tasks) || !isRecord(value.phases)) {
    throw new Error("Invalid goal ledger state: missing entity collections");
  }
  const state = value as unknown as GoalLedgerState;

  for (const [id, goal] of Object.entries(state.goals)) {
    assertGoalRecord(goal, `goals.${id}`);
    if (goal.id !== id) {
      throw new Error(`Invalid goal ledger state: goals.${id}.id mismatch`);
    }
  }
  for (const [id, milestone] of Object.entries(state.milestones)) {
    assertMilestoneRecord(milestone, `milestones.${id}`);
    if (milestone.id !== id) {
      throw new Error(`Invalid goal ledger state: milestones.${id}.id mismatch`);
    }
    const goal = state.goals[milestone.goalId];
    if (goal === undefined) {
      throw new Error(`Invalid goal ledger state: milestones.${id}.goalId missing`);
    }
  }
  for (const [id, task] of Object.entries(state.tasks)) {
    assertTaskRecord(task, `tasks.${id}`);
    if (task.id !== id) {
      throw new Error(`Invalid goal ledger state: tasks.${id}.id mismatch`);
    }
    const goal = state.goals[task.goalId];
    if (goal === undefined) {
      throw new Error(`Invalid goal ledger state: tasks.${id}.goalId missing`);
    }
    if (task.milestoneId !== undefined) {
      const milestone = state.milestones[task.milestoneId];
      if (milestone === undefined || milestone.goalId !== task.goalId) {
        throw new Error(`Invalid goal ledger state: tasks.${id}.milestoneId invalid`);
      }
    }
  }
  for (const [id, phase] of Object.entries(state.phases)) {
    assertPhaseRecord(phase, `phases.${id}`);
    if (phase.id !== id) {
      throw new Error(`Invalid goal ledger state: phases.${id}.id mismatch`);
    }
    if (!hasEntity(state, phase.owner.kind, phase.owner.id)) {
      throw new Error(`Invalid goal ledger state: phases.${id}.owner missing`);
    }
  }
  assertSingleActivePhasePerOwner(state);
}

function assertGoalRecord(value: unknown, path: string): asserts value is GoalRecord {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  assertNonEmptyString(value.id, `${path}.id`);
  assertNonEmptyString(value.title, `${path}.title`);
  assertReadinessStatus(value.status, `${path}.status`);
  assertOptionalNonEmptyString(value.summary, `${path}.summary`);
  assertOptionalNonEmptyString(value.scope, `${path}.scope`);
  assertOptionalStringArray(value.acceptanceStatements, `${path}.acceptanceStatements`, { requireNonEmptyItems: true });
  assertOptionalStringArray(value.dependencies, `${path}.dependencies`, { requireNonEmptyItems: true });
  assertOptionalQualityBaseline(value.qualityBaseline, `${path}.qualityBaseline`);
  assertArray(value.issueRefs, `${path}.issueRefs`, assertIssueReference);
  assertStringArray(value.milestoneIds, `${path}.milestoneIds`);
  assertArray(value.provenance, `${path}.provenance`, assertLedgerProvenance);
  assertMissingFields(value.missingFields, `${path}.missingFields`);
  assertStringArray(value.nextQuestions, `${path}.nextQuestions`);
  assertIsoLikeString(value.createdAt, `${path}.createdAt`);
  assertIsoLikeString(value.updatedAt, `${path}.updatedAt`);
  assertReadyFields(value as unknown as GoalRecord, path);
}

function assertMilestoneRecord(value: unknown, path: string): asserts value is MilestoneRecord {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  assertNonEmptyString(value.id, `${path}.id`);
  assertNonEmptyString(value.goalId, `${path}.goalId`);
  assertNonEmptyString(value.title, `${path}.title`);
  assertQualityBaseline(value.qualityBaseline, `${path}.qualityBaseline`);
  assertStringArray(value.taskIds, `${path}.taskIds`);
  assertStringArray(value.phaseIds, `${path}.phaseIds`);
  assertArray(value.issueRefs, `${path}.issueRefs`, assertIssueReference);
  assertArray(value.provenance, `${path}.provenance`, assertLedgerProvenance);
  assertIsoLikeString(value.createdAt, `${path}.createdAt`);
  assertIsoLikeString(value.updatedAt, `${path}.updatedAt`);
}

function assertTaskRecord(value: unknown, path: string): asserts value is TaskRecord {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  assertNonEmptyString(value.id, `${path}.id`);
  assertNonEmptyString(value.goalId, `${path}.goalId`);
  assertOptionalNonEmptyString(value.milestoneId, `${path}.milestoneId`);
  assertNonEmptyString(value.title, `${path}.title`);
  assertReadinessStatus(value.status, `${path}.status`);
  assertOptionalNonEmptyString(value.scope, `${path}.scope`);
  assertOptionalStringArray(value.acceptanceStatements, `${path}.acceptanceStatements`, { requireNonEmptyItems: true });
  assertOptionalStringArray(value.dependencies, `${path}.dependencies`, { requireNonEmptyItems: true });
  assertOptionalQualityBaseline(value.qualityBaseline, `${path}.qualityBaseline`);
  assertStringArray(value.phaseIds, `${path}.phaseIds`);
  if (value.parentIssueRef !== undefined) {
    assertIssueReference(value.parentIssueRef, `${path}.parentIssueRef`);
  }
  assertArray(value.childIssueRefs, `${path}.childIssueRefs`, assertIssueReference);
  if (value.acceptanceFacts !== undefined) {
    assertArray(value.acceptanceFacts, `${path}.acceptanceFacts`, assertTaskAcceptanceRecord);
  }
  assertArray(value.runManifestRefs, `${path}.runManifestRefs`, assertRunManifestReference);
  assertArray(value.provenance, `${path}.provenance`, assertLedgerProvenance);
  assertIsoLikeString(value.createdAt, `${path}.createdAt`);
  assertIsoLikeString(value.updatedAt, `${path}.updatedAt`);
  assertReadyFields(value as unknown as TaskRecord, path);
}

function assertPhaseRecord(value: unknown, path: string): asserts value is PhaseRecord {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  assertNonEmptyString(value.id, `${path}.id`);
  if (!isPlainObject(value.owner)) {
    throw new Error(`Invalid goal ledger state: ${path}.owner is not an object`);
  }
  if (!(value.owner.kind === "goal" || value.owner.kind === "milestone" || value.owner.kind === "task")) {
    throw new Error(`Invalid goal ledger state: ${path}.owner.kind invalid`);
  }
  assertNonEmptyString(value.owner.id, `${path}.owner.id`);
  assertNonEmptyString(value.name, `${path}.name`);
  if (!(value.status === "pending" || value.status === "active" || value.status === "completed")) {
    throw new Error(`Invalid goal ledger state: ${path}.status invalid`);
  }
  assertQualityBaseline(value.qualityBaseline, `${path}.qualityBaseline`);
  assertOptionalNonEmptyString(value.objective, `${path}.objective`);
  assertOptionalStringArray(value.acceptanceStatements, `${path}.acceptanceStatements`, { requireNonEmptyItems: true });
  assertOptionalStringArray(value.dependencies, `${path}.dependencies`, { requireNonEmptyItems: true });
  if (value.artifactRefs !== undefined) {
    assertArray(value.artifactRefs, `${path}.artifactRefs`, assertPhaseArtifactReference);
  }
  if (value.integrationAcceptance !== undefined) {
    assertArray(value.integrationAcceptance, `${path}.integrationAcceptance`, assertIntegrationAcceptanceRecord);
  }
  assertOptionalNonEmptyString(value.archiveSummary, `${path}.archiveSummary`);
  assertOptionalIsoLikeString(value.archivedAt, `${path}.archivedAt`);
  assertOptionalNonEmptyString(value.startedAt, `${path}.startedAt`);
  assertOptionalNonEmptyString(value.completedAt, `${path}.completedAt`);
  assertArray(value.provenance, `${path}.provenance`, assertLedgerProvenance);
}

function assertPhaseArtifactReference(value: unknown, path: string): asserts value is PhaseArtifactReference {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  assertBoundedSummary(value.summary, `${path}.summary`);
  if (value.kind === "run-manifest") {
    assertRunManifestLocator(value.locator, `${path}.locator`);
    return;
  }
  if (value.kind === "acceptance-evidence") {
    assertSafeRelativePath(value.path, `${path}.path`);
    return;
  }
  if (value.kind === "issue-comment") {
    if (!isPlainObject(value.issue)) {
      throw new Error(`Invalid goal ledger state: ${path}.issue is not an object`);
    }
    assertNonEmptyString(value.issue.owner, `${path}.issue.owner`);
    assertNonEmptyString(value.issue.repo, `${path}.issue.repo`);
    if (!isPositiveInteger(value.issue.number)) {
      throw new Error(`Invalid goal ledger state: ${path}.issue.number invalid`);
    }
    if (value.commentId !== undefined) {
      assertBoundedLocator(value.commentId, `${path}.commentId`);
    }
    if (value.url !== undefined) {
      assertBoundedLocator(value.url, `${path}.url`);
    }
    if (value.commentId === undefined && value.url === undefined) {
      throw new Error(`Invalid goal ledger state: ${path}.locator missing`);
    }
    return;
  }
  if (value.kind === "path") {
    assertSafeRelativePath(value.path, `${path}.path`);
    return;
  }
  if (value.kind === "other") {
    assertGenericLocator(value.locator, `${path}.locator`);
    return;
  }
  throw new Error(`Invalid goal ledger state: ${path}.kind invalid`);
}

function assertIssueReference(value: unknown, path: string): asserts value is IssueReference {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  assertNonEmptyString(value.owner, `${path}.owner`);
  assertNonEmptyString(value.repo, `${path}.repo`);
  if (!isPositiveInteger(value.number)) {
    throw new Error(`Invalid goal ledger state: ${path}.number invalid`);
  }
  if (!(value.relation === "source" || value.relation === "parent" || value.relation === "child" || value.relation === "acceptance" || value.relation === "implementation")) {
    throw new Error(`Invalid goal ledger state: ${path}.relation invalid`);
  }
  if (!(value.status === "planned" || value.status === "open" || value.status === "closed" || value.status === "unknown")) {
    throw new Error(`Invalid goal ledger state: ${path}.status invalid`);
  }
  if (value.note !== undefined) {
    assertIssueReferenceNote(value.note, `${path}.note`);
  }
}

function assertLedgerProvenance(value: unknown, path: string): asserts value is LedgerProvenance {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  if (!isPlainObject(value.issue)) {
    throw new Error(`Invalid goal ledger state: ${path}.issue is not an object`);
  }
  assertNonEmptyString(value.issue.owner, `${path}.issue.owner`);
  assertNonEmptyString(value.issue.repo, `${path}.issue.repo`);
  if (!isPositiveInteger(value.issue.number)) {
    throw new Error(`Invalid goal ledger state: ${path}.issue.number invalid`);
  }
  if (!isNonNegativeInteger(value.messageIndex)) {
    throw new Error(`Invalid goal ledger state: ${path}.messageIndex invalid`);
  }
  assertOptionalNonEmptyString(value.commentId, `${path}.commentId`);
  assertIsoLikeString(value.capturedAt, `${path}.capturedAt`);
  assertOptionalNonEmptyString(value.note, `${path}.note`);
}

function assertTaskAcceptanceRecord(value: unknown, path: string): asserts value is TaskAcceptanceRecord {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  assertNonEmptyString(value.factKey, `${path}.factKey`);
  if (!String(value.factKey).startsWith("task-acceptance:")) {
    throw new Error(`Invalid goal ledger state: ${path}.factKey invalid`);
  }
  assertIssueLike(value.issue, `${path}.issue`);
  assertNonEmptyString(value.role, `${path}.role`);
  assertAcceptanceFactStatus(value.status, `${path}.status`);
  assertAcceptanceStatementResults(value.statementResults, `${path}.statementResults`);
  if (!isNonNegativeInteger(value.messageIndex)) {
    throw new Error(`Invalid goal ledger state: ${path}.messageIndex invalid`);
  }
  assertOptionalNonEmptyString(value.commentId, `${path}.commentId`);
  assertIsoLikeString(value.capturedAt, `${path}.capturedAt`);
  assertOptionalAcceptanceNote(value.note, `${path}.note`);
}

function assertIntegrationAcceptanceRecord(value: unknown, path: string): asserts value is IntegrationAcceptanceRecord {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  assertIntegrationJoinKey(value.joinKey, `${path}.joinKey`);
  assertNonEmptyString(value.phaseId, `${path}.phaseId`);
  assertIssueLike(value.parentIssue, `${path}.parentIssue`);
  assertNonEmptyString(value.reviewerRole, `${path}.reviewerRole`);
  assertIntegrationAcceptanceStatus(value.status, `${path}.status`);
  assertDigest(value.childPassDigest, `${path}.childPassDigest`);
  assertDigest(value.targetAcceptanceDigest, `${path}.targetAcceptanceDigest`);
  assertOptionalSourceComment(value.sourceComment, `${path}.sourceComment`);
  assertOptionalStringArray(value.failedStatementIds, `${path}.failedStatementIds`, { requireNonEmptyItems: true });
  assertOptionalStringArray(value.repairTaskIds, `${path}.repairTaskIds`, { requireNonEmptyItems: true });
  assertIsoLikeString(value.capturedAt, `${path}.capturedAt`);
  assertOptionalAcceptanceNote(value.note, `${path}.note`);
}

function assertIssueLike(value: unknown, path: string): asserts value is TaskAcceptanceRecord["issue"] {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  assertNonEmptyString(value.owner, `${path}.owner`);
  assertNonEmptyString(value.repo, `${path}.repo`);
  if (!isPositiveInteger(value.number)) {
    throw new Error(`Invalid goal ledger state: ${path}.number invalid`);
  }
}

function assertAcceptanceFactStatus(value: unknown, path: string): asserts value is AcceptanceFactStatus {
  if (!(value === "passed" || value === "failed")) {
    throw new Error(`Invalid goal ledger state: ${path} invalid`);
  }
}

function assertIntegrationAcceptanceStatus(value: unknown, path: string): asserts value is IntegrationAcceptanceStatus {
  if (!(value === "requested" || value === "passed" || value === "failed" || value === "blocked")) {
    throw new Error(`Invalid goal ledger state: ${path} invalid`);
  }
}

function assertAcceptanceStatementResults(value: unknown, path: string): asserts value is AcceptanceStatementResult[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid goal ledger state: ${path} is not a non-empty array`);
  }
  const seenIds = new Set<string>();
  value.forEach((result, index) => {
    const itemPath = `${path}.${String(index)}`;
    if (!isPlainObject(result)) {
      throw new Error(`Invalid goal ledger state: ${itemPath} is not an object`);
    }
    assertNonEmptyString(result.id, `${itemPath}.id`);
    if (String(result.id).length > MAX_ACCEPTANCE_STATEMENT_ID_LENGTH) {
      throw new Error(`Invalid goal ledger state: ${itemPath}.id too long`);
    }
    if (seenIds.has(result.id)) {
      throw new Error(`Invalid goal ledger state: ${path} duplicate id ${result.id}`);
    }
    seenIds.add(result.id);
    assertAcceptanceFactStatus(result.status, `${itemPath}.status`);
    if (result.statement !== undefined) {
      assertNonEmptyString(result.statement, `${itemPath}.statement`);
      if (String(result.statement).length > MAX_ACCEPTANCE_STATEMENT_TEXT_LENGTH) {
        throw new Error(`Invalid goal ledger state: ${itemPath}.statement too long`);
      }
    }
  });
}

function assertOptionalAcceptanceNote(value: unknown, path: string): asserts value is string | undefined {
  if (value === undefined) {
    return;
  }
  assertNonEmptyString(value, path);
  if (String(value).length > MAX_ACCEPTANCE_NOTE_LENGTH) {
    throw new Error(`Invalid goal ledger state: ${path} too long`);
  }
}

function assertDigest(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`Invalid goal ledger state: ${path} invalid digest`);
  }
}

function assertOptionalSourceComment(
  value: unknown,
  path: string,
): asserts value is IntegrationAcceptanceRecord["sourceComment"] | undefined {
  if (value === undefined) {
    return;
  }
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  assertIssueLike(value.issue, `${path}.issue`);
  if (!isNonNegativeInteger(value.messageIndex)) {
    throw new Error(`Invalid goal ledger state: ${path}.messageIndex invalid`);
  }
  assertOptionalNonEmptyString(value.commentId, `${path}.commentId`);
}

function assertIntegrationJoinKey(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !new RegExp(`^${INTEGRATION_ACCEPTANCE_KEY_PREFIX}:[a-f0-9]{64}$`, "u").test(value)) {
    throw new Error(`Invalid goal ledger state: ${path} invalid`);
  }
}

function assertRunManifestReference(value: unknown, path: string): asserts value is RunManifestReference {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  if (!(value.resolution === "linked" || value.resolution === "missing" || value.resolution === "unresolved")) {
    throw new Error(`Invalid goal ledger state: ${path}.resolution invalid`);
  }
  if (value.resolution === "linked" || value.resolution === "missing") {
    assertRunManifestLocator(value.locator, `${path}.locator`);
  } else if (value.locator !== undefined) {
    throw new Error(`Invalid goal ledger state: ${path}.locator must be omitted for unresolved refs`);
  }
  if (!isPlainObject(value.issue)) {
    throw new Error(`Invalid goal ledger state: ${path}.issue is not an object`);
  }
  assertNonEmptyString(value.issue.owner, `${path}.issue.owner`);
  assertNonEmptyString(value.issue.repo, `${path}.issue.repo`);
  if (!isPositiveInteger(value.issue.number)) {
    throw new Error(`Invalid goal ledger state: ${path}.issue.number invalid`);
  }
  assertNonEmptyString(value.role, `${path}.role`);
  assertIsoLikeString(value.completedAt, `${path}.completedAt`);
  if (!(value.stage === "plan-written" || value.stage === "code-verified" || value.stage === "in-progress" || value.stage === "unknown")) {
    throw new Error(`Invalid goal ledger state: ${path}.stage invalid`);
  }
}

function assertRunManifestLocator(value: unknown, path: string): asserts value is RunManifestLocator {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  if (value.kind === "jsonl-line") {
    if (value.path !== ".state/run-manifests.jsonl") {
      throw new Error(`Invalid goal ledger state: ${path}.path invalid`);
    }
    if (!isPositiveInteger(value.line)) {
      throw new Error(`Invalid goal ledger state: ${path}.line invalid`);
    }
    return;
  }
  if (value.kind === "run-dir") {
    assertNonEmptyString(value.runDir, `${path}.runDir`);
    return;
  }
  throw new Error(`Invalid goal ledger state: ${path}.kind invalid`);
}

function assertReadyFields(value: Pick<GoalRecord | TaskRecord, "status" | "scope" | "acceptanceStatements" | "dependencies" | "qualityBaseline" | "provenance">, path: string): void {
  if (value.status !== "ready") {
    return;
  }
  const missing = computeReadyMissingFields(value);
  if (missing.length > 0 || value.provenance.length === 0) {
    throw new Error(`Invalid goal ledger state: ${path} ready fields missing`);
  }
}

function assertReadinessStatus(value: unknown, path: string): asserts value is LedgerReadinessStatus {
  if (!(value === "draft" || value === "pending" || value === "ready")) {
    throw new Error(`Invalid goal ledger state: ${path} invalid`);
  }
}

function assertMissingFields(value: unknown, path: string): asserts value is MissingGoalField[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an array`);
  }
  for (const field of value) {
    if (!(field === "scope" || field === "acceptanceStatements" || field === "dependencies" || field === "qualityBaseline")) {
      throw new Error(`Invalid goal ledger state: ${path} contains invalid field`);
    }
  }
}

function assertOptionalStringArray(value: unknown, path: string, options: { requireNonEmptyItems: boolean }): void {
  if (value === undefined) {
    return;
  }
  assertStringArray(value, path);
  if (options.requireNonEmptyItems && !value.every(isNonEmptyString)) {
    throw new Error(`Invalid goal ledger state: ${path} contains empty string`);
  }
}

function assertStringArray(value: unknown, path: string): asserts value is string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Invalid goal ledger state: ${path} is not a string array`);
  }
}

function assertArray<T>(value: unknown, path: string, assertItem: (item: unknown, path: string) => asserts item is T): asserts value is T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an array`);
  }
  value.forEach((item, index) => assertItem(item, `${path}.${String(index)}`));
}

function assertOptionalQualityBaseline(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }
  assertQualityBaseline(value, path);
}

function assertQualityBaseline(value: unknown, path: string): asserts value is QualityBaseline {
  if (!isQualityBaseline(value)) {
    throw new Error(`Invalid goal ledger state: ${path} invalid`);
  }
}

function assertOptionalNonEmptyString(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }
  assertNonEmptyString(value, path);
}

function assertOptionalIsoLikeString(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }
  assertIsoLikeString(value, path);
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new Error(`Invalid goal ledger state: ${path} invalid`);
  }
}

function assertIsoLikeString(value: unknown, path: string): asserts value is string {
  assertNonEmptyString(value, path);
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid goal ledger state: ${path} invalid timestamp`);
  }
}

function isQualityBaseline(value: unknown): value is QualityBaseline {
  return value === "demo" || value === "data-correct" || value === "production";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

function hasEntity(state: GoalLedgerState, kind: PhaseOwner["kind"], id: string): boolean {
  if (kind === "goal") {
    return state.goals[id] !== undefined;
  }
  if (kind === "milestone") {
    return state.milestones[id] !== undefined;
  }
  return state.tasks[id] !== undefined;
}

function assertPhaseOwner(value: unknown, path: string): asserts value is PhaseOwner {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid goal ledger state: ${path} is not an object`);
  }
  if (!(value.kind === "goal" || value.kind === "milestone" || value.kind === "task")) {
    throw new Error(`Invalid goal ledger state: ${path}.kind invalid`);
  }
  assertNonEmptyString(value.id, `${path}.id`);
}

function assertOwnerExists(state: GoalLedgerState, owner: PhaseOwner, path: string): void {
  if (!hasEntity(state, owner.kind, owner.id)) {
    throw new Error(`Invalid goal ledger state: ${path} missing`);
  }
}

function assertSingleActivePhasePerOwner(state: GoalLedgerState): void {
  const activeByOwner = new Map<string, string>();
  for (const phase of Object.values(state.phases)) {
    if (phase.status !== "active") {
      continue;
    }
    const key = phaseOwnerKey(phase.owner);
    const existing = activeByOwner.get(key);
    if (existing !== undefined) {
      throw new Error(`Invalid goal ledger state: multiple active phases for ${key}`);
    }
    activeByOwner.set(key, phase.id);
  }
}

function findActivePhasesForOwner(state: GoalLedgerState, owner: PhaseOwner): PhaseRecord[] {
  return Object.values(state.phases).filter((phase) => phase.status === "active" && samePhaseOwner(phase.owner, owner));
}

function samePhaseOwner(left: PhaseOwner, right: PhaseOwner): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function phaseOwnerKey(owner: PhaseOwner): string {
  return `${owner.kind}:${owner.id}`;
}

function assertPhaseHasCurrentContextFields(phase: PhaseRecord, path: string): void {
  getPhaseCurrentContext(phase, path);
}

function getPhaseCurrentContext(
  phase: PhaseRecord,
  path = `phase ${phase.id}`,
): { objective: string; acceptanceStatements: string[]; dependencies: string[] } {
  if (!isNonEmptyString(phase.objective)) {
    throw new Error(`Invalid phase context: ${path} missing objective`);
  }
  if (!Array.isArray(phase.acceptanceStatements) || phase.acceptanceStatements.filter(isNonEmptyString).length === 0) {
    throw new Error(`Invalid phase context: ${path} missing acceptanceStatements`);
  }
  if (!Array.isArray(phase.dependencies)) {
    throw new Error(`Invalid phase context: ${path} missing dependencies`);
  }
  if (!isQualityBaseline(phase.qualityBaseline)) {
    throw new Error(`Invalid phase context: ${path} missing qualityBaseline`);
  }
  return {
    objective: phase.objective,
    acceptanceStatements: phase.acceptanceStatements,
    dependencies: phase.dependencies,
  };
}

function assertArchiveInput(archiveSummary: unknown, artifactRefs: unknown): asserts artifactRefs is PhaseArtifactReference[] {
  assertBoundedSummary(archiveSummary, "archiveSummary");
  assertArray(artifactRefs, "artifactRefs", assertPhaseArtifactReference);
}

function assertBoundedSummary(value: unknown, path: string): asserts value is string {
  assertNonEmptyString(value, path);
  if (String(value).length > MAX_PHASE_ARTIFACT_SUMMARY_LENGTH) {
    throw new Error(`Invalid goal ledger state: ${path} too long`);
  }
}

function assertBoundedLocator(value: unknown, path: string): asserts value is string {
  assertNonEmptyString(value, path);
  const locator = String(value);
  if (locator.length > MAX_PHASE_ARTIFACT_LOCATOR_LENGTH || /\s/.test(locator)) {
    throw new Error(`Invalid goal ledger state: ${path} invalid`);
  }
}

function assertIssueReferenceNote(value: unknown, path: string): asserts value is string {
  assertNonEmptyString(value, path);
  if (String(value).length > MAX_ISSUE_REFERENCE_NOTE_LENGTH) {
    throw new Error(`Invalid goal ledger state: ${path} too long`);
  }
}

function assertGenericLocator(value: unknown, path: string): asserts value is string {
  assertBoundedLocator(value, path);
  const locator = String(value).trim();
  if (locator.startsWith("{") || locator.startsWith("[") || locator.includes('"body"')) {
    throw new Error(`Invalid goal ledger state: ${path} invalid`);
  }
}

function assertSafeRelativePath(value: unknown, path: string): asserts value is string {
  assertBoundedLocator(value, path);
  const filePath = String(value);
  if (filePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(filePath)) {
    throw new Error(`Invalid goal ledger state: ${path} escapes workspace`);
  }
  const segments = filePath.split(/[\\/]+/);
  if (segments.some((segment) => segment === "..")) {
    throw new Error(`Invalid goal ledger state: ${path} escapes workspace`);
  }
}

export function latestAcceptanceFactForIssue(
  facts: readonly TaskAcceptanceRecord[],
  reference: { owner: string; repo: string; number: number },
): TaskAcceptanceRecord | undefined {
  const matching = facts.filter(
    (fact) => reference.owner === fact.issue.owner && reference.repo === fact.issue.repo && reference.number === fact.issue.number,
  );
  return matching.sort(compareTaskAcceptanceFacts).at(-1);
}

function compareTaskAcceptanceFacts(left: TaskAcceptanceRecord, right: TaskAcceptanceRecord): number {
  const leftTime = Date.parse(left.capturedAt);
  const rightTime = Date.parse(right.capturedAt);
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  if (left.messageIndex !== right.messageIndex) {
    return left.messageIndex - right.messageIndex;
  }
  return left.factKey.localeCompare(right.factKey);
}

function issueFromReference(reference: IssueReference): TaskAcceptanceRecord["issue"] {
  return {
    owner: reference.owner,
    repo: reference.repo,
    number: reference.number,
  };
}

function issueReferenceMatchesIssue(reference: IssueReference, issue: TaskAcceptanceRecord["issue"]): boolean {
  return reference.owner === issue.owner && reference.repo === issue.repo && reference.number === issue.number;
}

function digestStatementResults(results: AcceptanceStatementResult[]): string {
  return digestStrings(
    results
      .map((result) => `${result.id}:${result.status}:${result.statement ?? ""}`)
      .sort(),
  );
}

function digestStrings(values: readonly string[]): string {
  const hash = crypto.createHash("sha256");
  for (const value of values) {
    hash.update(String(value.length));
    hash.update(":");
    hash.update(value);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mergeIssueRefs(existing: IssueReference[], incoming: IssueReference[]): IssueReference[] {
  const byKey = new Map<string, IssueReference>();
  for (const reference of existing) {
    assertIssueReference(reference, "issueRefs.existing");
    byKey.set(issueRefKey(reference), reference);
  }
  for (const reference of incoming) {
    assertIssueReference(reference, "issueRefs.incoming");
    byKey.set(issueRefKey(reference), reference);
  }
  return [...byKey.values()];
}

function issueRefKey(reference: IssueReference): string {
  return `${reference.owner}/${reference.repo}#${String(reference.number)}:${reference.relation}`;
}
