import crypto from "node:crypto";
import { CEO_ORCHESTRATION_ACTION_TIMEOUT_MS } from "../config.js";
import {
  buildCeoOrchestrationKey,
  renderCeoChildIssueBody,
  type CeoChildIssueDescriptor,
  type CeoOrchestrationGroup,
} from "../ceo-orchestration.js";
import { formatAgentComment, getLatestTimelineMessage, type TimelineMessage } from "../conversation.js";
import { appendCeoReviewedMetadata } from "../format-ceo.js";
import type { createIssue, fetchIssueState, fetchIssueWithComments, findIssueByOrchestrationKey, postComment } from "../github.js";
import {
  buildAcceptanceStatementsDigest,
  evaluateIntegrationAcceptanceJoin,
  recordIntegrationAcceptanceEvent,
  recordTaskAcceptanceFact,
  type AcceptanceStatementResult,
  type GoalLedgerEntry,
  type GoalLedgerState,
  type PhaseOwner,
  type PhaseRecord,
  type TaskRecord,
} from "../goal-ledger.js";
import type { loadGoalLedgerState, saveGoalLedgerEntry } from "../goal-ledger-state.js";
import type { IssueProcessingOutcome } from "../github-response-intake.js";
import { makeIssueSource, type IssueSource } from "../issue-source.js";
import { log } from "../log.js";
import {
  findTaskByChildIssue,
  findTaskChildIssueRefByOrchestrationKey,
  formatBypassedAgentComment,
  formatCeoOrchestrationFailureBody,
  formatError,
  formatFailureReason,
  issueContainsHiddenKey,
  issueFromReference,
  issueLikeFromReference,
  issueUrl,
  isTaskRecord,
  saveTaskChildIssueRef,
  truncateForComment,
  withTimeout,
  type CeoSpawnCompletedItem,
  type PostVisibleComment,
} from "./runtime-contracts.js";

export interface AcceptancePrePassDependencies {
  loadGoalLedgerState: typeof loadGoalLedgerState;
  saveGoalLedgerEntry: typeof saveGoalLedgerEntry;
  fetchIssueState: typeof fetchIssueState;
  fetchIssueWithComments: typeof fetchIssueWithComments;
  postComment: typeof postComment;
  findIssueByOrchestrationKey: typeof findIssueByOrchestrationKey;
  createIssue: typeof createIssue;
}

interface ParsedAcceptanceWalkthrough {
  status: "passed" | "failed";
  statementResults: AcceptanceStatementResult[];
  failedStatementIds: string[];
  failedStatements: string[];
}

interface IntegrationOwnerResolution {
  owner: PhaseOwner;
  phase: PhaseRecord;
  parentIssue: { owner: string; repo: string; number: number };
}

export async function maybeProcessIntegrationAcceptancePrePass(input: {
  source: IssueSource;
  issue: { comments: Array<{ id: string; body: string }>; body: string };
  timeline: TimelineMessage[];
  agentNames: string[];
  count: number;
  postVisibleComment: PostVisibleComment;
  dependencies: AcceptancePrePassDependencies;
}): Promise<IssueProcessingOutcome | null> {
  const latestMessage = getLatestTimelineMessage(input.timeline);
  if (latestMessage === null || latestMessage.source !== "comment") {
    return null;
  }

  const latestComment = input.issue.comments[latestMessage.index - 1];
  if (latestComment === undefined) {
    return null;
  }
  if (!isAcceptanceReviewerRole(latestMessage.speaker, input.agentNames)) {
    return null;
  }

  const ledger = await withTimeout(
    input.dependencies.loadGoalLedgerState(),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "loadGoalLedgerState",
  );
  const childTask = findTaskByChildIssue(ledger, input.source);
  if (childTask !== null) {
    return processChildTaskAcceptance({
      ...input,
      latestMessage,
      latestCommentId: latestComment.id,
      ledger,
      task: childTask,
      reviewerRole: latestMessage.speaker,
    });
  }

  const parentResolution = findIntegrationOwnerForParentIssue(ledger, input.source);
  if (parentResolution === null) {
    return null;
  }

  return processParentIntegrationAcceptance({
    ...input,
    latestMessage,
    latestCommentId: latestComment.id,
    ledger,
    resolution: parentResolution,
    reviewerRole: latestMessage.speaker,
  });
}

