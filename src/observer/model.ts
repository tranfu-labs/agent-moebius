import { makeRepoKey, type RepositoryRef } from "../issue-source.js";
import type {
  AcceptanceFactStatus,
  GoalLedgerState,
  GoalRecord,
  IntegrationAcceptanceRecord,
  IssueReference,
  MilestoneRecord,
  PhaseOwner,
  PhaseRecord,
  RunManifestReference,
  TaskAcceptanceRecord,
  TaskRecord,
} from "../goal-ledger.js";
import { computeReadyMissingFields } from "../goal-ledger.js";
import type {
  ObserverAgentContextState,
  ObserverDiagnostic,
  ObserverGoalLedgerStatus,
  ObserverIntakeIssueState,
  ObserverRoleThreadState,
  ObserverRunManifestRecord,
  ObserverRunManifestStage,
  ObserverStateSnapshot,
} from "./read-state.js";

export interface ObserverModel {
  generatedAt: string;
  configUsable: boolean;
  diagnostics: ObserverDiagnostic[];
  repositories: ObserverRepositoryView[];
  ledger: ObserverLedgerView;
}

export interface ObserverLedgerView {
  status: ObserverGoalLedgerStatus;
  goals: ObserverGoalView[];
  filteredGoalCount: number;
  unlinkedRuns: ObserverRunManifestRecord[];
}

export interface ObserverGoalView {
  id: string;
  title: string;
  status: string;
  qualityBaseline: string;
  issueRefs: ObserverIssueRefView[];
  phases: ObserverOwnerPhaseView;
  milestones: ObserverMilestoneView[];
  unassignedTasks: ObserverTaskView[];
}

export interface ObserverMilestoneView {
  id: string;
  title: string;
  qualityBaseline: string;
  issueRefs: ObserverIssueRefView[];
  phases: ObserverOwnerPhaseView;
  tasks: ObserverTaskView[];
}

export interface ObserverTaskView {
  id: string;
  title: string;
  status: string;
  readinessMissing: string[];
  qualityBaseline: string;
  dependencies: string[];
  scope: string;
  acceptanceStatementCount: number;
  acceptanceSummary: string;
  parentIssueRef: ObserverIssueRefView | null;
  childIssueRefs: ObserverIssueRefView[];
  phases: ObserverOwnerPhaseView;
  integrationEvents: ObserverIntegrationEventView[];
  runEvidence: ObserverRunEvidenceView[];
  gates: ObserverGateView[];
}

export interface ObserverOwnerPhaseView {
  owner: PhaseOwner;
  active: ObserverPhaseView | null;
  secondary: ObserverPhaseView[];
  statusLabel: string;
  error: string | null;
}

export interface ObserverPhaseView {
  id: string;
  name: string;
  status: string;
  qualityBaseline: string;
  objective: string;
  acceptanceStatementCount: number;
  dependencies: string[];
  integrationEvents: ObserverIntegrationEventView[];
}

export interface ObserverIntegrationEventView {
  status: string;
  reviewerRole: string;
  parentIssue: string;
  capturedAt: string;
}

export interface ObserverRunEvidenceView {
  label: string;
  resolution: string;
  run: ObserverRunManifestRecord | null;
}

export interface ObserverGateView {
  label: string;
  basis: string;
  nextIssue: string;
}

export interface ObserverIssueRefView {
  label: string;
  relation: string;
  status: string;
  watched: boolean;
  roundtableChild: boolean;
  notePreview: string | null;
}

export interface ObserverRepositoryView {
  owner: string;
  repo: string;
  key: string;
  issues: ObserverIssueView[];
  hasRecords: boolean;
}

export interface ObserverIssueView {
  owner: string;
  repo: string;
  number: number;
  key: string;
  sources: string[];
  latestRunStage: ObserverRunManifestStage | null;
  intake: ObserverIntakeIssueState | null;
  roleThreads: Array<{ role: string; state: ObserverRoleThreadState }>;
  agentContexts: Array<{ role: string; state: ObserverAgentContextState }>;
  runs: ObserverRunManifestRecord[];
  execution: ObserverIssueExecutionView;
}

