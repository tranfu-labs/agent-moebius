import crypto from "node:crypto";
import { CEO_ORCHESTRATION_ACTION_TIMEOUT_MS } from "../config.js";
import { ensureInProgressStage } from "../ceo-orchestration.js";
import { formatAgentComment, getLatestTimelineMessage, parseAgentMentions, type TimelineMessage } from "../conversation.js";
import { appendCeoReviewedMetadata } from "../format-ceo.js";
import type { run as runCodex } from "../codex.js";
import type { formatExternalCommentRoute } from "../format-ceo.js";
import type { GitHubIssue } from "../github.js";
import { latestAcceptanceFactForIssue, type GoalLedgerState } from "../goal-ledger.js";
import type { loadGoalLedgerState } from "../goal-ledger-state.js";
import { externalCommentFallbackRouteProcessingOutcome, type IntakeIssueState, type IssueProcessingOutcome } from "../github-response-intake.js";
import type { IssueSource } from "../issue-source.js";
import { log } from "../log.js";
import {
  buildCeoIssueContext,
  findTaskByChildIssue,
  formatError,
  parseRoundtableIssueContext,
  withTimeout,
  type PostVisibleComment,
} from "./runtime-contracts.js";

export interface ExternalRouteDependencies {
  runCodex: typeof runCodex;
  loadGoalLedgerState: typeof loadGoalLedgerState;
  formatExternalCommentRoute: typeof formatExternalCommentRoute;
}

export async function maybeRouteExternalNoMentionComment(input: {
  source: IssueSource;
  issue: GitHubIssue;
  timeline: TimelineMessage[];
  agentNames: string[];
  intakeIssueState?: IntakeIssueState;
  count: number;
  makeRunDir: (count: number) => string;
  postVisibleComment: PostVisibleComment;
  dependencies: ExternalRouteDependencies;
}): Promise<IssueProcessingOutcome | null> {
  const latestMessage = getLatestTimelineMessage(input.timeline);
  if (latestMessage === null) {
    return null;
  }
  const speakerKind =
    latestMessage.speaker === "user" ? "user" : input.agentNames.includes(latestMessage.speaker) ? "agent" : null;
  if (speakerKind === null) {
    return null;
  }
  if (speakerKind === "agent" && latestMessage.source !== "comment") {
    return null;
  }

  const routeTarget = resolveExternalNoMentionRouteTarget(input.issue, latestMessage);
  if (routeTarget === null) {
    return null;
  }

  if (latestMessage.source === "comment" && input.intakeIssueState?.mode !== "active") {
    return null;
  }

  if (speakerKind === "user" && hasMoebiusMetadata(routeTarget.body)) {
    return null;
  }

  if (input.intakeIssueState?.externalCommentFallbackRoutes?.[routeTarget.routeKey] !== undefined) {
    log({
      event: "external-comment-route-skip",
      reason: "already-routed",
      issueKey: input.source.issueKey,
      commentId: routeTarget.routeKey,
    });
    return null;
  }

  let ledgerContext: string | undefined;
  if (speakerKind === "agent") {
    const gate = await resolveAgentAuthoredRouteGate({ source: input.source, dependencies: input.dependencies });
    if (gate === null) {
      return null;
    }
    if (gate.kind === "closed") {
      log({
        event: "external-comment-route-no-action",
        issueKey: input.source.issueKey,
        commentId: routeTarget.routeKey,
        reason: "ledger-task-closed",
      });
      return externalCommentFallbackRouteProcessingOutcome({
        result: "no-trigger",
        route: {
          commentId: routeTarget.routeKey,
          outcome: "no_action",
          decidedAt: new Date().toISOString(),
          reason: "ledger-task-closed",
        },
      });
    }
    ledgerContext = gate.context;
  }

  const runDir = input.makeRunDir(input.count);
  log({
    event: "external-comment-route-start",
    count: input.count,
    runDir,
    issueKey: input.source.issueKey,
    commentId: routeTarget.routeKey,
    speaker: latestMessage.speaker,
  });

  const routeResult = await input.dependencies.formatExternalCommentRoute({
    issueContext: buildCeoIssueContext(input.source, input.issue),
    latestComment: routeTarget.body,
    availableAgentNames: input.agentNames,
    runDir,
    runCodex: input.dependencies.runCodex,
    ...(ledgerContext === undefined ? {} : { ledgerContext }),
  });

  logExternalCommentRouteResult({
    result: routeResult,
    count: input.count,
    issueKey: input.source.issueKey,
    commentId: routeTarget.routeKey,
  });

  const decidedAt = new Date().toISOString();
  if (routeResult.action === "APPEND") {
    await input.postVisibleComment(
      appendCeoReviewedMetadata(formatAgentComment("ceo", routeResult.body), {
        action: "external_route_append",
      }),
    );
    return externalCommentFallbackRouteProcessingOutcome({
      result: "triggered-success",
      route: {
        commentId: routeTarget.routeKey,
        outcome: "append",
        decidedAt,
        targetRole: routeResult.targetRole,
      },
    });
  }

  if (routeResult.action === "NO_ACTION") {
    return externalCommentFallbackRouteProcessingOutcome({
      result: "no-trigger",
      route: {
        commentId: routeTarget.routeKey,
        outcome: "no_action",
        decidedAt,
        reason: routeResult.reason,
      },
    });
  }

  return externalCommentFallbackRouteProcessingOutcome({
    result: "no-trigger",
    route: {
      commentId: routeTarget.routeKey,
      outcome: "fail_open",
      decidedAt,
      reason: routeResult.reason,
    },
  });
}