async function processChildTaskAcceptance(input: {
  source: IssueSource;
  issue: { comments: Array<{ id: string; body: string }>; body: string };
  timeline: TimelineMessage[];
  agentNames: string[];
  count: number;
  postVisibleComment: PostVisibleComment;
  dependencies: AcceptancePrePassDependencies;
  latestMessage: TimelineMessage;
  latestCommentId: string;
  ledger: GoalLedgerState;
  task: TaskRecord;
  reviewerRole: string;
}): Promise<IssueProcessingOutcome | null> {
  const statements = input.task.acceptanceStatements ?? [];
  const parsed = parseAcceptanceWalkthrough(input.latestMessage.body, statements);
  if (parsed === null) {
    return maybeEscalateUnparsedAcceptanceWalkthrough(input);
  }

  let ledgerAfterFact: GoalLedgerState | null = null;
  await withTimeout(
    input.dependencies.saveGoalLedgerEntry(
      "tasks",
      input.task.id,
      (entry, state) => {
        if (entry === null || !isTaskRecord(entry)) {
          throw new Error(`missing-ledger-task:${input.task.id}`);
        }
        const nextState = recordTaskAcceptanceFact(state, {
          taskId: input.task.id,
          issue: {
            owner: input.source.owner,
            repo: input.source.repo,
            number: input.source.issueNumber,
          },
          role: input.reviewerRole,
          status: parsed.status,
          statementResults: parsed.statementResults,
          messageIndex: input.latestMessage.index,
          commentId: input.latestCommentId,
          capturedAt: new Date().toISOString(),
          note: `source-comment:${input.latestCommentId}`,
        });
        ledgerAfterFact = nextState;
        return nextState.tasks[input.task.id] ?? entry;
      },
      undefined,
      { timeoutMs: CEO_ORCHESTRATION_ACTION_TIMEOUT_MS },
    ),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "saveGoalLedgerEntry",
  );

  if (parsed.status === "failed") {
    return null;
  }

  const currentLedger =
    ledgerAfterFact ??
    (await withTimeout(
      input.dependencies.loadGoalLedgerState(),
      CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
      "loadGoalLedgerState",
    ));
  const ownerResolution = resolveIntegrationOwnerForTask(currentLedger, input.task.id);
  if (ownerResolution === null) {
    await input.postVisibleComment(
      formatBypassedAgentComment(
        "ceo",
        formatIntegrationAcceptanceBlockedBody({
          reason: "parent-reference-missing",
          detail: `child task ${input.task.id} has no resolvable parent issue in the active phase projection`,
        }),
        "integration-acceptance-blocked",
      ),
    );
    return "triggered-success";
  }

  const reviewerRole = resolveTargetReviewerRole(input.agentNames);
  if (reviewerRole === null) {
    await input.postVisibleComment(
      formatBypassedAgentComment(
        "ceo",
        formatIntegrationAcceptanceBlockedBody({
          reason: "reviewer-role-missing",
          detail: "no current real acceptance reviewer role is available",
        }),
        "integration-acceptance-blocked",
      ),
    );
    return "triggered-success";
  }

  const evaluation = evaluateIntegrationAcceptanceJoin(currentLedger, {
    owner: ownerResolution.owner,
    parentIssue: ownerResolution.parentIssue,
    reviewerRole,
  });
  if (evaluation.status === "waiting") {
    log({
      event: "integration-acceptance-waiting",
      issueKey: input.source.issueKey,
      pending: evaluation.pending.map((item) => `${item.taskId}:${item.reason}`),
    });
    return maybeReportClosedChildJoinBlock({
      source: input.source,
      pending: evaluation.pending,
      phaseId: evaluation.phaseId,
      parentIssue: ownerResolution.parentIssue,
      reviewerRole,
      dependencies: input.dependencies,
    });
  }

  if (evaluation.status === "blocked") {
    const parentSource = makeIssueSource({
      owner: ownerResolution.parentIssue.owner,
      repo: ownerResolution.parentIssue.repo,
      issueNumber: ownerResolution.parentIssue.number,
    });
    await input.dependencies.postComment(
      parentSource,
      appendCeoReviewedMetadata(
        formatAgentComment(
          "ceo",
          formatIntegrationAcceptanceBlockedBody({
            reason: evaluation.reason,
            detail:
              evaluation.reason === "missing-target-acceptance-statements"
                ? `@${reviewerRole} 当前 active phase projection 缺少目标级验收语句，请先补齐账本事实。`
                : `集成验收 join 被阻断：${evaluation.reason}`,
          }),
        ),
        { action: "bypass", reason: "integration-acceptance-blocked" },
      ),
    );
    return "triggered-success";
  }

  return requestParentIntegrationAcceptance({
    source: input.source,
    parentIssue: ownerResolution.parentIssue,
    evaluation,
    dependencies: input.dependencies,
  });
}

const ACCEPTANCE_FORMAT_REMINDER_METADATA = "<!-- moebius:acceptance-format-reminder -->";
const ACCEPTANCE_FORMAT_REMINDER_LIMIT = 2;

