export type QualityBaseline = "demo" | "data-correct" | "production";
export type LedgerReadinessStatus = "draft" | "pending" | "ready";
export type PhaseStatus = "pending" | "active" | "completed";
export type IssueRelation = "source" | "parent" | "child" | "acceptance" | "implementation";
export type IssueReferenceStatus = "planned" | "open" | "closed" | "unknown";
export type MissingGoalField = "scope" | "acceptanceStatements" | "dependencies" | "qualityBaseline";
export type GoalLedgerEntryKind = "goals" | "milestones" | "tasks" | "phases";
export type RunManifestStage = "plan-written" | "code-verified" | "in-progress" | "unknown";

export interface IssueReference {
  owner: string;
  repo: string;
  number: number;
  relation: IssueRelation;
  status: IssueReferenceStatus;
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
  owner: {
    kind: "goal" | "milestone" | "task";
    id: string;
  };
  name: string;
  status: PhaseStatus;
  qualityBaseline: QualityBaseline;
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
  assertOptionalNonEmptyString(value.startedAt, `${path}.startedAt`);
  assertOptionalNonEmptyString(value.completedAt, `${path}.completedAt`);
  assertArray(value.provenance, `${path}.provenance`, assertLedgerProvenance);
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

function hasEntity(state: GoalLedgerState, kind: PhaseRecord["owner"]["kind"], id: string): boolean {
  if (kind === "goal") {
    return state.goals[id] !== undefined;
  }
  if (kind === "milestone") {
    return state.milestones[id] !== undefined;
  }
  return state.tasks[id] !== undefined;
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
