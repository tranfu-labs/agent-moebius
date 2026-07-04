import { describe, expect, it } from "vitest";
import { parseAgentMentions } from "../src/conversation.js";
import {
  buildCeoOrchestrationKey,
  buildCeoRoundtableCompletionKey,
  buildCeoRoundtableKey,
  parseCeoOrchestrationOutput,
  renderCeoChildIssueBody,
  renderCeoRoundtableChildIssueBody,
  renderCeoRoundtableParentSummaryBody,
  renderCeoRoundtableRouteBody,
  type CeoChildIssueDescriptor,
  type CeoOrchestrationGroup,
} from "../src/ceo-orchestration.js";
import type { CeoScript } from "../src/ceo-scripts.js";
import { makeIssueSource } from "../src/issue-source.js";

const source = makeIssueSource({ owner: "tranfu-labs", repo: "agent-moebius", issueNumber: 67 });
const scripts: CeoScript[] = [
  { id: "plan-review", action: "route", body: "route", fileName: "plan-review.md" },
  {
    id: "milestone-spawn-child-issues",
    action: "spawn_child_issues",
    body: "spawn",
    fileName: "milestone-spawn-child-issues.md",
  },
  {
    id: "roundtable-plan-review",
    action: "roundtable",
    body: "roundtable",
    fileName: "roundtable-plan-review.md",
  },
];
const descriptor: CeoChildIssueDescriptor = {
  ledgerTaskId: "task-1",
  groupId: "g1",
  title: "Implement orchestration",
  description: "实现 CEO 编排路径。",
  initialRole: "dev",
  qualityBaseline: "data-correct",
  acceptanceStatements: ["跑 pnpm test → 应退出码 0"],
  dependencies: ["task-0"],
  provenance: "来自当前阶段 projection",
};
const group: CeoOrchestrationGroup = { id: "g1", reason: "同一模块串行" };