async function maybeEscalateUnparsedAcceptanceWalkthrough(input: {
  source: IssueSource;
  issue: { comments: Array<{ id: string; body: string }>; body: string };
  postVisibleComment: PostVisibleComment;
  latestMessage: TimelineMessage;
  latestCommentId: string;
  task: TaskRecord;
  reviewerRole: string;
}): Promise<IssueProcessingOutcome | null> {
  const statements = input.task.acceptanceStatements ?? [];
  if (statements.length === 0) {
    return null;
  }
  if (parseOverallAcceptanceStatus(input.latestMessage.body) !== "passed") {
    return null;
  }
  const reminderCount = input.issue.comments.filter((comment) =>
    comment.body.includes(ACCEPTANCE_FORMAT_REMINDER_METADATA),
  ).length;
  if (reminderCount >= ACCEPTANCE_FORMAT_REMINDER_LIMIT) {
    log({
      event: "acceptance-walkthrough-unparsed",
      issueKey: input.source.issueKey,
      taskId: input.task.id,
      reviewerRole: input.reviewerRole,
      commentId: input.latestCommentId,
      reminderCount,
      reason: "reminder-cap-reached",
    });
    return null;
  }
  log({
    event: "acceptance-walkthrough-unparsed",
    issueKey: input.source.issueKey,
    taskId: input.task.id,
    reviewerRole: input.reviewerRole,
    commentId: input.latestCommentId,
    reminderCount,
  });
  await input.postVisibleComment(
    formatBypassedAgentComment(
      "ceo",
      formatAcceptanceFormatReminderBody({ reviewerRole: input.reviewerRole, statements }),
      "acceptance-format-reminder",
    ),
  );
  return "triggered-success";
}

function formatAcceptanceFormatReminderBody(input: { reviewerRole: string; statements: readonly string[] }): string {
  const statementLines = input.statements.map((statement, index) => `${index + 1}. ${statement}`).join("\n");
  return `@${input.reviewerRole} 你最新的验收结论声明整体通过，但逐条走查无法被 runner 解析，账本没有记录本次验收事实，集成验收 join 无法推进。请重新输出一条符合规范格式的走查评论：每条验收语句独立一行 \`N. 通过/不通过 — 依据\`（编号与下列验收语句序号一致，不要使用表格、不要加「原验收」等前缀变体），并包含独立一行 \`验收结论：通过\` 或 \`验收结论：不通过\`。

待走查的验收语句：
${statementLines}

${ACCEPTANCE_FORMAT_REMINDER_METADATA}`;
}

const INTEGRATION_BLOCKED_KEY_PREFIX = "moebius-integration-blocked-key:";

async function maybeReportClosedChildJoinBlock(input: {
  source: IssueSource;
  pending: ReadonlyArray<{ taskId: string; issue: { owner: string; repo: string; number: number }; reason: "missing" | "failed" }>;
  phaseId: string;
  parentIssue: { owner: string; repo: string; number: number };
  reviewerRole: string;
  dependencies: AcceptancePrePassDependencies;
}): Promise<IssueProcessingOutcome> {
  const missing = input.pending.filter((item) => item.reason === "missing");
  if (missing.length === 0) {
    return "no-trigger";
  }

  const closed: typeof missing = [];
  for (const item of missing) {
    const childSource = makeIssueSource({
      owner: item.issue.owner,
      repo: item.issue.repo,
      issueNumber: item.issue.number,
    });
    let state: "OPEN" | "CLOSED";
    try {
      state = await withTimeout(
        input.dependencies.fetchIssueState(childSource),
        CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
        "fetchIssueState",
      );
    } catch (error) {
      log({
        event: "integration-acceptance-child-state-check-failopen",
        issueKey: input.source.issueKey,
        taskId: item.taskId,
        childIssueKey: childSource.issueKey,
        error: formatError(error),
      });
      return "no-trigger";
    }
    if (state === "CLOSED") {
      closed.push(item);
    }
  }

  if (closed.length === 0) {
    return "no-trigger";
  }

  const closedIssueKeys = closed
    .map((item) => `${item.issue.owner}/${item.issue.repo}#${item.issue.number}`)
    .sort();
  const blockedKey = `${INTEGRATION_BLOCKED_KEY_PREFIX}${crypto
    .createHash("sha256")
    .update([input.phaseId, ...closedIssueKeys].join("\n"))
    .digest("hex")}`;
  const parentSource = makeIssueSource({
    owner: input.parentIssue.owner,
    repo: input.parentIssue.repo,
    issueNumber: input.parentIssue.number,
  });
  const parent = await withTimeout(
    input.dependencies.fetchIssueWithComments(parentSource),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "fetchParentIssueForBlockedReport",
  );
  if (issueContainsHiddenKey(parent, blockedKey)) {
    log({
      event: "integration-acceptance-blocked",
      issueKey: input.source.issueKey,
      reason: "closed-child-without-acceptance",
      closed: closedIssueKeys,
      deduped: true,
    });
    return "no-trigger";
  }

  const closedLines = closed
    .map((item) => `- ${item.issue.owner}/${item.issue.repo}#${item.issue.number}（task ${item.taskId}）`)
    .join("\n");
  await input.dependencies.postComment(
    parentSource,
    formatBypassedAgentComment(
      "ceo",
      formatIntegrationAcceptanceBlockedBody({
        reason: "closed-child-without-acceptance",
        detail: `@${input.reviewerRole} 以下子 issue 已关闭，但账本缺少可解析的验收事实，集成验收 join 无法完成：
${closedLines}

请重开对应子 issue 并补一条规范逐条走查评论（每条验收语句一行 \`N. 通过/不通过 — 依据\` + 独立一行 \`验收结论：通过/不通过\`）；如认为应豁免，请在本 issue 说明理由，等待真人裁决。

${blockedKey}`,
      }),
      "integration-acceptance-blocked",
    ),
  );
  log({
    event: "integration-acceptance-blocked",
    issueKey: input.source.issueKey,
    reason: "closed-child-without-acceptance",
    closed: closedIssueKeys,
  });
  return "triggered-success";
}

