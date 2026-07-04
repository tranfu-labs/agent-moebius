import crypto from "node:crypto";
import { parseAgentMentions } from "./conversation.js";
import type { CeoScript } from "./ceo-scripts.js";
import { getCeoScriptById } from "./ceo-scripts.js";
import type { IssueSource } from "./issue-source.js";
import { parseTrailingStageMarker } from "./stages.js";

export const CEO_ORCHESTRATION_STAGE = "in-progress";
export const CEO_ORCHESTRATION_KEY_PREFIX = "agent-moebius-orchestration-key";
export const CEO_ROUNDTABLE_KEY_PREFIX = "agent-moebius-roundtable-key";
export const CEO_ROUNDTABLE_COMPLETION_KEY_PREFIX = "agent-moebius-roundtable-completion-key";

export interface CeoOrchestrationGroup {
  id: string;
  reason: string;
}

export interface CeoChildIssueDescriptor {
  ledgerTaskId: string;
  groupId: string;
  title: string;
  description: string;
  initialRole: string;
  qualityBaseline: "demo" | "data-correct" | "production";
  acceptanceStatements: string[];
  dependencies: string[];
  provenance: string;
}

export interface CeoRoundtableContribution {
  role: string;
  position: string;
  evidence: string;
  disagreements: string[];
}

export type ParsedCeoOrchestration =
  | {
      action: "route";
      workflowId: string;
      body: string;
    }
  | {
      action: "fail";
      body: string;
    }
  | {
      action: "spawn_child_issues";
      workflowId: string;
      summary: string;
      groups: CeoOrchestrationGroup[];
      issues: CeoChildIssueDescriptor[];
    }
  | {
      action: "roundtable";
      workflowId: string;
      mode: "start";
      roundtableId: string;
      ledgerTaskId: string;
      title: string;
      topic: string;
      inputSummary: string;
      participants: string[];
      firstRole: string;
      qualityBaseline: "demo" | "data-correct" | "production";
      provenance: string;
    }
  | {
      action: "roundtable";
      workflowId: string;
      mode: "route";
      roundtableKey: string;
      participants: string[];
      nextRole: string;
      body: string;
    }
  | {
      action: "roundtable";
      workflowId: string;
      mode: "complete";
      roundtableKey: string;
      participants: string[];
      summary: string;
      contributions: CeoRoundtableContribution[];
      decision: string;
      provenance: string;
    };

export type ParseCeoOrchestrationResult =
  | { ok: true; value: ParsedCeoOrchestration }
  | { ok: false; reason: string };

export function parseCeoOrchestrationOutput(input: {
  output: string;
  scripts: readonly CeoScript[];
  availableAgentNames: readonly string[];
  visibleTaskIds: readonly string[];
}): ParseCeoOrchestrationResult {
  if (parseTrailingStageMarker(input.output, [CEO_ORCHESTRATION_STAGE]) !== CEO_ORCHESTRATION_STAGE) {
    return { ok: false, reason: "missing-in-progress-stage-marker" };
  }

  const rawJson = stripFencedJson(stripTrailingStageMarker(input.output).trim());
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return { ok: false, reason: `invalid-json:${formatError(error)}` };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, reason: "invalid-json:root-not-object" };
  }

  const action = parsed["action"];
  if (action === "fail") {
    const body = getNonEmptyString(parsed["body"], "body");
    if (!body.ok) {
      return body;
    }
    return { ok: true, value: { action, body: ensureInProgressStage(body.value) } };
  }

  if (action !== "route" && action !== "spawn_child_issues" && action !== "roundtable") {
    return { ok: false, reason: `unknown-action:${String(action)}` };
  }

  const workflowId = getNonEmptyString(parsed["workflowId"], "workflowId");
  if (!workflowId.ok) {
    return workflowId;
  }
  const script = getCeoScriptById(input.scripts, workflowId.value);
  if (script === null) {
    return { ok: false, reason: `unknown-workflow:${workflowId.value}` };
  }
  if (script.action !== action) {
    return { ok: false, reason: `workflow-action-mismatch:${workflowId.value}` };
  }

  if (action === "roundtable") {
    return parseRoundtableAction({
      parsed,
      workflowId: workflowId.value,
      availableAgentNames: input.availableAgentNames,
      visibleTaskIds: input.visibleTaskIds,
    });
  }

  if (action === "route") {
    const body = getNonEmptyString(parsed["body"], "body");
    if (!body.ok) {
      return body;
    }
    const mentions = parseAgentMentions(body.value);
    if (mentions.length > 1) {
      return { ok: false, reason: "route-body-multiple-mentions" };
    }
    if (mentions[0] !== undefined && !input.availableAgentNames.includes(mentions[0].name)) {
      return { ok: false, reason: `route-body-unknown-mention:${mentions[0].name}` };
    }
    return { ok: true, value: { action, workflowId: workflowId.value, body: ensureInProgressStage(body.value) } };
  }

  const summary = getNonEmptyString(parsed["summary"], "summary");
  if (!summary.ok) {
    return summary;
  }
  const groups = parseGroups(parsed["groups"]);
  if (!groups.ok) {
    return groups;
  }
  const issues = parseChildIssueDescriptors({
    value: parsed["issues"],
    groups: groups.value,
    availableAgentNames: input.availableAgentNames,
    visibleTaskIds: input.visibleTaskIds,
  });
  if (!issues.ok) {
    return issues;
  }

  return {
    ok: true,
    value: {
      action,
      workflowId: workflowId.value,
      summary: summary.value,
      groups: groups.value,
      issues: issues.value,
    },
  };
}

