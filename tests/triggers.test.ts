import { describe, expect, it } from "vitest";
import { MAX_SELF_REFLECT } from "../src/config.js";
import { buildTimeline, formatAgentComment } from "../src/conversation.js";
import type { TimelineMessage } from "../src/conversation.js";
import { resolveTrigger } from "../src/triggers/index.js";
import { resolveReflectorStageTrigger } from "../src/triggers/reflector-stage-trigger.js";
import { appendPostedComment } from "../src/triggers/self-reflect.js";

const agents = ["dev", "product-manager", "reflector"];

describe("triggers", () => {
  it("runs the mentioned agent through the mention trigger", () => {
    const timeline = buildTimeline("@dev please handle this", [], agents);

    expect(resolveTrigger({ timeline, availableAgentNames: agents })).toEqual({
      kind: "run-agent",
      role: "dev",
      reason: "mention",
    });
  });

  it("does not run reflector through an ordinary mention", () => {
    const timeline = buildTimeline("@reflector please remind dev", [], agents);

    expect(resolveTrigger({ timeline, availableAgentNames: agents })).toEqual({
      kind: "skip",
      reason: "no-trigger",
    });
  });

  it("does not run CEO through an ordinary mention", () => {
    const timeline = buildTimeline("@ceo please review", [], ["ceo", ...agents]);

    expect(resolveTrigger({ timeline, availableAgentNames: ["ceo", ...agents] })).toEqual({
      kind: "skip",
      reason: "no-trigger",
    });
  });

  it("posts a reflector comment when an agent emits a supported stage", () => {
    const timeline = buildTimeline(
      "initial",
      [{ body: "&lt;dev&gt;:\n方案已写完\n<!-- agent-moebius:stage=plan-written -->\n\n<!-- agent-moebius:role=dev -->" }],
      agents,
    );

    const trigger = resolveTrigger({ timeline, availableAgentNames: agents });

    expect(trigger).toMatchObject({
      kind: "post-comment",
      role: "reflector",
      reason: "reflector-stage",
      sourceRole: "dev",
      sourceIndex: 1,
      stage: "plan-written",
    });
    expect(trigger.kind === "post-comment" ? trigger.body : "").toContain("@dev 请针对「plan-written」做一次反思。");
    expect(trigger.kind === "post-comment" ? trigger.body : "").toContain("<!-- agent-moebius:role=reflector -->");
    expect(trigger.kind === "post-comment" ? trigger.body : "").toContain(
      "<!-- agent-moebius:stage-hook source=dev stage=plan-written sourceIndex=1 -->",
    );
  });

  it("prioritizes the stage trigger over mentions in the same agent message", () => {
    const timeline = buildTimeline(
      "initial",
      [
        {
          body: "&lt;dev&gt;:\n@product-manager FYI\n<!-- agent-moebius:stage=code-verified -->\n\n<!-- agent-moebius:role=dev -->",
        },
      ],
      agents,
    );

    expect(resolveTrigger({ timeline, availableAgentNames: agents })).toMatchObject({
      kind: "post-comment",
      role: "reflector",
      stage: "code-verified",
    });
  });

  it("ignores old unsupported stages", () => {
    const timeline = buildTimeline(
      "initial",
      [{ body: "&lt;dev&gt;:\n旧阶段\n<!-- agent-moebius:stage=plan-confirmed -->\n\n<!-- agent-moebius:role=dev -->" }],
      agents,
    );

    expect(resolveTrigger({ timeline, availableAgentNames: agents })).toEqual({
      kind: "skip",
      reason: "no-trigger",
    });
  });

  it("tolerantly parses supported stage marker whitespace and marker casing", () => {
    const timeline = buildTimeline(
      "initial",
      [
        {
          body: "&lt;dev&gt;:\n验证完成\n<!--  Agent-Moebius : stage = code-verified  -->\n\n<!-- agent-moebius:role=dev -->",
        },
      ],
      agents,
    );

    expect(resolveTrigger({ timeline, availableAgentNames: agents })).toMatchObject({
      kind: "post-comment",
      role: "reflector",
      stage: "code-verified",
    });
  });

  it("does not trigger reflector for in-progress stage", () => {
    const timeline = buildTimeline(
      "initial",
      [
        {
          body: "&lt;dev&gt;:\n还在处理\n<!-- agent-moebius:stage=in-progress -->\n\n<!-- agent-moebius:role=dev -->",
        },
      ],
      agents,
    );

    expect(resolveTrigger({ timeline, availableAgentNames: agents })).toEqual({
      kind: "skip",
      reason: "no-trigger",
    });
  });

  it("does not stage-trigger on reflector messages but keeps their mentions active", () => {
    const timeline = buildTimeline(
      "initial",
      [
        {
          body: "&lt;reflector&gt;:\n@dev 请反思\n<!-- agent-moebius:stage=plan-written -->\n\n<!-- agent-moebius:role=reflector -->",
        },
      ],
      agents,
    );

    expect(resolveTrigger({ timeline, availableAgentNames: agents })).toEqual({
      kind: "run-agent",
      role: "dev",
      reason: "mention",
    });
  });

  it("still posts a stage hook when same (source, stage) count is below MAX_SELF_REFLECT", () => {
    const timeline = [
      { index: 0, speaker: "user", body: "initial", source: "issue-body" as const },
      {
        index: 1,
        speaker: "dev",
        body: "方案 v1\n<!-- agent-moebius:stage=plan-written -->",
        source: "comment" as const,
      },
      {
        index: 2,
        speaker: "reflector",
        body: "@dev 请反思\n<!-- agent-moebius:stage-hook source=dev stage=plan-written sourceIndex=1 -->",
        source: "comment" as const,
      },
      {
        index: 3,
        speaker: "dev",
        body: "方案 v2\n<!-- agent-moebius:stage=plan-written -->",
        source: "comment" as const,
      },
    ];

    expect(resolveReflectorStageTrigger({ timeline, availableAgentNames: agents })).toMatchObject({
      kind: "post-comment",
      role: "reflector",
      sourceRole: "dev",
      stage: "plan-written",
      sourceIndex: 3,
    });
  });

  it("adds convergence instructions to the final automatic reflection hook", () => {
    const timeline: TimelineMessage[] = [
      { index: 0, speaker: "user", body: "initial", source: "issue-body" },
    ];

    for (let i = 0; i < MAX_SELF_REFLECT - 1; i += 1) {
      const devIndex = timeline.length;
      timeline.push({
        index: devIndex,
        speaker: "dev",
        body: `方案 v${i + 1}\n<!-- agent-moebius:stage=plan-written -->`,
        source: "comment",
      });
      timeline.push({
        index: timeline.length,
        speaker: "reflector",
        body: `@dev 请反思\n<!-- agent-moebius:stage-hook source=dev stage=plan-written sourceIndex=${devIndex} -->`,
        source: "comment",
      });
    }

    timeline.push({
      index: timeline.length,
      speaker: "dev",
      body: "方案最终反思\n<!-- agent-moebius:stage=plan-written -->",
      source: "comment",
    });

    const trigger = resolveReflectorStageTrigger({ timeline, availableAgentNames: agents });

    expect(trigger).toMatchObject({
      kind: "post-comment",
      role: "reflector",
      sourceRole: "dev",
      stage: "plan-written",
    });
    const body = trigger?.kind === "post-comment" ? trigger.body : "";
    expect(body).toContain("这是该阶段最后一次自动反思。");
    expect(body).toContain("如果没有发现新问题，请不要继续输出同一个 stage marker，直接按推进计划进入后续步骤。");
    expect(body).toContain("如果发现新问题，请说明问题与建议处理方式，然后停下等待人类检查，不要继续自动推进。");
  });

  it("stops triggering once same (source, stage) hook count reaches MAX_SELF_REFLECT", () => {
    const timeline: TimelineMessage[] = [
      { index: 0, speaker: "user", body: "initial", source: "issue-body" },
    ];

    for (let i = 0; i < MAX_SELF_REFLECT; i += 1) {
      const devIndex = timeline.length;
      timeline.push({
        index: devIndex,
        speaker: "dev",
        body: `方案 v${i + 1}\n<!-- agent-moebius:stage=plan-written -->`,
        source: "comment",
      });
      timeline.push({
        index: timeline.length,
        speaker: "reflector",
        body: `@dev 请反思\n<!-- agent-moebius:stage-hook source=dev stage=plan-written sourceIndex=${devIndex} -->`,
        source: "comment",
      });
    }

    timeline.push({
      index: timeline.length,
      speaker: "dev",
      body: "方案再修\n<!-- agent-moebius:stage=plan-written -->",
      source: "comment",
    });

    expect(resolveReflectorStageTrigger({ timeline, availableAgentNames: agents })).toBeNull();
  });


  it("resolves a reflector stage trigger after locally appending dev's posted comment", () => {
    const timeline = buildTimeline("@dev 请按要求推进", [], agents);
    const postedBody = formatAgentComment(
      "dev",
      "已到 plan-written，按要求停下。\n\n<!-- agent-moebius:stage=plan-written -->",
    );
    const reflected = appendPostedComment(timeline, "dev", postedBody);

    expect(resolveTrigger({ timeline: reflected, availableAgentNames: agents })).toMatchObject({
      kind: "post-comment",
      role: "reflector",
      reason: "reflector-stage",
      sourceRole: "dev",
      stage: "plan-written",
    });
  });
});