async function processParentIntegrationAcceptance(input: {
  source: IssueSource;
  issue: { comments: Array<{ id: string; body: string }>; body: string };
  timeline: TimelineMessage[];
  agentNames: string[];
  count: number;
  postVisibleComment: PostVisibleComment;
  dependencies: AcceptancePrePassDependencies;
  latestMessage: TimelineMessage;
  latestCommentId: string;
  ledger: GoalLedgerState;
  resolution: IntegrationOwnerResolution;
  reviewerRole: string;
}): Promise<IssueProcessingOutcome | null> {
  const requested = latestIntegrationAcceptanceRequest(input.resolution.phase, input.resolution.parentIssue);
  if (requested === null) {
    return null;
  }

  const parsed = parseAcceptanceWalkthrough(input.latestMessage.body, input.resolution.phase.acceptanceStatements ?? []);
  if (parsed === null) {
    return null;
  }

  await saveIntegrationAcceptanceEvent({
    dependencies: input.dependencies,
    phaseId: input.resolution.phase.id,
    parentIssue: input.resolution.parentIssue,
    reviewerRole: input.reviewerRole,
    status: parsed.status,
    childPassDigest: requested.childPassDigest,
    targetAcceptanceDigest: requested.targetAcceptanceDigest,
    joinKey: requested.joinKey,
    sourceComment: {
      issue: {
        owner: input.source.owner,
        repo: input.source.repo,
        number: input.source.issueNumber,
      },
      messageIndex: input.latestMessage.index,
      commentId: input.latestCommentId,
    },
    failedStatementIds: parsed.status === "failed" ? parsed.failedStatementIds : undefined,
    capturedAt: new Date().toISOString(),
    note: `source-comment:${input.latestCommentId}`,
  });

  if (parsed.status === "passed") {
    log({
      event: "integration-acceptance-passed",
      issueKey: input.source.issueKey,
      joinKey: requested.joinKey,
    });
    return "no-trigger";
  }

  return createIntegrationRepairChildren({
    source: input.source,
    parentIssue: input.resolution.parentIssue,
    owner: input.resolution.owner,
    phase: input.resolution.phase,
    requested,
    parsed,
    ledger: input.ledger,
    agentNames: input.agentNames,
    latestCommentId: input.latestCommentId,
    postVisibleComment: input.postVisibleComment,
    dependencies: input.dependencies,
  });
}

async function requestParentIntegrationAcceptance(input: {
  source: IssueSource;
  parentIssue: { owner: string; repo: string; number: number };
  evaluation: Extract<ReturnType<typeof evaluateIntegrationAcceptanceJoin>, { status: "ready" }>;
  dependencies: AcceptancePrePassDependencies;
}): Promise<IssueProcessingOutcome> {
  const parentSource = makeIssueSource({
    owner: input.parentIssue.owner,
    repo: input.parentIssue.repo,
    issueNumber: input.parentIssue.number,
  });
  const parent = await withTimeout(
    input.dependencies.fetchIssueWithComments(parentSource),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "fetchParentIssueForIntegrationAcceptance",
  );

  if (issueContainsHiddenKey(parent, input.evaluation.joinKey)) {
    await saveIntegrationAcceptanceEvent({
      dependencies: input.dependencies,
      phaseId: input.evaluation.phaseId,
      parentIssue: input.parentIssue,
      reviewerRole: input.evaluation.reviewerRole,
      status: "requested",
      childPassDigest: input.evaluation.childPassDigest,
      targetAcceptanceDigest: input.evaluation.targetAcceptanceDigest,
      joinKey: input.evaluation.joinKey,
      capturedAt: new Date().toISOString(),
      note: "recovered-existing-parent-request",
    });
    return "no-trigger";
  }

  const requestBody = appendCeoReviewedMetadata(
    formatAgentComment(
      "ceo",
      formatIntegrationAcceptanceRequestBody({
        reviewerRole: input.evaluation.reviewerRole,
        acceptanceStatements: input.evaluation.acceptanceStatements,
        childPassFacts: input.evaluation.childPassFacts,
        joinKey: input.evaluation.joinKey,
      }),
    ),
    { action: "bypass", reason: "integration_acceptance_request" },
  );
  await input.dependencies.postComment(parentSource, requestBody);

  await saveIntegrationAcceptanceEvent({
    dependencies: input.dependencies,
    phaseId: input.evaluation.phaseId,
    parentIssue: input.parentIssue,
    reviewerRole: input.evaluation.reviewerRole,
    status: "requested",
    childPassDigest: input.evaluation.childPassDigest,
    targetAcceptanceDigest: input.evaluation.targetAcceptanceDigest,
    joinKey: input.evaluation.joinKey,
    capturedAt: new Date().toISOString(),
    note: `trigger-child:${input.source.issueKey}`,
  });

  return "triggered-success";
}