export interface ObserverIssueExecutionView {
  nodes: ObserverExecutionNodeView[];
  edges: ObserverExecutionEdgeView[];
  tokenSummary: ObserverTokenSummaryView;
}

export interface ObserverExecutionNodeView {
  id: string;
  kind: "codex-run" | "stuck-no-trigger" | "dead-letter" | "failed" | "waiting";
  status: "completed" | "stuck" | "dead-letter" | "failed" | "waiting";
  title: string;
  completedAt: string;
  role?: string;
  stage?: ObserverRunManifestStage;
  reason?: string;
  failureCount?: number;
  deadLetter?: boolean;
  run?: ObserverRunManifestRecord;
}

export interface ObserverExecutionEdgeView {
  from: string;
  to: string;
  label: string;
}

export interface ObserverTokenSummaryView {
  inputTokens: ObserverTokenValueView;
  outputTokens: ObserverTokenValueView;
  cachedInputTokens: ObserverTokenValueView;
  cachedShare: string;
  unknownDenominator: boolean;
  runs: ObserverRunTokenView[];
}

export interface ObserverTokenValueView {
  value: number;
  unknown: boolean;
}

export interface ObserverRunTokenView {
  runId: string;
  role: string;
  stage: ObserverRunManifestStage;
  completedAt: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  cachedShare: string;
  unknownDenominator: boolean;
  cacheSuspicious: boolean;
}

interface IssueAccumulator {
  owner: string;
  repo: string;
  number: number;
  key: string;
  sources: Set<string>;
  intake: ObserverIntakeIssueState | null;
  roleThreads: Map<string, ObserverRoleThreadState>;
  agentContexts: Map<string, ObserverAgentContextState>;
  runs: ObserverRunManifestRecord[];
}

const ROUNDTABLE_KEY_PATTERN = /agent-moebius-roundtable-key:[a-f0-9]{32}/u;
const HIDDEN_KEY_PATTERN =
  /agent-moebius-(?:orchestration|roundtable|roundtable-completion|integration-acceptance)-key:[a-f0-9]{32}/gu;

export function buildObserverModel(snapshot: ObserverStateSnapshot, now = new Date()): ObserverModel {
  const repositoryMaps = new Map<string, Map<string, IssueAccumulator>>();
  for (const repository of snapshot.watchRepositories) {
    repositoryMaps.set(makeRepoKey(repository), new Map());
  }

  const addIssue = (repository: RepositoryRef & { number: number }, source: string): IssueAccumulator | null => {
    const repoKey = makeRepoKey(repository);
    const repoIssues = repositoryMaps.get(repoKey);
    if (repoIssues === undefined) {
      return null;
    }

    const issueKey = `${repoKey}#${repository.number}`;
    const existing = repoIssues.get(issueKey);
    if (existing !== undefined) {
      existing.sources.add(source);
      return existing;
    }

    const issue: IssueAccumulator = {
      owner: repository.owner,
      repo: repository.repo,
      number: repository.number,
      key: issueKey,
      sources: new Set([source]),
      intake: null,
      roleThreads: new Map(),
      agentContexts: new Map(),
      runs: [],
    };
    repoIssues.set(issueKey, issue);
    return issue;
  };

  for (const issue of Object.values(snapshot.intakeState.issues)) {
    const view = addIssue({ owner: issue.owner, repo: issue.repo, number: issue.issueNumber }, "intake");
    if (view !== null) {
      view.intake = issue;
    }
  }

  for (const [issueKey, roles] of Object.entries(snapshot.roleThreads)) {
    const parsed = parseIssueKey(issueKey);
    if (parsed === null) {
      continue;
    }

    const view = addIssue(parsed, "role threads");
    if (view !== null) {
      for (const [role, state] of Object.entries(roles)) {
        view.roleThreads.set(role, state);
      }
    }
  }

  for (const [issueKey, roles] of Object.entries(snapshot.agentContexts)) {
    const parsed = parseIssueKey(issueKey);
    if (parsed === null) {
      continue;
    }

    const view = addIssue(parsed, "agent contexts");
    if (view !== null) {
      for (const [role, state] of Object.entries(roles)) {
        view.agentContexts.set(role, state);
      }
    }
  }

  for (const run of snapshot.runManifests) {
    const view = addIssue({ owner: run.issue.owner, repo: run.issue.repo, number: run.issue.number }, "run manifests");
    if (view !== null) {
      view.runs.push(run);
    }
  }

  const repositories = snapshot.watchRepositories.map((repository) => {
    const key = makeRepoKey(repository);
    const issues = Array.from(repositoryMaps.get(key)?.values() ?? [])
      .map(toIssueView)
      .sort((left, right) => left.number - right.number);

    return {
      owner: repository.owner,
      repo: repository.repo,
      key,
      issues,
      hasRecords: issues.length > 0,
    };
  });

  return {
    generatedAt: now.toISOString(),
    configUsable: snapshot.configUsable,
    diagnostics: snapshot.diagnostics,
    repositories,
    ledger: buildLedgerView(snapshot),
  };
}

