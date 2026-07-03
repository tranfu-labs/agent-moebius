import { describe, expect, it } from "vitest";
import { buildTimeline } from "../src/conversation.js";
import { resolveTrigger } from "../src/triggers/index.js";

const agents = ["dev", "product-manager", "secretary"];

describe("triggers", () => {
  it("runs the mentioned agent through the mention trigger", () => {
    const timeline = buildTimeline("@dev please handle this", [], agents);

    expect(resolveTrigger({ timeline, availableAgentNames: agents })).toEqual({
      kind: "run-agent",
      role: "dev",
      reason: "mention",
    });
  });

  it("runs secretary through the ordinary mention trigger", () => {
    const timeline = buildTimeline("@secretary learn this CEO miss", [], agents);

    expect(resolveTrigger({ timeline, availableAgentNames: agents })).toEqual({
      kind: "run-agent",
      role: "secretary",
      reason: "mention",
    });
  });

  it("does not run reflector after the reflector role is removed", () => {
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

  it("does not post a hook when an agent emits plan-written without a mention", () => {
    const timeline = buildTimeline(
      "initial",
      [{ body: "&lt;dev&gt;:\n方案已写完\n<!-- agent-moebius:stage=plan-written -->\n\n<!-- agent-moebius:role=dev -->" }],
      agents,
    );

    expect(resolveTrigger({ timeline, availableAgentNames: agents })).toEqual({
      kind: "skip",
      reason: "no-trigger",
    });
  });

  it("uses ordinary mentions in agent messages after stage hooks are removed", () => {
    const timeline = buildTimeline(
      "initial",
      [
        {
          body: "&lt;dev&gt;:\n@product-manager FYI\n<!-- agent-moebius:stage=code-verified -->\n\n<!-- agent-moebius:role=dev -->",
        },
      ],
      agents,
    );

    expect(resolveTrigger({ timeline, availableAgentNames: agents })).toEqual({
      kind: "run-agent",
      role: "product-manager",
      reason: "mention",
    });
  });

  it("ignores unsupported stages when there is no mention", () => {
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
});