async function saveIntegrationAcceptanceEvent(input: {
  dependencies: AcceptancePrePassDependencies;
  phaseId: string;
  parentIssue: { owner: string; repo: string; number: number };
  reviewerRole: string;
  status: "requested" | "passed" | "failed" | "blocked";
  childPassDigest: string;
  targetAcceptanceDigest: string;
  joinKey: string;
  sourceComment?: {
    issue: { owner: string; repo: string; number: number };
    messageIndex: number;
    commentId?: string;
  };
  failedStatementIds?: string[];
  repairTaskIds?: string[];
  capturedAt: string;
  note?: string;
}): Promise<void> {
  await withTimeout(
    input.dependencies.saveGoalLedgerEntry(
      "phases",
      input.phaseId,
      (entry, state) => {
        if (entry === null || !isPhaseRecord(entry)) {
          throw new Error(`missing-ledger-phase:${input.phaseId}`);
        }
        const nextState = recordIntegrationAcceptanceEvent(state, {
          phaseId: input.phaseId,
          parentIssue: input.parentIssue,
          reviewerRole: input.reviewerRole,
          status: input.status,
          childPassDigest: input.childPassDigest,
          targetAcceptanceDigest: input.targetAcceptanceDigest,
          joinKey: input.joinKey,
          sourceComment: input.sourceComment,
          failedStatementIds: input.failedStatementIds,
          repairTaskIds: input.repairTaskIds,
          capturedAt: input.capturedAt,
          note: input.note,
        });
        return nextState.phases[input.phaseId] ?? entry;
      },
      undefined,
      { timeoutMs: CEO_ORCHESTRATION_ACTION_TIMEOUT_MS },
    ),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "saveGoalLedgerEntry",
  );
}

async function createIntegrationRepairChildren(input: {
  source: IssueSource;
  parentIssue: { owner: string; repo: string; number: number };
  owner: PhaseOwner;
  phase: PhaseRecord;
  requested: NonNullable<ReturnType<typeof latestIntegrationAcceptanceRequest>>;
  parsed: ParsedAcceptanceWalkthrough;
  ledger: GoalLedgerState;
  agentNames: string[];
  latestCommentId: string;
  postVisibleComment: PostVisibleComment;
  dependencies: AcceptancePrePassDependencies;
}): Promise<IssueProcessingOutcome> {
  const initialRole = input.agentNames.includes("dev") ? "dev" : input.agentNames[0];
  if (initialRole === undefined) {
    await input.postVisibleComment(
      formatBypassedAgentComment(
        "ceo",
        formatIntegrationAcceptanceBlockedBody({
          reason: "repair-initial-role-missing",
          detail: "no current real implementation role is available",
        }),
        "integration-repair-blocked",
      ),
    );
    return "triggered-success";
  }

  const repairTaskId = buildIntegrationRepairTaskId(input.requested.joinKey, input.parsed.failedStatementIds);
  const acceptanceStatements = input.parsed.failedStatements.length > 0 ? input.parsed.failedStatements : ["修复父级集成验收失败项"];
  const group: CeoOrchestrationGroup = {
    id: "integration-repair",
    reason: "目标级验收失败；冲突面未知，按串行修复子任务处理。",
  };
  const descriptor: CeoChildIssueDescriptor = {
    ledgerTaskId: repairTaskId,
    groupId: group.id,
    title: truncateForComment(`修复集成验收失败：${acceptanceStatements[0] ?? repairTaskId}`, 120),
    description: "本子任务由父目标集成验收失败自动回流生成，只修复列出的目标级验收失败项。",
    initialRole,
    qualityBaseline: input.phase.qualityBaseline,
    acceptanceStatements,
    dependencies: [],
    provenance: `integration acceptance failed on ${issueUrl(input.source)} comment ${input.latestCommentId}; joinKey=${input.requested.joinKey}`,
  };
  const orchestrationKey = buildCeoOrchestrationKey({
    source: input.source,
    workflowId: "integration-repair-child-issues",
    ledgerTaskId: repairTaskId,
  });

  const completed: CeoSpawnCompletedItem[] = [];
  const pending: CeoChildIssueDescriptor[] = [descriptor];
  try {
    await saveIntegrationRepairTask({
      dependencies: input.dependencies,
      ledger: input.ledger,
      owner: input.owner,
      phase: input.phase,
      parentIssue: input.parentIssue,
      descriptor,
      orchestrationKey,
    });

    pending.shift();
    const latestLedger = await withTimeout(
      input.dependencies.loadGoalLedgerState(),
      CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
      "loadGoalLedgerState",
    );
    const existingRef = findTaskChildIssueRefByOrchestrationKey(latestLedger, repairTaskId, orchestrationKey);
    if (existingRef !== null) {
      completed.push({ kind: "already-created", descriptor, issue: issueFromReference(existingRef), orchestrationKey });
    } else {
      const lookup = await withTimeout(
        input.dependencies.findIssueByOrchestrationKey(input.source, orchestrationKey),
        CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
        "findIssueByOrchestrationKey",
      );
      if (lookup.kind === "multiple") {
        throw new Error(
          `orchestration-key-multiple-matches:${orchestrationKey}:${lookup.issues.map((issue) => issue.url).join(",")}`,
        );
      }
      if (lookup.kind === "one") {
        completed.push({ kind: "recovered-existing", descriptor, issue: lookup.issue, orchestrationKey });
        await saveTaskChildIssueRef({
          dependencies: input.dependencies,
          ledgerTaskId: repairTaskId,
          issue: lookup.issue,
          orchestrationKey,
          provenance: descriptor.provenance,
        });
      } else {
        const body = renderCeoChildIssueBody({
          source: input.source,
          parentIssueUrl: issueUrl(input.source),
          workflowId: "integration-repair-child-issues",
          group,
          descriptor,
          orchestrationKey,
        });
        const created = await withTimeout(
          input.dependencies.createIssue(input.source, { title: descriptor.title, body }),
          CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
          "createIssue",
        );
        completed.push({ kind: "created", descriptor, issue: created, orchestrationKey });
        await saveTaskChildIssueRef({
          dependencies: input.dependencies,
          ledgerTaskId: repairTaskId,
          issue: created,
          orchestrationKey,
          provenance: descriptor.provenance,
        });
      }
    }

    await saveIntegrationAcceptanceEvent({
      dependencies: input.dependencies,
      phaseId: input.phase.id,
      parentIssue: input.parentIssue,
      reviewerRole: input.requested.reviewerRole,
      status: "failed",
      childPassDigest: input.requested.childPassDigest,
      targetAcceptanceDigest: input.requested.targetAcceptanceDigest,
      joinKey: input.requested.joinKey,
      failedStatementIds: input.parsed.failedStatementIds,
      repairTaskIds: [repairTaskId],
      capturedAt: new Date().toISOString(),
      note: `repair-created:${repairTaskId}`,
    });
  } catch (error) {
    const failureBody = formatCeoOrchestrationFailureBody({
      reason: formatFailureReason(error),
      completed,
      pending,
    });
    try {
      await input.postVisibleComment(formatBypassedAgentComment("ceo", failureBody, "integration-repair-failed"));
      return "triggered-success";
    } catch (postError) {
      throw new Error(
        `integration-repair-failed:${formatFailureReason(error)}; fail-closed-comment-failed:${formatFailureReason(
          postError,
        )}; completed=${completed.map((item) => item.issue.url).join(",")}`,
      );
    }
  }

  await input.postVisibleComment(
    formatBypassedAgentComment(
      "ceo",
      formatIntegrationRepairSuccessBody({
        repairTaskId,
        completed,
        failedStatementIds: input.parsed.failedStatementIds,
      }),
      "integration-repair-created",
    ),
  );
  return "triggered-success";
}

