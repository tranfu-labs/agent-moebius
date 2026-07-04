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