export async function maybeRecoverRoundtableNoHandoff(input: {
  source: IssueSource;
  issue: GitHubIssue;
  timeline: TimelineMessage[];
  intakeIssueState?: IntakeIssueState;
  postVisibleComment: PostVisibleComment;
}): Promise<IssueProcessingOutcome | null> {
  if (input.intakeIssueState?.mode !== "active") {
    return null;
  }
  const context = parseRoundtableIssueContext(input.issue.body);
  if (context === null) {
    return null;
  }
  const latestMessage = getLatestTimelineMessage(input.timeline);
  if (latestMessage === null || latestMessage.source !== "comment" || !context.participants.includes(latestMessage.speaker)) {
    return null;
  }
  const latestComment = input.issue.comments[latestMessage.index - 1];
  if (latestComment === undefined) {
    return null;
  }
  if (input.intakeIssueState.externalCommentFallbackRoutes?.[latestComment.id] !== undefined) {
    log({
      event: "roundtable-recovery-skip",
      reason: "already-routed",
      issueKey: input.source.issueKey,
      commentId: latestComment.id,
    });
    return null;
  }
  const mentions = parseAgentMentions(latestMessage.body);
  if (mentions.length === 1 && mentions[0]?.name === "ceo") {
    return null;
  }
  const decidedAt = new Date().toISOString();
  const reason =
    mentions.length === 0
      ? `roundtable participant ${latestMessage.speaker} spoke without handing control back to CEO`
      : `roundtable participant ${latestMessage.speaker} handed control to ${mentions.map((mention) => mention.name).join(",")} instead of CEO`;
  const body =
    mentions.length === 0
      ? `@ceo 圆桌参与者 ${latestMessage.speaker} 已发言，但没有把控制权交回 CEO 主持人。请继续按圆桌参与者顺序 route 或在全员发言后 complete。`
      : `@ceo 圆桌参与者 ${latestMessage.speaker} 已发言，但把控制权交给了非 CEO 角色。runner 已拦截该错误 handoff；请按圆桌参与者顺序继续 route 或在全员发言后 complete。`;
  await input.postVisibleComment(
    appendCeoReviewedMetadata(formatAgentComment("ceo", ensureInProgressStage(body)), {
      action: "bypass",
      reason: "roundtable_recovery",
    }),
  );
  return externalCommentFallbackRouteProcessingOutcome({
    result: "triggered-success",
    route: {
      commentId: latestComment.id,
      outcome: "append",
      decidedAt,
      targetRole: "ceo",
      reason,
    },
  });
}