async function saveIntegrationRepairTask(input: {
  dependencies: AcceptancePrePassDependencies;
  ledger: GoalLedgerState;
  owner: PhaseOwner;
  phase: PhaseRecord;
  parentIssue: { owner: string; repo: string; number: number };
  descriptor: CeoChildIssueDescriptor;
  orchestrationKey: string;
}): Promise<void> {
  const goalId = resolveGoalIdForOwner(input.ledger, input.owner);
  if (goalId === null) {
    throw new Error(`integration-repair-owner-missing:${input.owner.kind}:${input.owner.id}`);
  }
  const milestoneId = input.owner.kind === "milestone" ? input.owner.id : input.owner.kind === "task" ? input.ledger.tasks[input.owner.id]?.milestoneId : undefined;
  const now = new Date().toISOString();

  await withTimeout(
    input.dependencies.saveGoalLedgerEntry(
      "tasks",
      input.descriptor.ledgerTaskId,
      (entry) => {
        if (entry !== null && !isTaskRecord(entry)) {
          throw new Error(`invalid-repair-task-entry:${input.descriptor.ledgerTaskId}`);
        }
        const existing = entry;
        const task: TaskRecord = {
          id: input.descriptor.ledgerTaskId,
          goalId,
          ...(milestoneId === undefined ? {} : { milestoneId }),
          title: input.descriptor.title,
          status: "ready",
          scope: input.descriptor.description,
          acceptanceStatements: input.descriptor.acceptanceStatements,
          dependencies: input.descriptor.dependencies,
          qualityBaseline: input.descriptor.qualityBaseline,
          phaseIds: Array.from(new Set([...(existing?.phaseIds ?? []), input.phase.id])),
          parentIssueRef: {
            owner: input.parentIssue.owner,
            repo: input.parentIssue.repo,
            number: input.parentIssue.number,
            relation: "parent",
            status: "open",
            note: input.orchestrationKey,
          },
          childIssueRefs: existing?.childIssueRefs ?? [],
          acceptanceFacts: existing?.acceptanceFacts,
          runManifestRefs: existing?.runManifestRefs ?? [],
          provenance: existing?.provenance ?? [
            {
              issue: input.parentIssue,
              messageIndex: 0,
              capturedAt: now,
              note: input.descriptor.provenance,
            },
          ],
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        return task;
      },
      undefined,
      { timeoutMs: CEO_ORCHESTRATION_ACTION_TIMEOUT_MS },
    ),
    CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
    "saveGoalLedgerEntry",
  );

  if (input.owner.kind === "milestone") {
    await withTimeout(
      input.dependencies.saveGoalLedgerEntry(
        "milestones",
        input.owner.id,
        (entry) => {
          if (entry === null || !("taskIds" in entry)) {
            throw new Error(`missing-ledger-milestone:${input.owner.id}`);
          }
          if (entry.taskIds.includes(input.descriptor.ledgerTaskId)) {
            return entry;
          }
          return {
            ...entry,
            taskIds: [...entry.taskIds, input.descriptor.ledgerTaskId],
            updatedAt: now,
          };
        },
        undefined,
        { timeoutMs: CEO_ORCHESTRATION_ACTION_TIMEOUT_MS },
      ),
      CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
      "saveGoalLedgerEntry",
    );
  }
}

function isAcceptanceReviewerRole(role: string, agentNames: readonly string[]): boolean {
  return ["product-manager", "hermes-user", "qa"].includes(role) && agentNames.includes(role);
}

function resolveTargetReviewerRole(agentNames: readonly string[]): string | null {
  for (const role of ["product-manager", "hermes-user", "qa"]) {
    if (agentNames.includes(role)) {
      return role;
    }
  }
  return null;
}

function resolveIntegrationOwnerForTask(ledger: GoalLedgerState, taskId: string): IntegrationOwnerResolution | null {
  const task = ledger.tasks[taskId];
  if (task === undefined) {
    return null;
  }
  const owners: PhaseOwner[] = [
    { kind: "goal", id: task.goalId },
    ...(task.milestoneId === undefined ? [] : [{ kind: "milestone" as const, id: task.milestoneId }]),
    { kind: "task", id: task.id },
  ];
  for (const owner of owners) {
    const phase = findSingleActivePhase(ledger, owner);
    if (phase === null) {
      continue;
    }
    const parentIssue = resolveParentIssueForOwner(ledger, owner, task);
    if (parentIssue === null) {
      return null;
    }
    return { owner, phase, parentIssue };
  }
  return null;
}

function findIntegrationOwnerForParentIssue(ledger: GoalLedgerState, source: IssueSource): IntegrationOwnerResolution | null {
  for (const phase of Object.values(ledger.phases)) {
    if (phase.status !== "active") {
      continue;
    }
    const owner = phase.owner;
    const parentIssue = resolveParentIssueForOwner(ledger, owner);
    if (parentIssue !== null && parentIssue.owner === source.owner && parentIssue.repo === source.repo && parentIssue.number === source.issueNumber) {
      return { owner, phase, parentIssue };
    }
  }
  return null;
}

function findSingleActivePhase(ledger: GoalLedgerState, owner: PhaseOwner): PhaseRecord | null {
  const phases = Object.values(ledger.phases).filter(
    (phase) => phase.status === "active" && phase.owner.kind === owner.kind && phase.owner.id === owner.id,
  );
  return phases.length === 1 ? phases[0]! : null;
}

function resolveParentIssueForOwner(
  ledger: GoalLedgerState,
  owner: PhaseOwner,
  fallbackTask?: TaskRecord,
): { owner: string; repo: string; number: number } | null {
  if (fallbackTask?.parentIssueRef !== undefined) {
    return issueLikeFromReference(fallbackTask.parentIssueRef);
  }

  if (owner.kind === "task") {
    const task = ledger.tasks[owner.id];
    if (task?.parentIssueRef !== undefined) {
      return issueLikeFromReference(task.parentIssueRef);
    }
    return task === undefined ? null : resolveParentIssueForOwner(ledger, { kind: "goal", id: task.goalId }, task);
  }

  if (owner.kind === "milestone") {
    const milestone = ledger.milestones[owner.id];
    const milestoneRef = milestone?.issueRefs.find((reference) => reference.relation === "source" || reference.relation === "parent");
    if (milestoneRef !== undefined) {
      return issueLikeFromReference(milestoneRef);
    }
    return milestone === undefined ? null : resolveParentIssueForOwner(ledger, { kind: "goal", id: milestone.goalId }, fallbackTask);
  }

  const goal = ledger.goals[owner.id];
  const goalRef = goal?.issueRefs.find((reference) => reference.relation === "source" || reference.relation === "parent");
  return goalRef === undefined ? null : issueLikeFromReference(goalRef);
}

function resolveGoalIdForOwner(ledger: GoalLedgerState, owner: PhaseOwner): string | null {
  if (owner.kind === "goal") {
    return ledger.goals[owner.id] === undefined ? null : owner.id;
  }
  if (owner.kind === "milestone") {
    return ledger.milestones[owner.id]?.goalId ?? null;
  }
  return ledger.tasks[owner.id]?.goalId ?? null;
}

function latestIntegrationAcceptanceRequest(
  phase: PhaseRecord,
  parentIssue: { owner: string; repo: string; number: number },
): NonNullable<PhaseRecord["integrationAcceptance"]>[number] | null {
  const requests = (phase.integrationAcceptance ?? []).filter(
    (event) =>
      event.status === "requested" &&
      event.parentIssue.owner === parentIssue.owner &&
      event.parentIssue.repo === parentIssue.repo &&
      event.parentIssue.number === parentIssue.number,
  );
  return requests.sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt)).at(-1) ?? null;
}