export function buildCeoOrchestrationKey(input: {
  source: IssueSource;
  workflowId: string;
  ledgerTaskId: string;
}): string {
  const material = `${input.source.owner}/${input.source.repo}#${String(input.source.issueNumber)}|${input.workflowId}|${input.ledgerTaskId}`;
  const digest = crypto.createHash("sha256").update(material).digest("hex").slice(0, 32);
  return `${CEO_ORCHESTRATION_KEY_PREFIX}:${digest}`;
}

export function buildCeoRoundtableKey(input: {
  source: IssueSource;
  workflowId: string;
  roundtableId: string;
}): string {
  const material = `${input.source.owner}/${input.source.repo}#${String(input.source.issueNumber)}|${input.workflowId}|${input.roundtableId}`;
  const digest = crypto.createHash("sha256").update(material).digest("hex").slice(0, 32);
  return `${CEO_ROUNDTABLE_KEY_PREFIX}:${digest}`;
}

export function buildCeoRoundtableCompletionKey(input: {
  roundtableKey: string;
  participants: readonly string[];
  participantMessageIndexes: readonly number[];
}): string {
  const material = `${input.roundtableKey}|${input.participants.join(",")}|${input.participantMessageIndexes.join(",")}`;
  const digest = crypto.createHash("sha256").update(material).digest("hex").slice(0, 32);
  return `${CEO_ROUNDTABLE_COMPLETION_KEY_PREFIX}:${digest}`;
}

export function extractCeoOrchestrationKeyFromNote(note: string | undefined): string | null {
  if (note === undefined) {
    return null;
  }
  const match = note.match(/agent-moebius-orchestration-key:[a-f0-9]{32}/u);
  return match?.[0] ?? null;
}

export function extractCeoRoundtableKey(text: string | undefined): string | null {
  if (text === undefined) {
    return null;
  }
  const match = text.match(/agent-moebius-roundtable-key:[a-f0-9]{32}/u);
  return match?.[0] ?? null;
}

export function extractCeoRoundtableCompletionKey(text: string | undefined): string | null {
  if (text === undefined) {
    return null;
  }
  const match = text.match(/agent-moebius-roundtable-completion-key:[a-f0-9]{32}/u);
  return match?.[0] ?? null;
}

export function renderCeoChildIssueBody(input: {
  source: IssueSource;
  parentIssueUrl: string;
  workflowId: string;
  group: CeoOrchestrationGroup;
  descriptor: CeoChildIssueDescriptor;
  orchestrationKey: string;
}): string {
  const acceptance = input.descriptor.acceptanceStatements.map((statement, index) => `${String(index + 1)}. ${statement}`).join("\n");
  const dependencies =
    input.descriptor.dependencies.length === 0
      ? "- none"
      : input.descriptor.dependencies.map((dependency) => `- ${dependency}`).join("\n");

  return `${input.descriptor.description.trimEnd()}

Parent issue: ${input.parentIssueUrl}
Ledger task id: ${input.descriptor.ledgerTaskId}
Workflow id: ${input.workflowId}
Quality baseline: ${input.descriptor.qualityBaseline}

Dependencies:
${dependencies}

Acceptance statements:
${acceptance}

Initial handoff:
@${input.descriptor.initialRole} 请按本子 issue 的质量基准与验收语句推进。

Conflict group: ${input.group.id}
Conflict reason: ${input.group.reason}

Provenance:
${input.descriptor.provenance}

<!-- ${input.orchestrationKey} -->`;
}

