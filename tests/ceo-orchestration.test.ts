import { describe, expect, it } from "vitest";
import { parseAgentMentions } from "../src/conversation.js";
import {
  buildCeoOrchestrationKey,
  parseCeoOrchestrationOutput,
  renderCeoChildIssueBody,
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
});