function parseAcceptanceWalkthrough(body: string, statements: readonly string[]): ParsedAcceptanceWalkthrough | null {
  if (statements.length === 0) {
    return null;
  }

  const lines = body.split(/\r?\n/u);
  const statementResults: AcceptanceStatementResult[] = [];
  const failedStatementIds: string[] = [];
  const failedStatements: string[] = [];
  for (const [index, statement] of statements.entries()) {
    const id = String(index + 1);
    const line = findAcceptanceLineForStatement(lines, index + 1);
    if (line === null) {
      return null;
    }
    const status = parseAcceptanceLineStatus(line);
    if (status === null) {
      return null;
    }
    statementResults.push({ id, status, statement });
    if (status === "failed") {
      failedStatementIds.push(id);
      failedStatements.push(statement);
    }
  }

  const overall = parseOverallAcceptanceStatus(body);
  if (overall === null) {
    return null;
  }
  const status = overall === "failed" || failedStatementIds.length > 0 ? "failed" : "passed";
  return { status, statementResults, failedStatementIds, failedStatements };
}

function findAcceptanceLineForStatement(lines: readonly string[], statementNumber: number): string | null {
  const prefix = new RegExp(
    `^\\s*(?:[-*]\\s*)?(?:\\|\\s*)?(?:(?:原|正式)?验收(?:语句)?\\s*)?${String(statementNumber)}[.、)．:：\\s|]`,
    "u",
  );
  return lines.find((line) => prefix.test(line) && /(通过|不通过|失败)/u.test(line)) ?? null;
}