export function parseIssueKey(issueKey: string): (RepositoryRef & { number: number }) | null {
  const match = /^([^/]+)\/([^#]+)#([1-9]\d*)$/.exec(issueKey);
  if (match === null) {
    return null;
  }

  return {
    owner: match[1] ?? "",
    repo: match[2] ?? "",
    number: Number(match[3]),
  };
}

function buildLedgerView(snapshot: ObserverStateSnapshot): ObserverLedgerView {
  if (snapshot.goalLedgerStatus === "error" || snapshot.goalLedgerStatus === "timeout") {
    return {
      status: snapshot.goalLedgerStatus,
      goals: [],
      filteredGoalCount: 0,
      unlinkedRuns: [...snapshot.runManifests].sort(compareRunsDesc),
    };
  }

  const watchKeys = new Set(snapshot.watchRepositories.map((repository) => makeRepoKey(repository)));
  const linkedRunLines = new Set<number>();
  const goals: ObserverGoalView[] = [];
  let filteredGoalCount = 0;

  for (const goal of Object.values(snapshot.goalLedger.goals).sort(compareById)) {
    if (!goalMatchesWatch(snapshot.goalLedger, goal, watchKeys)) {
      filteredGoalCount += 1;
      continue;
    }
    const goalView = toGoalView(snapshot.goalLedger, goal, watchKeys, linkedRunLines, snapshot.runManifests);
    goals.push(goalView);
  }

  const unlinkedRuns = snapshot.runManifests
    .filter((run) => run.lineNumber === undefined || !linkedRunLines.has(run.lineNumber))
    .sort(compareRunsDesc);

  return {
    status: snapshot.goalLedgerStatus,
    goals,
    filteredGoalCount,
    unlinkedRuns,
  };
}

function toGoalView(
  state: GoalLedgerState,
  goal: GoalRecord,
  watchKeys: Set<string>,
  linkedRunLines: Set<number>,
  runs: ObserverRunManifestRecord[],
): ObserverGoalView {
  const milestoneIds = uniqueStrings([
    ...goal.milestoneIds,
    ...Object.values(state.milestones)
      .filter((milestone) => milestone.goalId === goal.id)
      .map((milestone) => milestone.id),
  ]);
  const milestones = milestoneIds
    .map((milestoneId) => state.milestones[milestoneId])
    .filter((milestone): milestone is MilestoneRecord => milestone !== undefined)
    .map((milestone) => toMilestoneView(state, milestone, watchKeys, linkedRunLines, runs));
  const assignedTaskIds = new Set(milestones.flatMap((milestone) => milestone.tasks.map((task) => task.id)));
  const unassignedTasks = Object.values(state.tasks)
    .filter((task) => task.goalId === goal.id && task.milestoneId === undefined && !assignedTaskIds.has(task.id))
    .sort(compareById)
    .map((task) => toTaskView(state, task, watchKeys, linkedRunLines, runs));

  return {
    id: goal.id,
    title: goal.title,
    status: goal.status,
    qualityBaseline: goal.qualityBaseline ?? "missing",
    issueRefs: [...goal.issueRefs, ...goal.provenance.map((provenance) => issueRefFromProvenance(provenance.issue, "source"))]
      .map((reference) => toIssueRefView(reference, watchKeys))
      .sort(compareIssueRefs),
    phases: buildOwnerPhaseView(state, { kind: "goal", id: goal.id }),
    milestones,
    unassignedTasks,
  };
}

function toMilestoneView(
  state: GoalLedgerState,
  milestone: MilestoneRecord,
  watchKeys: Set<string>,
  linkedRunLines: Set<number>,
  runs: ObserverRunManifestRecord[],
): ObserverMilestoneView {
  const taskIds = uniqueStrings([
    ...milestone.taskIds,
    ...Object.values(state.tasks)
      .filter((task) => task.milestoneId === milestone.id)
      .map((task) => task.id),
  ]);
  const tasks = taskIds
    .map((taskId) => state.tasks[taskId])
    .filter((task): task is TaskRecord => task !== undefined)
    .map((task) => toTaskView(state, task, watchKeys, linkedRunLines, runs));

  return {
    id: milestone.id,
    title: milestone.title,
    qualityBaseline: milestone.qualityBaseline,
    issueRefs: [...milestone.issueRefs, ...milestone.provenance.map((provenance) => issueRefFromProvenance(provenance.issue, "source"))]
      .map((reference) => toIssueRefView(reference, watchKeys))
      .sort(compareIssueRefs),
    phases: buildOwnerPhaseView(state, { kind: "milestone", id: milestone.id }),
    tasks,
  };
}

function toTaskView(
  state: GoalLedgerState,
  task: TaskRecord,
  watchKeys: Set<string>,
  linkedRunLines: Set<number>,
  runs: ObserverRunManifestRecord[],
): ObserverTaskView {
  const phases = buildOwnerPhaseView(state, { kind: "task", id: task.id });
  const childIssueRefs = task.childIssueRefs.map((reference) => toIssueRefView(reference, watchKeys)).sort(compareIssueRefs);
  const runEvidence = task.runManifestRefs.map((reference) => toRunEvidence(reference, runs, linkedRunLines));
  const integrationEvents = phases.active?.integrationEvents ?? phases.secondary.flatMap((phase) => phase.integrationEvents);
  const gates = buildTaskGates(task, phases);

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    readinessMissing: computeReadyMissingFields(task),
    qualityBaseline: task.qualityBaseline ?? "missing",
    dependencies: task.dependencies ?? [],
    scope: task.scope ?? "missing",
    acceptanceStatementCount: task.acceptanceStatements?.length ?? 0,
    acceptanceSummary: formatAcceptanceSummary(task),
    parentIssueRef: task.parentIssueRef === undefined ? null : toIssueRefView(task.parentIssueRef, watchKeys),
    childIssueRefs,
    phases,
    integrationEvents,
    runEvidence,
    gates,
  };
}

function buildOwnerPhaseView(state: GoalLedgerState, owner: PhaseOwner): ObserverOwnerPhaseView {
  const phases = Object.values(state.phases)
    .filter((phase) => sameOwner(phase.owner, owner))
    .sort(compareById);
  const activePhases = phases.filter((phase) => phase.status === "active");
  const secondary = phases.filter((phase) => phase.status !== "active").map(toPhaseView);
  if (activePhases.length === 0) {
    return {
      owner,
      active: null,
      secondary,
      statusLabel: "no active phase",
      error: null,
    };
  }
  if (activePhases.length > 1) {
    return {
      owner,
      active: null,
      secondary: [...activePhases.map(toPhaseView), ...secondary],
      statusLabel: "ledger error",
      error: `multiple active phases: ${activePhases.map((phase) => phase.id).join(", ")}`,
    };
  }

  const active = activePhases[0];
  const missingFields = active === undefined ? [] : missingActivePhaseFields(active);
  return {
    owner,
    active: active === undefined ? null : toPhaseView(active),
    secondary,
    statusLabel: missingFields.length === 0 ? "active" : "ledger error",
    error: missingFields.length === 0 ? null : `active phase missing ${missingFields.join(", ")}`,
  };
}

function toPhaseView(phase: PhaseRecord): ObserverPhaseView {
  return {
    id: phase.id,
    name: phase.name,
    status: phase.status,
    qualityBaseline: phase.qualityBaseline,
    objective: phase.objective ?? "missing",
    acceptanceStatementCount: phase.acceptanceStatements?.length ?? 0,
    dependencies: phase.dependencies ?? [],
    integrationEvents: (phase.integrationAcceptance ?? []).map(toIntegrationEventView),
  };
}

function toIntegrationEventView(event: IntegrationAcceptanceRecord): ObserverIntegrationEventView {
  return {
    status: event.status,
    reviewerRole: event.reviewerRole,
    parentIssue: issueLabel(event.parentIssue),
    capturedAt: event.capturedAt,
  };
}

function toIssueRefView(reference: IssueReference, watchKeys: Set<string>): ObserverIssueRefView {
  return {
    label: issueLabel(reference),
    relation: reference.relation,
    status: reference.status,
    watched: watchKeys.has(makeRepoKey(reference)),
    roundtableChild: reference.relation === "child" && ROUNDTABLE_KEY_PATTERN.test(reference.note ?? ""),
    notePreview: sanitizeNote(reference.note),
  };
}

function toRunEvidence(
  reference: RunManifestReference,
  runs: ObserverRunManifestRecord[],
  linkedRunLines: Set<number>,
): ObserverRunEvidenceView {
  if (reference.locator?.kind === "jsonl-line") {
    const line = reference.locator.line;
    linkedRunLines.add(line);
    const run = runs.find((candidate) => candidate.lineNumber === line) ?? null;
    return {
      label: `.state/run-manifests.jsonl line ${line}`,
      resolution: reference.resolution,
      run,
    };
  }
  if (reference.locator?.kind === "run-dir") {
    return {
      label: reference.locator.runDir,
      resolution: reference.resolution,
      run: null,
    };
  }
  return {
    label: `${issueLabel(reference.issue)} ${reference.role} ${reference.completedAt}`,
    resolution: reference.resolution,
    run: null,
  };
}

function buildTaskGates(task: TaskRecord, phases: ObserverOwnerPhaseView): ObserverGateView[] {
  const gates: ObserverGateView[] = [];
  const acceptanceChildRefs = task.childIssueRefs.filter((reference) => !isRoundtableReference(reference));
  if (acceptanceChildRefs.length === 0) {
    gates.push({
      label: "waiting child acceptance by reviewer",
      basis: "ledger task childIssueRefs",
      nextIssue: task.parentIssueRef === undefined ? "闸口不可定位：ledger 缺 parent/child issue reference" : issueLabel(task.parentIssueRef),
    });
  }

  for (const reference of acceptanceChildRefs) {
    const fact = latestAcceptanceFactForIssue(task.acceptanceFacts ?? [], reference);
    if (fact === undefined) {
      gates.push({
        label: "waiting child acceptance by child reviewer",
        basis: `child issue ref ${issueLabel(reference)}`,
        nextIssue: issueLabel(reference),
      });
    } else if (fact.status === "failed") {
      gates.push({
        label: `waiting repair or re-acceptance by ${fact.role}`,
        basis: `acceptance fact ${fact.factKey}`,
        nextIssue: issueLabel(reference),
      });
    }
  }

  if (phases.error !== null) {
    gates.push({ label: phases.error, basis: "phase projection", nextIssue: "闸口不可定位：ledger 缺 parent/child issue reference" });
  }

  const active = phases.active;
  if (active !== null && active.integrationEvents.length > 0) {
    const latest = latestIntegrationEvent(active.integrationEvents);
    if (latest !== null && latest.status !== "passed") {
      gates.push({
        label: `waiting integration acceptance: ${latest.status}`,
        basis: `integration event ${latest.status} by ${latest.reviewerRole}`,
        nextIssue: task.parentIssueRef === undefined ? "闸口不可定位：ledger 缺 parent/child issue reference" : issueLabel(task.parentIssueRef),
      });
    }
  } else if (active !== null && allAcceptanceChildrenPassed(task, acceptanceChildRefs)) {
    gates.push({
      label: "waiting integration acceptance by parent reviewer",
      basis: "child acceptance facts",
      nextIssue: task.parentIssueRef === undefined ? "闸口不可定位：ledger 缺 parent/child issue reference" : issueLabel(task.parentIssueRef),
    });
  }

  return gates;
}

function formatAcceptanceSummary(task: TaskRecord): string {
  const acceptanceChildRefs = task.childIssueRefs.filter((reference) => !isRoundtableReference(reference));
  const latestFacts = latestAcceptanceFacts(task).filter((fact) =>
    acceptanceChildRefs.some((reference) => issueMatches(fact.issue, reference)),
  );
  if (latestFacts.length === 0) {
    return "no acceptance facts";
  }

  const counts: Record<AcceptanceFactStatus, number> = { passed: 0, failed: 0 };
  for (const fact of latestFacts) {
    counts[fact.status] += 1;
  }
  return `passed ${counts.passed}, failed ${counts.failed}`;
}

function allAcceptanceChildrenPassed(task: TaskRecord, references: IssueReference[]): boolean {
  if (references.length === 0) {
    return false;
  }

  return references.every((reference) => latestAcceptanceFactForIssue(task.acceptanceFacts ?? [], reference)?.status === "passed");
}

function latestAcceptanceFacts(task: TaskRecord): TaskAcceptanceRecord[] {
  const facts = task.acceptanceFacts ?? [];
  const byIssue = new Map<string, TaskAcceptanceRecord>();
  for (const fact of [...facts].sort(compareAcceptanceFactsDesc)) {
    const key = issueLabel(fact.issue);
    if (!byIssue.has(key)) {
      byIssue.set(key, fact);
    }
  }
  return Array.from(byIssue.values());
}

function latestAcceptanceFactForIssue(
  facts: TaskAcceptanceRecord[],
  reference: IssueReference,
): TaskAcceptanceRecord | undefined {
  return [...facts].sort(compareAcceptanceFactsDesc).find((fact) => issueMatches(fact.issue, reference));
}

function latestIntegrationEvent(events: ObserverIntegrationEventView[]): ObserverIntegrationEventView | null {
  return [...events].sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0] ?? null;
}

