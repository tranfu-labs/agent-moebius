import path from "node:path";
import { AGENTS_DIR, DATA_ROOT, GOAL_LEDGER_STATE_PATH } from "../config.js";
import { formatCeoScriptsForPrompt, loadCeoScripts } from "../ceo-scripts.js";
import {
  projectActivePhaseContext,
  type ActivePhaseContextProjection,
  type GoalLedgerState,
  type IssueReference,
  type PhaseOwner,
  type TaskRecord,
} from "../goal-ledger.js";
import { loadGoalLedgerState } from "../goal-ledger-state.js";
import type { IssueSource } from "../issue-source.js";
import type { AgentPreScriptInput, AgentPreScriptResult } from "./types.js";

export const CEO_LEDGER_CONTEXT_PRE_SCRIPT_PATH = "src/agent-prescripts/ceo-ledger-context.ts";

export type CeoLedgerPromptContext =
  | {
      mode: "active";
      owner: PhaseOwner;
      projection: ActivePhaseContextProjection;
      visibleTasks: TaskRecord[];
      promptContext: string;
    }
  | {
      mode: "intakeBootstrap";
      owner?: undefined;
      projection?: undefined;
      visibleTasks: [];
      promptContext: string;
    };

export async function runCeoLedgerContextPreScript(
  input: AgentPreScriptInput,
): Promise<AgentPreScriptResult> {
  try {
    const ledgerPath = path.join(DATA_ROOT, GOAL_LEDGER_STATE_PATH);
    const ledger = await loadGoalLedgerState(ledgerPath);
    const scripts = await loadCeoScripts({ agentsDir: AGENTS_DIR, required: true });
    const context = resolveCeoLedgerPromptContext({
      ledger,
      source: input.issueSource,
      scriptsPrompt: formatCeoScriptsForPrompt(scripts),
    });

    return {
      ok: true,
      codexCwd: DATA_ROOT,
      promptContext: context.promptContext,
    };
  } catch (error) {
    const reason = `ceo-ledger-context-error:${formatError(error)}`;
    return {
      ok: false,
      reason,
      visibleFailureBody: formatCeoLedgerContextFailure(reason),
    };
  }
}

export function resolveCeoLedgerPromptContext(input: {
  ledger: GoalLedgerState;
  source: IssueSource;
  scriptsPrompt: string;
}): CeoLedgerPromptContext {
  let owner: PhaseOwner;
  try {
    owner = resolveUniqueIssueOwner(input.ledger, input.source);
  } catch (error) {
    if (isBootstrapEligibleOwnerResolutionError(error)) {
      return {
        mode: "intakeBootstrap",
        visibleTasks: [],
        promptContext: formatIntakeBootstrapPromptContext({
          source: input.source,
          scriptsPrompt: input.scriptsPrompt,
          reason: formatError(error),
        }),
      };
    }
    throw error;
  }
  const projection = projectActivePhaseContext(input.ledger, owner);
  if (projection.status !== "active") {
    return {
      mode: "intakeBootstrap",
      visibleTasks: [],
      promptContext: formatIntakeBootstrapPromptContext({
        source: input.source,
        scriptsPrompt: input.scriptsPrompt,
        reason: `no-active-phase:${owner.kind}:${owner.id}`,
      }),
    };
  }
  const visibleTasks = resolveVisibleTasks(input.ledger, owner);
  if (visibleTasks.length === 0) {
    throw new Error(`no-visible-tasks:${owner.kind}:${owner.id}`);
  }

  return {
    mode: "active",
    owner,
    projection,
    visibleTasks,
    promptContext: formatPromptContext({ owner, projection, visibleTasks, scriptsPrompt: input.scriptsPrompt }),
  };
}

export function resolveUniqueIssueOwner(ledger: GoalLedgerState, source: IssueSource): PhaseOwner {
  const owners = new Map<string, PhaseOwner>();
  const addOwner = (owner: PhaseOwner, refs: IssueReference[], provenance: Array<{ issue: IssueSourceLike }>) => {
    if (refs.some((reference) => issueReferenceMatches(reference, source)) || provenance.some((entry) => issueSourceMatches(entry.issue, source))) {
      owners.set(`${owner.kind}:${owner.id}`, owner);
    }
  };

  for (const goal of Object.values(ledger.goals)) {
    addOwner({ kind: "goal", id: goal.id }, goal.issueRefs, goal.provenance);
  }
  for (const milestone of Object.values(ledger.milestones)) {
    addOwner({ kind: "milestone", id: milestone.id }, milestone.issueRefs, milestone.provenance);
  }
  for (const task of Object.values(ledger.tasks)) {
    const refs = [...(task.parentIssueRef === undefined ? [] : [task.parentIssueRef]), ...task.childIssueRefs];
    const taskOwner: PhaseOwner = { kind: "task", id: task.id };
    const beforeSize = owners.size;
    addOwner(taskOwner, refs, task.provenance);
    if (owners.size !== beforeSize && owners.has(`${taskOwner.kind}:${taskOwner.id}`)) {
      if (ledger.goals[task.goalId] !== undefined) {
        owners.set(`goal:${task.goalId}`, { kind: "goal", id: task.goalId });
      }
      for (const milestone of Object.values(ledger.milestones)) {
        if (milestone.taskIds.includes(task.id)) {
          owners.set(`milestone:${milestone.id}`, { kind: "milestone", id: milestone.id });
        }
      }
    }
  }

  const values = [...owners.values()];
  const activeValues = values.filter((owner) => {
    try {
      return projectActivePhaseContext(ledger, owner).status === "active";
    } catch {
      return false;
    }
  });
  if (activeValues.length === 1) {
    return activeValues[0]!;
  }
  if (values.length !== 1) {
    throw new Error(`expected-one-ledger-owner:${String(values.length)}; active-candidates=${String(activeValues.length)}`);
  }
  return values[0]!;
}