export function renderCeoRoundtableChildIssueBody(input: {
  parentIssueUrl: string;
  workflowId: string;
  ledgerTaskId: string;
  roundtableKey: string;
  title: string;
  topic: string;
  inputSummary: string;
  participants: readonly string[];
  firstRole: string;
  qualityBaseline: "demo" | "data-correct" | "production";
  provenance: string;
}): string {
  return `${input.title}

Parent issue: ${input.parentIssueUrl}
Workflow id: ${input.workflowId}
Ledger task id: ${input.ledgerTaskId}
Roundtable key: ${input.roundtableKey}
Quality baseline: ${input.qualityBaseline}

Topic:
${input.topic}

Input summary:
${input.inputSummary}

Participants in order:
${input.participants.map((participant, index) => `${String(index + 1)}. ${participant}`).join("\n")}

Fixed one-round rule:
Each participant speaks once in the listed order. After contributing, the participant must hand control back to CEO主持人. This roundtable contribution is not the formal plan-written qa gate or final acceptance gate.

Initial handoff:
@${input.firstRole} 请作为圆桌参与者给出有来源的评审意见；发言后把控制权交回 CEO 主持人。

Provenance:
${input.provenance}

<!-- ${input.roundtableKey} -->`;
}

export function renderCeoRoundtableRouteBody(input: {
  nextRole: string;
  body: string;
}): { ok: true; body: string } | { ok: false; reason: string } {
  const body = `${input.body.trimEnd()}

本轮是圆桌发言，不是正式验收裁决；发言后请把控制权交回 CEO 主持人，不能直接交给 dev 或 product-manager。

<!-- agent-moebius:stage=${CEO_ORCHESTRATION_STAGE} -->`;
  const mentions = parseAgentMentions(body);
  if (mentions.length !== 1 || mentions[0]?.name !== input.nextRole) {
    return { ok: false, reason: `roundtable-route-invalid-mention:${mentions.map((mention) => mention.name).join(",")}` };
  }
  return { ok: true, body };
}

export function renderCeoRoundtableParentSummaryBody(input: {
  childIssueUrl: string;
  topic: string;
  summary: string;
  contributions: readonly CeoRoundtableContribution[];
  decision: string;
  provenance: string;
  completionKey: string;
}): string {
  const contributionLines = input.contributions
    .map((contribution) => {
      const disagreements =
        contribution.disagreements.length === 0 ? "none" : contribution.disagreements.map((item) => `  - ${item}`).join("\n");
      return `### ${contribution.role}
- Position: ${contribution.position}
- Evidence: ${contribution.evidence}
- Disagreements:
${disagreements}`;
    })
    .join("\n\n");

  return `圆桌汇总已完成。

Child issue: ${input.childIssueUrl}
Topic: ${input.topic}

Summary:
${input.summary}

Contributions:
${contributionLines}

Decision / next step:
${input.decision}

Provenance:
${input.provenance}

<!-- ${input.completionKey} -->

<!-- agent-moebius:stage=${CEO_ORCHESTRATION_STAGE} -->`;
}

export function ensureInProgressStage(body: string): string {
  if (parseTrailingStageMarker(body, [CEO_ORCHESTRATION_STAGE]) === CEO_ORCHESTRATION_STAGE) {
    return body.trimEnd();
  }

  return `${body.trimEnd()}\n\n<!-- agent-moebius:stage=${CEO_ORCHESTRATION_STAGE} -->`;
}