function resolveExternalNoMentionRouteTarget(
  issue: GitHubIssue,
  latestMessage: TimelineMessage,
): { routeKey: string; body: string } | null {
  if (latestMessage.source === "issue-body") {
    if (!isLikelyGoalShapeMessage(latestMessage.body)) {
      return null;
    }
    return {
      routeKey: `issue-body:${digestRouteMessage(latestMessage.body)}`,
      body: latestMessage.body,
    };
  }
  if (latestMessage.source !== "comment") {
    return null;
  }
  const latestComment = issue.comments[latestMessage.index - 1];
  if (latestComment === undefined) {
    return null;
  }
  return {
    routeKey: latestComment.id,
    body: latestComment.body,
  };
}

function digestRouteMessage(body: string): string {
  return crypto.createHash("sha256").update(body).digest("hex").slice(0, 32);
}

async function resolveAgentAuthoredRouteGate(input: {
  source: IssueSource;
  dependencies: Pick<ExternalRouteDependencies, "loadGoalLedgerState">;
}): Promise<{ kind: "closed" } | { kind: "open"; context: string } | null> {
  let ledger: GoalLedgerState;
  try {
    ledger = await withTimeout(
      input.dependencies.loadGoalLedgerState(),
      CEO_ORCHESTRATION_ACTION_TIMEOUT_MS,
      "loadGoalLedgerState",
    );
  } catch (error) {
    log({
      event: "external-comment-route-skip",
      reason: "ledger-load-failed",
      issueKey: input.source.issueKey,
      error: formatError(error),
    });
    return null;
  }
  const task = findTaskByChildIssue(ledger, input.source);
  if (task === null) {
    return null;
  }
  const latest = latestAcceptanceFactForIssue(task.acceptanceFacts ?? [], {
    owner: input.source.owner,
    repo: input.source.repo,
    number: input.source.issueNumber,
  });
  if (latest?.status === "passed") {
    return { kind: "closed" };
  }
  const statements = (task.acceptanceStatements ?? [])
    .map((statement, index) => `${index + 1}. ${statement}`)
    .join("\n");
  return {
    kind: "open",
    context: `taskId: ${task.id}
title: ${task.title}
最新验收事实: ${latest === undefined ? "无" : latest.status}
验收语句:
${statements === "" ? "(none)" : statements}`,
  };
}

function isLikelyGoalShapeMessage(body: string): boolean {
  return /(?:我想(?:要)?(?:做|做一个|开发|实现|启动|构建)|帮我(?:做|启动|开发|构建)|请(?:做|启动|开发|构建)|I\s+want\s+to\s+(?:build|make|create|start)|help\s+me\s+(?:build|make|create|start))/iu.test(body);
}

function hasMoebiusMetadata(body: string): boolean {
  return /<!--\s*moebius:/u.test(body);
}

function logExternalCommentRouteResult(input: {
  result: Awaited<ReturnType<typeof formatExternalCommentRoute>>;
  count: number;
  issueKey: string;
  commentId: string;
}): void {
  if (input.result.action === "APPEND") {
    log({
      event: "external-comment-route-appended",
      count: input.count,
      issueKey: input.issueKey,
      commentId: input.commentId,
      targetRole: input.result.targetRole,
    });
    return;
  }

  if (input.result.action === "NO_ACTION") {
    log({
      event: "external-comment-route-no-action",
      count: input.count,
      issueKey: input.issueKey,
      commentId: input.commentId,
    });
    return;
  }

  log({
    event: "external-comment-route-failopen",
    count: input.count,
    issueKey: input.issueKey,
    commentId: input.commentId,
    reason: input.result.reason,
    detail: input.result.detail,
  });
}