describe("CEO orchestration output parser", () => {
  it("accepts fenced JSON followed by an in-progress stage marker", () => {
    const output = `\`\`\`json
${JSON.stringify({
  action: "spawn_child_issues",
  workflowId: "milestone-spawn-child-issues",
  summary: "拆解完成",
  groups: [group],
  issues: [descriptor],
})}
\`\`\`

<!-- agent-moebius:stage=in-progress -->`;

    expect(
      parseCeoOrchestrationOutput({
        output,
        scripts,
        availableAgentNames: ["dev", "qa", "product-manager"],
        visibleTaskIds: ["task-1"],
      }),
    ).toMatchObject({
      ok: true,
      value: {
        action: "spawn_child_issues",
        workflowId: "milestone-spawn-child-issues",
      },
    });
  });

  it("rejects invalid JSON and does not produce descriptors", () => {
    expect(
      parseCeoOrchestrationOutput({
        output: "not json\n\n<!-- agent-moebius:stage=in-progress -->",
        scripts,
        availableAgentNames: ["dev"],
        visibleTaskIds: ["task-1"],
      }),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("invalid-json") });
  });

  it("rejects unknown workflow, invalid role, missing acceptance, and invisible task ids", () => {
    const base = {
      action: "spawn_child_issues",
      workflowId: "milestone-spawn-child-issues",
      summary: "拆解完成",
      groups: [group],
      issues: [descriptor],
    };
    const parse = (payload: unknown) =>
      parseCeoOrchestrationOutput({
        output: `${JSON.stringify(payload)}\n\n<!-- agent-moebius:stage=in-progress -->`,
        scripts,
        availableAgentNames: ["dev"],
        visibleTaskIds: ["task-1"],
      });

    expect(parse({ ...base, workflowId: "missing" })).toMatchObject({ ok: false, reason: "unknown-workflow:missing" });
    expect(parse({ ...base, issues: [{ ...descriptor, initialRole: "ghost" }] })).toMatchObject({
      ok: false,
      reason: "invalid-initial-role:ghost",
    });
    expect(parse({ ...base, issues: [{ ...descriptor, acceptanceStatements: [] }] })).toMatchObject({
      ok: false,
      reason: "issues.0.acceptanceStatements:empty",
    });
    expect(parse({ ...base, issues: [{ ...descriptor, ledgerTaskId: "task-2" }] })).toMatchObject({
      ok: false,
      reason: "unknown-ledger-task:task-2",
    });
  });

  it("builds a stable orchestration key that ignores title and description drift", () => {
    expect(buildCeoOrchestrationKey({ source, workflowId: "milestone-spawn-child-issues", ledgerTaskId: "task-1" })).toBe(
      buildCeoOrchestrationKey({ source, workflowId: "milestone-spawn-child-issues", ledgerTaskId: "task-1" }),
    );
    expect(buildCeoOrchestrationKey({ source, workflowId: "milestone-spawn-child-issues", ledgerTaskId: "task-1" })).not.toBe(
      buildCeoOrchestrationKey({ source, workflowId: "milestone-spawn-child-issues", ledgerTaskId: "task-2" }),
    );
  });

  it("renders child issue body with required fields and exactly one handoff mention", () => {
    const key = buildCeoOrchestrationKey({ source, workflowId: "milestone-spawn-child-issues", ledgerTaskId: "task-1" });
    const body = renderCeoChildIssueBody({
      source,
      parentIssueUrl: "https://github.com/tranfu-labs/agent-moebius/issues/67",
      workflowId: "milestone-spawn-child-issues",
      group,
      descriptor,
      orchestrationKey: key,
    });

    expect(body).toContain("Parent issue: https://github.com/tranfu-labs/agent-moebius/issues/67");
    expect(body).toContain("Ledger task id: task-1");
    expect(body).toContain("Quality baseline: data-correct");
    expect(body).toContain("跑 pnpm test → 应退出码 0");
    expect(body).toContain("来自当前阶段 projection");
    expect(body).toContain(key);
    expect(parseAgentMentions(body).map((mention) => mention.name)).toEqual(["dev"]);
  });

  it("parses roundtable start, route, and complete outputs", () => {
    const participants = ["qa", "dev-manager", "hermes-user"];
    const parse = (payload: unknown) =>
      parseCeoOrchestrationOutput({
        output: `${JSON.stringify(payload)}\n\n<!-- agent-moebius:stage=in-progress -->`,
        scripts,
        availableAgentNames: ["ceo", "qa", "dev-manager", "hermes-user"],
        visibleTaskIds: ["task-1"],
      });

    expect(
      parse({
        action: "roundtable",
        workflowId: "roundtable-plan-review",
        mode: "start",
        roundtableId: "rt-1",
        ledgerTaskId: "task-1",
        title: "Plan review roundtable",
        topic: "Review the plan",
        inputSummary: "Plan text",
        participants,
        firstRole: "qa",
        qualityBaseline: "data-correct",
        provenance: "parent issue",
      }),
    ).toMatchObject({ ok: true, value: { action: "roundtable", mode: "start" } });

    expect(
      parse({
        action: "roundtable",
        workflowId: "roundtable-plan-review",
        mode: "route",
        roundtableKey: "agent-moebius-roundtable-key:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        participants,
        nextRole: "dev-manager",
        body: "@dev-manager 请发言。",
      }),
    ).toMatchObject({ ok: true, value: { action: "roundtable", mode: "route" } });

    expect(
      parse({
        action: "roundtable",
        workflowId: "roundtable-plan-review",
        mode: "complete",
        roundtableKey: "agent-moebius-roundtable-key:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        participants,
        summary: "完成",
        contributions: participants.map((role) => ({
          role,
          position: `${role} position`,
          evidence: `${role} evidence`,
          disagreements: [],
        })),
        decision: "继续",
        provenance: "child issue",
      }),
    ).toMatchObject({ ok: true, value: { action: "roundtable", mode: "complete" } });
  });

  it("rejects invalid roundtable participants, route mentions, and incomplete contributions", () => {
    const participants = ["qa", "dev-manager", "hermes-user"];
    const parse = (payload: unknown, availableAgentNames = ["ceo", "qa", "dev-manager", "hermes-user"]) =>
      parseCeoOrchestrationOutput({
        output: `${JSON.stringify(payload)}\n\n<!-- agent-moebius:stage=in-progress -->`,
        scripts,
        availableAgentNames,
        visibleTaskIds: ["task-1"],
      });

    const start = {
      action: "roundtable",
      workflowId: "roundtable-plan-review",
      mode: "start",
      roundtableId: "rt-1",
      ledgerTaskId: "task-1",
      title: "Plan review roundtable",
      topic: "Review the plan",
      inputSummary: "Plan text",
      participants,
      firstRole: "qa",
      qualityBaseline: "data-correct",
      provenance: "parent issue",
    };
    expect(parse(start, ["ceo", "dev-manager", "hermes-user"])).toMatchObject({
      ok: false,
      reason: "roundtable-participant-unavailable:qa",
    });
    expect(parse({ ...start, participants: ["qa", "qa", "dev-manager", "hermes-user"] })).toMatchObject({
      ok: false,
      reason: "roundtable-participant-duplicate:qa",
    });

    expect(
      parse({
        action: "roundtable",
        workflowId: "roundtable-plan-review",
        mode: "route",
        roundtableKey: "agent-moebius-roundtable-key:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        participants,
        nextRole: "dev-manager",
        body: "@dev-manager @qa 请发言。",
      }),
    ).toMatchObject({ ok: false, reason: "roundtable-route-body-invalid-mention:dev-manager,qa" });

    expect(
      parse({
        action: "roundtable",
        workflowId: "roundtable-plan-review",
        mode: "complete",
        roundtableKey: "agent-moebius-roundtable-key:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        participants,
        summary: "完成",
        contributions: [
          { role: "qa", position: "p", evidence: "e", disagreements: [] },
          { role: "dev-manager", position: "p", evidence: "e", disagreements: [] },
        ],
        decision: "继续",
        provenance: "child issue",
      }),
    ).toMatchObject({ ok: false, reason: "contribution-role-missing:hermes-user" });
  });

  it("renders roundtable child, route, and parent summary bodies with stable keys", () => {
    const participants = ["qa", "dev-manager", "hermes-user"];
    const roundtableKey = buildCeoRoundtableKey({ source, workflowId: "roundtable-plan-review", roundtableId: "rt-1" });
    const childBody = renderCeoRoundtableChildIssueBody({
      parentIssueUrl: "https://github.com/tranfu-labs/agent-moebius/issues/67",
      workflowId: "roundtable-plan-review",
      ledgerTaskId: "task-1",
      roundtableKey,
      title: "Plan review",
      topic: "Review topic",
      inputSummary: "Plan summary",
      participants,
      firstRole: "qa",
      qualityBaseline: "data-correct",
      provenance: "parent issue",
    });

    expect(childBody).toContain("Parent issue: https://github.com/tranfu-labs/agent-moebius/issues/67");
    expect(childBody).toContain("Workflow id: roundtable-plan-review");
    expect(childBody).toContain("Ledger task id: task-1");
    expect(childBody).toContain(roundtableKey);
    expect(childBody).toContain("qa");
    expect(childBody).toContain("dev-manager");
    expect(childBody).toContain("hermes-user");
    expect(parseAgentMentions(childBody).map((mention) => mention.name)).toEqual(["qa"]);

    const route = renderCeoRoundtableRouteBody({ nextRole: "dev-manager", body: "@dev-manager 请给出技术评审。" });
    expect(route).toMatchObject({ ok: true });
    expect(route.ok ? route.body : "").toContain("CEO 主持人");
    expect(parseAgentMentions(route.ok ? route.body : "").map((mention) => mention.name)).toEqual(["dev-manager"]);

    const firstCompletionKey = buildCeoRoundtableCompletionKey({
      roundtableKey,
      participants,
      participantMessageIndexes: [2, 4, 6],
    });
    const secondCompletionKey = buildCeoRoundtableCompletionKey({
      roundtableKey,
      participants,
      participantMessageIndexes: [2, 4, 6],
    });
    expect(firstCompletionKey).toBe(secondCompletionKey);

    const summary = renderCeoRoundtableParentSummaryBody({
      childIssueUrl: "https://github.com/tranfu-labs/agent-moebius/issues/101",
      topic: "Review topic",
      summary: "Consensus with caveats",
      contributions: participants.map((role) => ({
        role,
        position: `${role} position`,
        evidence: `${role} evidence`,
        disagreements: role === "hermes-user" ? ["needs clearer UX evidence"] : [],
      })),
      decision: "Proceed",
      provenance: "child issue",
      completionKey: firstCompletionKey,
    });
    expect(summary).toContain("### qa");
    expect(summary).toContain("### dev-manager");
    expect(summary).toContain("### hermes-user");
    expect(summary).toContain("needs clearer UX evidence");
    expect(summary).toContain(firstCompletionKey);
  });
});