function parseRoundtableAction(input: {
  parsed: Record<string, unknown>;
  workflowId: string;
  availableAgentNames: readonly string[];
  visibleTaskIds: readonly string[];
}): ParseCeoOrchestrationResult {
  const mode = getNonEmptyString(input.parsed["mode"], "mode");
  if (!mode.ok) {
    return mode;
  }
  const participants = getNonEmptyStringArray(input.parsed["participants"], "participants");
  if (!participants.ok) {
    return participants;
  }
  const participantValidation = validateRoundtableParticipants(participants.value, input.availableAgentNames);
  if (!participantValidation.ok) {
    return participantValidation;
  }

  if (mode.value === "start") {
    const roundtableId = getNonEmptyString(input.parsed["roundtableId"], "roundtableId");
    const ledgerTaskId = getNonEmptyString(input.parsed["ledgerTaskId"], "ledgerTaskId");
    const title = getNonEmptyString(input.parsed["title"], "title");
    const topic = getNonEmptyString(input.parsed["topic"], "topic");
    const inputSummary = getNonEmptyString(input.parsed["inputSummary"], "inputSummary");
    const firstRole = getNonEmptyString(input.parsed["firstRole"], "firstRole");
    const qualityBaseline = getNonEmptyString(input.parsed["qualityBaseline"], "qualityBaseline");
    const provenance = getNonEmptyString(input.parsed["provenance"], "provenance");
    if (!roundtableId.ok) {
      return roundtableId;
    }
    if (!ledgerTaskId.ok) {
      return ledgerTaskId;
    }
    if (!title.ok) {
      return title;
    }
    if (!topic.ok) {
      return topic;
    }
    if (!inputSummary.ok) {
      return inputSummary;
    }
    if (!firstRole.ok) {
      return firstRole;
    }
    if (!qualityBaseline.ok) {
      return qualityBaseline;
    }
    if (!provenance.ok) {
      return provenance;
    }
    if (!input.visibleTaskIds.includes(ledgerTaskId.value)) {
      return { ok: false, reason: `unknown-ledger-task:${ledgerTaskId.value}` };
    }
    if (firstRole.value !== participants.value[0]) {
      return { ok: false, reason: `roundtable-first-role-mismatch:${firstRole.value}` };
    }
    if (!isQualityBaseline(qualityBaseline.value)) {
      return { ok: false, reason: `invalid-quality-baseline:${qualityBaseline.value}` };
    }
    return {
      ok: true,
      value: {
        action: "roundtable",
        workflowId: input.workflowId,
        mode: "start",
        roundtableId: roundtableId.value,
        ledgerTaskId: ledgerTaskId.value,
        title: title.value,
        topic: topic.value,
        inputSummary: inputSummary.value,
        participants: participants.value,
        firstRole: firstRole.value,
        qualityBaseline: qualityBaseline.value,
        provenance: provenance.value,
      },
    };
  }

  if (mode.value === "route") {
    const roundtableKey = getNonEmptyString(input.parsed["roundtableKey"], "roundtableKey");
    const nextRole = getNonEmptyString(input.parsed["nextRole"], "nextRole");
    const body = getNonEmptyString(input.parsed["body"], "body");
    if (!roundtableKey.ok) {
      return roundtableKey;
    }
    if (!nextRole.ok) {
      return nextRole;
    }
    if (!body.ok) {
      return body;
    }
    if (!participants.value.includes(nextRole.value)) {
      return { ok: false, reason: `roundtable-next-role-not-participant:${nextRole.value}` };
    }
    const mentions = parseAgentMentions(body.value);
    if (mentions.length !== 1 || mentions[0]?.name !== nextRole.value) {
      return { ok: false, reason: `roundtable-route-body-invalid-mention:${mentions.map((mention) => mention.name).join(",")}` };
    }
    return {
      ok: true,
      value: {
        action: "roundtable",
        workflowId: input.workflowId,
        mode: "route",
        roundtableKey: roundtableKey.value,
        participants: participants.value,
        nextRole: nextRole.value,
        body: body.value,
      },
    };
  }

  if (mode.value === "complete") {
    const roundtableKey = getNonEmptyString(input.parsed["roundtableKey"], "roundtableKey");
    const summary = getNonEmptyString(input.parsed["summary"], "summary");
    const decision = getNonEmptyString(input.parsed["decision"], "decision");
    const provenance = getNonEmptyString(input.parsed["provenance"], "provenance");
    if (!roundtableKey.ok) {
      return roundtableKey;
    }
    if (!summary.ok) {
      return summary;
    }
    if (!decision.ok) {
      return decision;
    }
    if (!provenance.ok) {
      return provenance;
    }
    const contributions = parseRoundtableContributions(input.parsed["contributions"], participants.value);
    if (!contributions.ok) {
      return contributions;
    }
    return {
      ok: true,
      value: {
        action: "roundtable",
        workflowId: input.workflowId,
        mode: "complete",
        roundtableKey: roundtableKey.value,
        participants: participants.value,
        summary: summary.value,
        contributions: contributions.value,
        decision: decision.value,
        provenance: provenance.value,
      },
    };
  }

  return { ok: false, reason: `roundtable-unknown-mode:${mode.value}` };
}

