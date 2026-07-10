import { createHash } from "node:crypto";
import type { LocalConsoleMessage } from "./types.js";

export const LOCAL_ACCEPTANCE_ROLES = new Set(["qa", "product-manager", "hermes-user"]);

export type LocalAcceptanceVerdict = "passed" | "failed";

export interface LocalAcceptanceStatementResult {
  index: number;
  status: LocalAcceptanceVerdict;
  evidence: string;
}

export interface ParsedLocalAcceptanceWalkthrough {
  kind: "parsed";
  verdict: LocalAcceptanceVerdict;
  statementResults: LocalAcceptanceStatementResult[];
  rawConclusion: "通过" | "不通过";
}

export interface UnparsedLocalAcceptanceWalkthrough {
  kind: "unparsed";
  diagnostics: string[];
  attemptedAcceptance: boolean;
}

export type LocalAcceptanceWalkthroughParseResult =
  | ParsedLocalAcceptanceWalkthrough
  | UnparsedLocalAcceptanceWalkthrough;

export interface LocalAcceptancePrePassDecision {
  kind: "pass" | "fail" | "format-error" | "blocked";
  taskId: string;
  role: string;
  statementResults: LocalAcceptanceStatementResult[];
  rawConclusion: "通过" | "不通过" | null;
  bodyDigest: string;
  diagnostics: string[];
  acceptanceStatements: string[];
}

export function isLocalAcceptanceRole(role: string | null): role is "qa" | "product-manager" | "hermes-user" {
  return role !== null && LOCAL_ACCEPTANCE_ROLES.has(role);
}

export function parseLocalAcceptanceWalkthrough(
  body: string,
  acceptanceStatements: readonly string[],
): LocalAcceptanceWalkthroughParseResult {
  const diagnostics: string[] = [];
  const lines = body.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line !== "");
  const itemPattern = /^(\d+)\.\s*(通过|不通过)\s*(?:—|-)\s*(.+)$/u;
  const conclusionPattern = /^验收结论：\s*(通过|不通过)\s*$/u;
  const itemLines = lines.filter((line) => itemPattern.test(line));
  const conclusionLines = lines.flatMap((line) => {
    const match = conclusionPattern.exec(line);
    return match === null ? [] : [match[1] as "通过" | "不通过"];
  });
  const attemptedAcceptance = conclusionLines.length > 0 || /验收|通过|不通过/u.test(body);

  if (acceptanceStatements.length === 0) {
    diagnostics.push("missing-acceptance-statements");
  }
  if (conclusionLines.length !== 1) {
    diagnostics.push(conclusionLines.length === 0 ? "missing-conclusion" : "multiple-conclusions");
  }
  if (itemLines.length !== acceptanceStatements.length) {
    diagnostics.push(`statement-count-mismatch:${itemLines.length}/${acceptanceStatements.length}`);
  }

  const results: LocalAcceptanceStatementResult[] = [];
  const seen = new Set<number>();
  for (const line of itemLines) {
    const match = itemPattern.exec(line);
    if (match === null) {
      continue;
    }
    const index = Number(match[1]);
    const status = match[2] === "通过" ? "passed" : "failed";
    const evidence = match[3]?.trim() ?? "";
    if (!Number.isInteger(index) || index < 1) {
      diagnostics.push(`invalid-index:${match[1]}`);
      continue;
    }
    if (seen.has(index)) {
      diagnostics.push(`duplicate-index:${index}`);
    }
    seen.add(index);
    if (evidence === "") {
      diagnostics.push(`missing-evidence:${index}`);
    }
    results.push({ index, status, evidence });
  }

  const sorted = [...results].sort((left, right) => left.index - right.index);
  for (let expected = 1; expected <= acceptanceStatements.length; expected += 1) {
    if (!seen.has(expected)) {
      diagnostics.push(`missing-index:${expected}`);
    }
  }
  if (sorted.some((result, offset) => result.index !== offset + 1)) {
    diagnostics.push("non-contiguous-numbering");
  }

  const rawConclusion = conclusionLines[0] ?? null;
  const derivedVerdict: LocalAcceptanceVerdict =
    sorted.length > 0 && sorted.every((result) => result.status === "passed") ? "passed" : "failed";
  if (rawConclusion !== null) {
    const conclusionVerdict: LocalAcceptanceVerdict = rawConclusion === "通过" ? "passed" : "failed";
    if (conclusionVerdict !== derivedVerdict) {
      diagnostics.push("conclusion-mismatch");
    }
  }

  if (diagnostics.length > 0 || rawConclusion === null) {
    return { kind: "unparsed", diagnostics: [...new Set(diagnostics)], attemptedAcceptance };
  }

  return {
    kind: "parsed",
    verdict: derivedVerdict,
    statementResults: sorted,
    rawConclusion,
  };
}