function goalMatchesWatch(state: GoalLedgerState, goal: GoalRecord, watchKeys: Set<string>): boolean {
  const references: Array<{ owner: string; repo: string; number: number }> = [
    ...goal.issueRefs,
    ...goal.provenance.map((provenance) => provenance.issue),
  ];
  const milestones = Object.values(state.milestones).filter((milestone) => milestone.goalId === goal.id);
  for (const milestone of milestones) {
    references.push(...milestone.issueRefs, ...milestone.provenance.map((provenance) => provenance.issue));
  }
  const tasks = Object.values(state.tasks).filter((task) => task.goalId === goal.id);
  for (const task of tasks) {
    references.push(...task.childIssueRefs, ...task.provenance.map((provenance) => provenance.issue));
    if (task.parentIssueRef !== undefined) {
      references.push(task.parentIssueRef);
    }
  }
  const phases = Object.values(state.phases).filter((phase) => ownerBelongsToGoal(state, phase.owner, goal.id));
  for (const phase of phases) {
    references.push(...phase.provenance.map((provenance) => provenance.issue));
  }

  return references.some((reference) => watchKeys.has(makeRepoKey(reference)));
}

function ownerBelongsToGoal(state: GoalLedgerState, owner: PhaseOwner, goalId: string): boolean {
  if (owner.kind === "goal") {
    return owner.id === goalId;
  }
  if (owner.kind === "milestone") {
    return state.milestones[owner.id]?.goalId === goalId;
  }
  return state.tasks[owner.id]?.goalId === goalId;
}