export function resolveVisibleTasks(ledger: GoalLedgerState, owner: PhaseOwner): TaskRecord[] {
  if (owner.kind === "task") {
    const task = ledger.tasks[owner.id];
    return task === undefined ? [] : [task];
  }
  if (owner.kind === "milestone") {
    const milestone = ledger.milestones[owner.id];
    return milestone === undefined
      ? []
      : milestone.taskIds.map((taskId) => ledger.tasks[taskId]).filter((task): task is TaskRecord => task !== undefined);
  }

  return Object.values(ledger.tasks).filter((task) => task.goalId === owner.id);
}

export function formatCeoLedgerContextFailure(reason: string): string {
  return `CEO 编排路径 fail-closed：${reason}

本轮不会调用 Codex、不会创建子 issue、不会更新 ceo role thread。请先修复目标账本或剧本库后重试。

<!-- moebius:stage=in-progress -->`;
}

function formatPromptContext(input: {
  owner: PhaseOwner;
  projection: Extract<ActivePhaseContextProjection, { status: "active" }>;
  visibleTasks: TaskRecord[];
  scriptsPrompt: string;
}): string {
  const current = input.projection.current;
  const tasks = input.visibleTasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    scope: task.scope ?? null,
    qualityBaseline: task.qualityBaseline ?? null,
    acceptanceStatements: task.acceptanceStatements ?? [],
    dependencies: task.dependencies ?? [],
  }));

  return `CEO agent deterministic context:

Current ledger owner:
${JSON.stringify(input.owner, null, 2)}

Current active phase projection:
${JSON.stringify(current, null, 2)}

Visible ledger task ids:
${input.visibleTasks.map((task) => `- ${task.id}`).join("\n")}

Visible ledger tasks:
${JSON.stringify(tasks, null, 2)}

${input.scriptsPrompt}

Milestone standards reference: docs/roadmap/milestone-standards.md`;
}

function formatIntakeBootstrapPromptContext(input: {
  source: IssueSource;
  scriptsPrompt: string;
  reason: string;
}): string {
  return `CEO agent deterministic context:

Mode: intake bootstrap
Reason: ${input.reason}

Current issue source:
${JSON.stringify({ owner: input.source.owner, repo: input.source.repo, number: input.source.issueNumber }, null, 2)}

There is no current active phase projection for this issue. Choose exactly one bootstrap path from the public timeline:

1. Use the default-plan-chain route workflow when the latest user request is an ordinary target, implementation, design, or "how to do X" entry without explicit split/orchestration intent. This route hands control to dev for OpenSpec interview and plan writing. It does not write ledger entries, does not create child issues, and does not run goal-intake.
2. Use the goal-intake workflow only when the public timeline explicitly asks to split work into multiple tasks, run work in parallel, orchestrate child tasks, create child issues/tasks, phase work and assign roles, or when the user is confirming an existing goal-intake proposal:
   - goal_intake.interview for bounded questions.
   - goal_intake.propose for pending ledger proposal.
   - goal_intake.confirm for a user-confirmed pending proposal.

Do not emit spawn_child_issues or roundtable from this bootstrap context; TypeScript validation will reject them without visible task ids.

${input.scriptsPrompt}

Milestone standards reference: docs/roadmap/milestone-standards.md`;
}

function isBootstrapEligibleOwnerResolutionError(error: unknown): boolean {
  const message = formatError(error);
  const match = message.match(/expected-one-ledger-owner:(\d+); active-candidates=(\d+)/u);
  return match?.[2] === "0";
}

interface IssueSourceLike {
  owner: string;
  repo: string;
  number: number;
}

function issueReferenceMatches(reference: IssueReference, source: IssueSource): boolean {
  return reference.owner === source.owner && reference.repo === source.repo && reference.number === source.issueNumber;
}

function issueSourceMatches(issue: IssueSourceLike, source: IssueSource): boolean {
  return issue.owner === source.owner && issue.repo === source.repo && issue.number === source.issueNumber;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