export function buildLocalAcceptanceReminder(input: {
  role: string;
  expectedCount: number;
  diagnostics: readonly string[];
}): string {
  const diagnosticText = input.diagnostics.length === 0 ? "格式无法解析" : input.diagnostics.join(", ");
  return [
    `本地验收走查格式无法解析：${diagnosticText}`,
    `期望 ${input.expectedCount} 条逐条结果，每行使用：N. 通过 — 依据 或 N. 不通过 — 依据`,
    "最后单独一行：验收结论：通过/不通过",
    `来源角色：${input.role}`,
  ].join("\n");
}

export function buildLocalAcceptanceBlockedMessage(input: {
  role: string;
  reason: string;
}): string {
  return [
    `本地验收无法入账：${input.reason}`,
    "未找到 formal acceptance statements，不能伪造验收范围。",
    `来源角色：${input.role}`,
  ].join("\n");
}

export function extractLocalAcceptanceStatements(body: string): string[] {
  const lines = body.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^\s*(Acceptance statements|验收语句)\s*:?\s*$/iu.test(line.trim()));
  if (start === -1) {
    return [];
  }
  const statements: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (statements.length > 0) {
        break;
      }
      continue;
    }
    const match = /^(?:[-*]\s*)?(\d+)[.)、]\s*(.+)$/u.exec(trimmed) ?? /^[-*]\s+(.+)$/u.exec(trimmed);
    if (match === null) {
      if (statements.length > 0 && /^[A-Z][\w\s-]*:/u.test(trimmed)) {
        break;
      }
      continue;
    }
    const statement = (match[2] ?? match[1] ?? "").trim();
    if (statement !== "") {
      statements.push(statement);
    }
  }
  return statements;
}

export function extractLocalTaskId(body: string, fallback: string): string {
  const patterns = [
    /(?:Ledger task id|Task id|taskId)\s*:\s*([A-Za-z0-9._:-]+)/iu,
    /(?:任务\s*ID|任务标识)\s*[:：]\s*([A-Za-z0-9._:-]+)/iu,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(body);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return fallback;
}

export function digestLocalAcceptanceBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function buildLocalAcceptanceEvidence(input: {
  message: LocalConsoleMessage;
  role: string;
  taskId: string;
  acceptanceStatements: readonly string[];
  parsed: ParsedLocalAcceptanceWalkthrough;
}): Record<string, unknown> {
  return {
    role: input.role,
    taskId: input.taskId,
    messageId: input.message.id,
    sourceBodyDigest: digestLocalAcceptanceBody(input.message.body),
    rawConclusion: input.parsed.rawConclusion,
    statementResults: input.parsed.statementResults,
    acceptanceStatements: input.acceptanceStatements,
  };
}

export function buildLocalAcceptancePrePassDecision(input: {
  message: LocalConsoleMessage;
  role: string;
  taskId: string;
  acceptanceStatements: readonly string[];
  parseResult: LocalAcceptanceWalkthroughParseResult;
}): LocalAcceptancePrePassDecision | null {
  const bodyDigest = digestLocalAcceptanceBody(input.message.body);
  if (
    input.acceptanceStatements.length === 0 &&
    input.parseResult.kind === "unparsed" &&
    input.parseResult.attemptedAcceptance
  ) {
    return {
      kind: "blocked",
      taskId: input.taskId,
      role: input.role,
      statementResults: [],
      rawConclusion: null,
      bodyDigest,
      diagnostics: ["missing-acceptance-statements"],
      acceptanceStatements: [],
    };
  }
  if (input.parseResult.kind === "unparsed") {
    if (!input.parseResult.attemptedAcceptance) {
      return null;
    }
    return {
      kind: "format-error",
      taskId: input.taskId,
      role: input.role,
      statementResults: [],
      rawConclusion: null,
      bodyDigest,
      diagnostics: input.parseResult.diagnostics,
      acceptanceStatements: [...input.acceptanceStatements],
    };
  }
  return {
    kind: input.parseResult.verdict === "passed" ? "pass" : "fail",
    taskId: input.taskId,
    role: input.role,
    statementResults: input.parseResult.statementResults,
    rawConclusion: input.parseResult.rawConclusion,
    bodyDigest,
    diagnostics: [],
    acceptanceStatements: [...input.acceptanceStatements],
  };
}