function issueRefFromProvenance(
  issue: { owner: string; repo: string; number: number },
  relation: IssueReference["relation"],
): IssueReference {
  return {
    owner: issue.owner,
    repo: issue.repo,
    number: issue.number,
    relation,
    status: "unknown",
  };
}

function sanitizeNote(note: string | undefined): string | null {
  if (note === undefined) {
    return null;
  }
  const sanitized = note.replace(HIDDEN_KEY_PATTERN, "[hidden-key]").replace(/\s+/g, " ").trim();
  if (sanitized.length === 0 || sanitized === "[hidden-key]") {
    return null;
  }
  return sanitized.length <= 120 ? sanitized : `${sanitized.slice(0, 117)}...`;
}

function isRoundtableReference(reference: IssueReference): boolean {
  return reference.relation === "child" && ROUNDTABLE_KEY_PATTERN.test(reference.note ?? "");
}

function missingActivePhaseFields(phase: PhaseRecord): string[] {
  const missing: string[] = [];
  if (phase.objective === undefined || phase.objective.length === 0) {
    missing.push("objective");
  }
  if (!Array.isArray(phase.acceptanceStatements)) {
    missing.push("acceptanceStatements");
  }
  if (!Array.isArray(phase.dependencies)) {
    missing.push("dependencies");
  }
  return missing;
}