function parseAcceptanceLineStatus(line: string): "passed" | "failed" | null {
  if (/(不通过|失败|未通过)/u.test(line)) {
    return "failed";
  }
  if (/通过/u.test(line)) {
    return "passed";
  }
  return null;
}

function parseOverallAcceptanceStatus(body: string): "passed" | "failed" | null {
  if (/(验收结论|结论|整体验收|方案验收结论|集成验收结论)[^\n]{0,40}(不通过|失败|未通过)/u.test(body)) {
    return "failed";
  }
  if (/(验收失败|整体验收失败|集成验收失败)/u.test(body)) {
    return "failed";
  }
  if (/(验收结论|结论|整体验收|方案验收结论|集成验收结论)[^\n]{0,40}通过/u.test(body)) {
    return "passed";
  }
  if (/(验收通过|全部通过|整体通过|集成验收通过)/u.test(body)) {
    return "passed";
  }
  return null;
}

function isPhaseRecord(entry: GoalLedgerEntry): entry is PhaseRecord {
  return "owner" in entry && "qualityBaseline" in entry && "provenance" in entry;
}

function buildIntegrationRepairTaskId(joinKey: string, failedStatementIds: readonly string[]): string {
  const digest = buildAcceptanceStatementsDigest([joinKey, ...failedStatementIds]).slice(0, 20);
  return `integration-repair-${digest}`;
}

function formatIntegrationAcceptanceRequestBody(input: {
  reviewerRole: string;
  acceptanceStatements: string[];
  childPassFacts: Array<{ taskId: string; fact: { factKey: string; role: string; commentId?: string } }>;
  joinKey: string;
}): string {
  const acceptance = input.acceptanceStatements.map((statement, index) => `${String(index + 1)}. ${statement}`).join("\n");
  const childFacts = input.childPassFacts
    .map((item) => `- ${item.taskId}: ${item.fact.role} / ${item.fact.commentId ?? item.fact.factKey}`)
    .join("\n");

  return `@${input.reviewerRole} 当前 active phase 中所有已入账子任务均已通过验收，请按目标级验收语句执行集成验收走查。子任务通过不能直接代表父目标通过；本评论只发起父级集成验收请求，不改变 issue 生命周期状态。

目标级验收语句：
${acceptance}

子任务通过事实：
${childFacts}

<!-- ${input.joinKey} -->

<!-- moebius:stage=in-progress -->`;
}

function formatIntegrationAcceptanceBlockedBody(input: { reason: string; detail: string }): string {
  return `集成验收 join 已 fail-closed。

原因：${input.reason}
说明：${input.detail}

本轮不会把父目标标记为通过，也不会创建修复子任务。

<!-- moebius:stage=in-progress -->`;
}

function formatIntegrationRepairSuccessBody(input: {
  repairTaskId: string;
  completed: CeoSpawnCompletedItem[];
  failedStatementIds: string[];
}): string {
  const completed =
    input.completed.length === 0
      ? "- none"
      : input.completed.map((item) => `- ${item.kind}: ${item.descriptor.ledgerTaskId} -> ${item.issue.url}`).join("\n");
  return `集成验收失败已回流为修复子任务。

Repair task: ${input.repairTaskId}
Failed statements: ${input.failedStatementIds.join(", ")}

子 issue：
${completed}

修复子任务通过后，将重新触发同一父目标的集成验收。

<!-- moebius:stage=in-progress -->`;
}