function stripTrailingStageMarker(output: string): string {
  return output.replace(/\s*<!--\s*agent-moebius:stage=in-progress\s*-->\s*$/u, "");
}

function stripFencedJson(text: string): string {
  const fenced = text.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/u);
  return fenced?.[1]?.trim() ?? text;
}

function parseGroups(value: unknown): { ok: true; value: CeoOrchestrationGroup[] } | { ok: false; reason: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: "groups-empty" };
  }
  const result: CeoOrchestrationGroup[] = [];
  const seen = new Set<string>();
  for (const [index, group] of value.entries()) {
    if (!isPlainObject(group)) {
      return { ok: false, reason: `groups.${String(index)}:not-object` };
    }
    const id = getNonEmptyString(group["id"], `groups.${String(index)}.id`);
    if (!id.ok) {
      return id;
    }
    const reason = getNonEmptyString(group["reason"], `groups.${String(index)}.reason`);
    if (!reason.ok) {
      return reason;
    }
    if (seen.has(id.value)) {
      return { ok: false, reason: `duplicate-group:${id.value}` };
    }
    seen.add(id.value);
    result.push({ id: id.value, reason: reason.value });
  }
  return { ok: true, value: result };
}

function parseChildIssueDescriptors(input: {
  value: unknown;
  groups: readonly CeoOrchestrationGroup[];
  availableAgentNames: readonly string[];
  visibleTaskIds: readonly string[];
}): { ok: true; value: CeoChildIssueDescriptor[] } | { ok: false; reason: string } {
  if (!Array.isArray(input.value) || input.value.length === 0) {
    return { ok: false, reason: "issues-empty" };
  }
  const groupIds = new Set(input.groups.map((group) => group.id));
  const taskIds = new Set(input.visibleTaskIds);
  const seenTaskIds = new Set<string>();
  const result: CeoChildIssueDescriptor[] = [];

  for (const [index, descriptor] of input.value.entries()) {
    const path = `issues.${String(index)}`;
    if (!isPlainObject(descriptor)) {
      return { ok: false, reason: `${path}:not-object` };
    }

    const ledgerTaskId = getNonEmptyString(descriptor["ledgerTaskId"], `${path}.ledgerTaskId`);
    if (!ledgerTaskId.ok) {
      return ledgerTaskId;
    }
    if (!taskIds.has(ledgerTaskId.value)) {
      return { ok: false, reason: `unknown-ledger-task:${ledgerTaskId.value}` };
    }
    if (seenTaskIds.has(ledgerTaskId.value)) {
      return { ok: false, reason: `duplicate-ledger-task:${ledgerTaskId.value}` };
    }
    seenTaskIds.add(ledgerTaskId.value);

    const groupId = getNonEmptyString(descriptor["groupId"], `${path}.groupId`);
    if (!groupId.ok) {
      return groupId;
    }
    if (!groupIds.has(groupId.value)) {
      return { ok: false, reason: `unknown-group:${groupId.value}` };
    }

    const title = getNonEmptyString(descriptor["title"], `${path}.title`);
    if (!title.ok) {
      return title;
    }
    const description = getNonEmptyString(descriptor["description"], `${path}.description`);
    if (!description.ok) {
      return description;
    }
    const initialRole = getNonEmptyString(descriptor["initialRole"], `${path}.initialRole`);
    if (!initialRole.ok) {
      return initialRole;
    }
    const qualityBaseline = getNonEmptyString(descriptor["qualityBaseline"], `${path}.qualityBaseline`);
    if (!qualityBaseline.ok) {
      return qualityBaseline;
    }
    const provenance = getNonEmptyString(descriptor["provenance"], `${path}.provenance`);
    if (!provenance.ok) {
      return provenance;
    }
    const initialRoleValue = initialRole.value;
    const qualityBaselineValue = qualityBaseline.value;
    if (!input.availableAgentNames.includes(initialRoleValue)) {
      return { ok: false, reason: `invalid-initial-role:${initialRoleValue}` };
    }
    if (!isQualityBaseline(qualityBaselineValue)) {
      return { ok: false, reason: `invalid-quality-baseline:${qualityBaselineValue}` };
    }

    const acceptanceStatements = getNonEmptyStringArray(
      descriptor["acceptanceStatements"],
      `${path}.acceptanceStatements`,
    );
    if (!acceptanceStatements.ok) {
      return acceptanceStatements;
    }
    const dependencies = getStringArray(descriptor["dependencies"], `${path}.dependencies`);
    if (!dependencies.ok) {
      return dependencies;
    }

    result.push({
      ledgerTaskId: ledgerTaskId.value,
      groupId: groupId.value,
      title: title.value,
      description: description.value,
      initialRole: initialRoleValue,
      qualityBaseline: qualityBaselineValue,
      acceptanceStatements: acceptanceStatements.value,
      dependencies: dependencies.value,
      provenance: provenance.value,
    });
  }

  return { ok: true, value: result };
}