function sameOwner(left: PhaseOwner, right: PhaseOwner): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function issueMatches(left: { owner: string; repo: string; number: number }, right: { owner: string; repo: string; number: number }): boolean {
  return left.owner === right.owner && left.repo === right.repo && left.number === right.number;
}

function issueLabel(issue: { owner: string; repo: string; number: number }): string {
  return `${issue.owner}/${issue.repo} issue ${issue.number}`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function toIssueView(issue: IssueAccumulator): ObserverIssueView {
  const runs = [...issue.runs].sort(compareRunsDesc);
  const execution = buildIssueExecutionView(issue, runs);
  return {
    owner: issue.owner,
    repo: issue.repo,
    number: issue.number,
    key: issue.key,
    sources: Array.from(issue.sources).sort(),
    latestRunStage: runs[0]?.stage ?? null,
    intake: issue.intake,
    roleThreads: Array.from(issue.roleThreads.entries())
      .map(([role, state]) => ({ role, state }))
      .sort((left, right) => left.role.localeCompare(right.role)),
    agentContexts: Array.from(issue.agentContexts.entries())
      .map(([role, state]) => ({ role, state }))
      .sort((left, right) => left.role.localeCompare(right.role)),
    runs,
    execution,
  };
}

function buildIssueExecutionView(issue: IssueAccumulator, runsDesc: ObserverRunManifestRecord[]): ObserverIssueExecutionView {
  const runsAsc = [...runsDesc].sort(compareRunsAsc);
  const nodes: ObserverExecutionNodeView[] = runsAsc.map((run, index) => ({
    id: runNodeId(run, index),
    kind: "codex-run",
    status: "completed",
    title: `Codex run ${run.role} ${run.stage}`,
    completedAt: run.completedAt,
    role: run.role,
    stage: run.stage,
    run,
  }));

  const intakeNode = buildIntakeOutcomeNode(issue.intake);
  if (intakeNode !== null) {
    nodes.push(intakeNode);
  }

  const edges: ObserverExecutionEdgeView[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];
    if (previous === undefined || current === undefined) {
      continue;
    }

    const sameRole =
      previous.kind === "codex-run" &&
      current.kind === "codex-run" &&
      previous.role !== undefined &&
      previous.role === current.role;
    edges.push({
      from: previous.id,
      to: current.id,
      label: sameRole ? "resume" : "next",
    });
  }

  return {
    nodes,
    edges,
    tokenSummary: buildTokenSummary(runsAsc),
  };
}

