import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCeoScripts, parseCeoScriptMarkdown } from "../src/ceo-scripts.js";

describe("CEO script library", () => {
  it("loads the required script files as data", async () => {
    const scripts = await loadCeoScripts({ agentsDir: path.resolve("agents"), required: true });

    expect(scripts.map((script) => script.id).sort()).toEqual([
      "default-plan-chain",
      "goal-intake",
      "integration-acceptance",
      "integration-repair-child-issues",
      "milestone-spawn-child-issues",
      "plan-review",
      "post-implementation-retro",
      "roundtable-plan-review",
    ]);
    expect(scripts.find((script) => script.id === "default-plan-chain")).toMatchObject({ action: "route" });
    expect(scripts.find((script) => script.id === "goal-intake")).toMatchObject({ action: "goal_intake" });
    expect(scripts.find((script) => script.id === "integration-acceptance")).toMatchObject({ action: "route" });
    expect(scripts.find((script) => script.id === "integration-repair-child-issues")).toMatchObject({
      action: "spawn_child_issues",
    });
    expect(scripts.find((script) => script.id === "milestone-spawn-child-issues")).toMatchObject({
      action: "spawn_child_issues",
    });
    expect(scripts.find((script) => script.id === "plan-review")).toMatchObject({ action: "route" });
    expect(scripts.find((script) => script.id === "post-implementation-retro")).toMatchObject({ action: "route" });
    expect(scripts.find((script) => script.id === "roundtable-plan-review")).toMatchObject({ action: "roundtable" });
  });

  it("rejects missing required workflows when scripts are required", async () => {
    const agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "moebius-ceo-scripts-"));
    await fs.mkdir(path.join(agentsDir, "ceo-scripts"));
    await fs.writeFile(
      path.join(agentsDir, "ceo-scripts", "plan-review.md"),
      `---
id: plan-review
action: route
---

@qa review`,
      "utf8",
    );

    await expect(loadCeoScripts({ agentsDir, required: true })).rejects.toThrow(/missing workflow/);
  });

  it("rejects duplicate workflow ids", async () => {
    const agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "moebius-ceo-scripts-"));
    await fs.mkdir(path.join(agentsDir, "ceo-scripts"));
    const script = `---
id: plan-review
action: route
---

body`;
    await fs.writeFile(path.join(agentsDir, "ceo-scripts", "a.md"), script, "utf8");
    await fs.writeFile(path.join(agentsDir, "ceo-scripts", "b.md"), script, "utf8");

    await expect(loadCeoScripts({ agentsDir, required: false })).rejects.toThrow(/duplicate workflow id/);
  });

  it("parses script frontmatter and rejects empty bodies", () => {
    expect(
      parseCeoScriptMarkdown(`---
id: milestone-spawn-child-issues
action: spawn_child_issues
title: Spawn
---

template body`),
    ).toMatchObject({
      id: "milestone-spawn-child-issues",
      action: "spawn_child_issues",
      title: "Spawn",
      body: "template body",
    });

    expect(
      parseCeoScriptMarkdown(`---
id: roundtable-plan-review
action: roundtable
---

roundtable body`),
    ).toMatchObject({
      id: "roundtable-plan-review",
      action: "roundtable",
      body: "roundtable body",
    });

    expect(() =>
      parseCeoScriptMarkdown(`---
id: x
action: route
---
`),
    ).toThrow(/invalid id|empty body/);
  });
});
