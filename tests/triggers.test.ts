import { describe, expect, it } from "vitest";
import { buildTimeline } from "../src/conversation.js";
import { resolveTrigger } from "../src/triggers/index.js";
import { resolveReflectorStageTrigger } from "../src/triggers/reflector-stage-trigger.js";

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

  it("posts a reflector comment when an agent emits a supported stage", () => {
    const timeline = buildTimeline(
      "initial",
      [{ body: "&lt;dev&gt;:\n方案已确认\n<!-- agent-moebius:stage=plan-confirmed -->\n\n<!-- agent-moebius:role=dev -->" }],
      agents,
    );

    const trigger = resolveTrigger({ timeline, availableAgentNames: agents });

    expect(trigger).toMatchObject({
      kind: "post-comment",
      role: "reflector",
      reason: "reflector-stage",
      sourceRole: "dev",
      sourceIndex: 1,
      stage: "plan-confirmed",
    });
    expect(trigger.kind === "post-comment" ? trigger.body : "").toContain("@dev 请针对「plan-confirmed」做一次反思。");
    expect(trigger.kind === "post-comment" ? trigger.body : "").toContain("<!-- agent-moebius:role=reflector -->");
    expect(trigger.kind === "post-comment" ? trigger.body : "").toContain(
      "<!-- agent-moebius:stage-hook source=dev stage=plan-confirmed sourceIndex=1 -->",
    );
  });

  it("prioritizes the stage trigger over mentions in the same agent message", () => {
    const timeline = buildTimeline(
      "initial",
      [
        {
          body: "&lt;dev&gt;:\n@product-manager FYI\n<!-- agent-moebius:stage=code-complete -->\n\n<!-- agent-moebius:role=dev -->",
        },
      ],
      agents,
    );

    expect(resolveTrigger({ timeline, availableAgentNames: agents })).toMatchObject({
      kind: "post-comment",
      role: "reflector",
      stage: "code-complete",
    });
  });

  it("ignores unsupported stages", () => {
    const timeline = buildTimeline(
      "initial",
      [{ body: "&lt;dev&gt;:\n准备中\n<!-- agent-moebius:stage=proposal-draft -->\n\n<!-- agent-moebius:role=dev -->" }],
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
          body: "&lt;reflector&gt;:\n@dev 请反思\n<!-- agent-moebius:stage=plan-confirmed -->\n\n<!-- agent-moebius:role=reflector -->",
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

  it("does not post duplicate stage hooks for the same source message and stage", () => {
    const timeline = [
      { index: 0, speaker: "user", body: "initial", source: "issue-body" as const },
      {
        index: 2,
        speaker: "reflector",
        body: "@dev 请反思\n<!-- agent-moebius:stage-hook source=dev stage=plan-confirmed sourceIndex=1 -->",
        source: "comment" as const,
      },
      {
        index: 1,
        speaker: "dev",
        body: "方案已确认\n<!-- agent-moebius:stage=plan-confirmed -->",
        source: "comment" as const,
      },
    ];

    expect(resolveReflectorStageTrigger({ timeline, availableAgentNames: agents })).toBeNull();
  });
});