function buildIntakeOutcomeNode(intake: ObserverIntakeIssueState | null): ObserverExecutionNodeView | null {
  if (intake === null) {
    return null;
  }

  const failureCount = intake.lastOutcome?.failureCount ?? intake.failureCount ?? 0;
  const reason = intake.lastOutcome?.reason ?? intake.lastFailureReason ?? "unknown";
  const completedAt = intake.lastOutcome?.recordedAt ?? intake.nextPollAt ?? intake.updatedAt;

  if (intake.lastOutcome?.result === "no-trigger" && intake.lastOutcome.reason === "skip:no-trigger") {
    return {
      id: "intake-stuck-no-trigger",
      kind: "stuck-no-trigger",
      status: "stuck",
      title: "Stuck: no trigger",
      completedAt,
      reason: intake.lastOutcome.reason,
      failureCount,
    };
  }

  if (intake.lastOutcome?.result === "dead-lettered" || failureCount >= 5) {
    return {
      id: "intake-dead-letter",
      kind: "dead-letter",
      status: "dead-letter",
      title: "Dead letter",
      completedAt,
      reason: reason === "unknown" ? "dead-lettered:unknown" : reason,
      failureCount,
      deadLetter: true,
    };
  }

  if (intake.lastOutcome?.result === "failed" || failureCount > 0) {
    return {
      id: "intake-failed",
      kind: "failed",
      status: "failed",
      title: "Processing failed",
      completedAt,
      reason,
      failureCount,
    };
  }

  if (intake.lastOutcome?.result === "interrupted") {
    return {
      id: "intake-interrupted",
      kind: "waiting",
      status: "waiting",
      title: "Interrupted",
      completedAt,
      reason,
      failureCount,
    };
  }

  return null;
}