function validateRoundtableParticipants(
  participants: readonly string[],
  availableAgentNames: readonly string[],
): { ok: true } | { ok: false; reason: string } {
  const available = new Set(availableAgentNames);
  const seen = new Set<string>();
  for (const participant of participants) {
    if (!available.has(participant)) {
      return { ok: false, reason: `roundtable-participant-unavailable:${participant}` };
    }
    if (seen.has(participant)) {
      return { ok: false, reason: `roundtable-participant-duplicate:${participant}` };
    }
    seen.add(participant);
  }
  for (const required of ["qa", "dev-manager", "hermes-user"]) {
    if (!seen.has(required)) {
      return { ok: false, reason: `roundtable-required-participant-missing:${required}` };
    }
  }
  return { ok: true };
}

function parseRoundtableContributions(
  value: unknown,
  participants: readonly string[],
): { ok: true; value: CeoRoundtableContribution[] } | { ok: false; reason: string } {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "contributions:invalid" };
  }
  const participantSet = new Set(participants);
  const seen = new Set<string>();
  const result: CeoRoundtableContribution[] = [];
  for (const [index, contribution] of value.entries()) {
    const path = `contributions.${String(index)}`;
    if (!isPlainObject(contribution)) {
      return { ok: false, reason: `${path}:not-object` };
    }
    const role = getNonEmptyString(contribution["role"], `${path}.role`);
    const position = getNonEmptyString(contribution["position"], `${path}.position`);
    const evidence = getNonEmptyString(contribution["evidence"], `${path}.evidence`);
    const disagreements = getStringArray(contribution["disagreements"], `${path}.disagreements`);
    if (!role.ok) {
      return role;
    }
    if (!position.ok) {
      return position;
    }
    if (!evidence.ok) {
      return evidence;
    }
    if (!disagreements.ok) {
      return disagreements;
    }
    if (!participantSet.has(role.value)) {
      return { ok: false, reason: `contribution-role-not-participant:${role.value}` };
    }
    if (seen.has(role.value)) {
      return { ok: false, reason: `contribution-role-duplicate:${role.value}` };
    }
    seen.add(role.value);
    result.push({
      role: role.value,
      position: position.value,
      evidence: evidence.value,
      disagreements: disagreements.value,
    });
  }
  const missing = participants.filter((participant) => !seen.has(participant));
  if (missing.length > 0) {
    return { ok: false, reason: `contribution-role-missing:${missing.join(",")}` };
  }
  return { ok: true, value: result };
}

function getNonEmptyString(value: unknown, path: string): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, reason: `${path}:missing` };
  }
  return { ok: true, value: value.trim() };
}

function getStringArray(value: unknown, path: string): { ok: true; value: string[] } | { ok: false; reason: string } {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return { ok: false, reason: `${path}:invalid` };
  }
  return { ok: true, value: value.map((item) => item.trim()).filter((item) => item !== "") };
}

function getNonEmptyStringArray(
  value: unknown,
  path: string,
): { ok: true; value: string[] } | { ok: false; reason: string } {
  const parsed = getStringArray(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.value.length === 0) {
    return { ok: false, reason: `${path}:empty` };
  }
  return parsed;
}

function isQualityBaseline(value: string): value is "demo" | "data-correct" | "production" {
  return value === "demo" || value === "data-correct" || value === "production";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