function buildTokenSummary(runsAsc: ObserverRunManifestRecord[]): ObserverTokenSummaryView {
  const inputTokens = sumTokenField(runsAsc, "inputTokens");
  const outputTokens = sumTokenField(runsAsc, "outputTokens");
  const cachedInputTokens = sumTokenField(runsAsc, "cachedInputTokens");
  const tokenRuns: ObserverRunTokenView[] = runsAsc.map((run, index) => {
    const usage = run.usage;
    const input = usage?.inputTokens ?? null;
    const output = usage?.outputTokens ?? null;
    const cached = usage?.cachedInputTokens ?? null;
    const cachedShareValue = computeCachedShare(input, cached);
    return {
      runId: runNodeId(run, index),
      role: run.role,
      stage: run.stage,
      completedAt: run.completedAt,
      inputTokens: input,
      outputTokens: output,
      cachedInputTokens: cached,
      cachedShare: cachedShareValue === null ? "unknown" : formatPercent(cachedShareValue),
      unknownDenominator: cachedShareValue === null,
      cacheSuspicious: false,
    };
  });

  const previousByRole = new Map<string, number>();
  for (const run of tokenRuns) {
    const currentShare = parseShare(run.cachedShare);
    const previousShare = previousByRole.get(run.role);
    if (currentShare !== null && previousShare !== undefined) {
      run.cacheSuspicious = previousShare > 0 && (currentShare === 0 || currentShare < previousShare * 0.2);
    }
    if (currentShare !== null) {
      previousByRole.set(run.role, currentShare);
    }
  }

  const totalCachedShare = computeCachedShare(inputTokens.value, cachedInputTokens.value);
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    cachedShare: totalCachedShare === null ? "unknown" : formatPercent(totalCachedShare),
    unknownDenominator: inputTokens.unknown || cachedInputTokens.unknown || totalCachedShare === null,
    runs: tokenRuns,
  };
}

function sumTokenField(
  runs: ObserverRunManifestRecord[],
  field: "inputTokens" | "outputTokens" | "cachedInputTokens",
): ObserverTokenValueView {
  let value = 0;
  let unknown = false;
  for (const run of runs) {
    const fieldValue = run.usage?.[field];
    if (fieldValue === undefined) {
      unknown = true;
    } else {
      value += fieldValue;
    }
  }
  return { value, unknown };
}

function computeCachedShare(inputTokens: number | null | undefined, cachedInputTokens: number | null | undefined): number | null {
  if (inputTokens === undefined || inputTokens === null || inputTokens <= 0 || cachedInputTokens === undefined || cachedInputTokens === null) {
    return null;
  }
  return cachedInputTokens / inputTokens;
}

function parseShare(value: string): number | null {
  if (value === "unknown" || !value.endsWith("%")) {
    return null;
  }
  const parsed = Number(value.slice(0, -1));
  return Number.isFinite(parsed) ? parsed / 100 : null;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

export function runNodeId(run: ObserverRunManifestRecord, index: number): string {
  if (run.lineNumber !== undefined) {
    return `run-line-${run.lineNumber}`;
  }
  return `run-${index + 1}-${run.role}-${run.completedAt}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function compareRunsDesc(left: ObserverRunManifestRecord, right: ObserverRunManifestRecord): number {
  return right.completedAt.localeCompare(left.completedAt);
}

function compareRunsAsc(left: ObserverRunManifestRecord, right: ObserverRunManifestRecord): number {
  return left.completedAt.localeCompare(right.completedAt);
}

function compareById(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function compareIssueRefs(left: ObserverIssueRefView, right: ObserverIssueRefView): number {
  return left.label.localeCompare(right.label);
}

function compareAcceptanceFactsDesc(left: TaskAcceptanceRecord, right: TaskAcceptanceRecord): number {
  const captured = right.capturedAt.localeCompare(left.capturedAt);
  return captured === 0 ? right.messageIndex - left.messageIndex : captured;
}
