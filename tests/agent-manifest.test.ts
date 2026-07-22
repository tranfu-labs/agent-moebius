import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseAgentManifest, validatePreScriptPath } from "../src/agent-manifest.js";

describe("agent manifest", () => {
  it("parses canonical pre_script frontmatter and keeps markdown body", () => {
    expect(
      parseAgentManifest(`---
pre_script: src/agent-prescripts/dev-workspace.ts
---

# Dev

body`),
    ).toEqual({
      preScript: "src/agent-prescripts/dev-workspace.ts",
      workspaceAccess: null,
      body: "# Dev\n\nbody",
    });
  });

  it("treats markdown without frontmatter as persona body only", () => {
    expect(parseAgentManifest("# PM\n\nbody")).toEqual({
      preScript: null,
      workspaceAccess: null,
      body: "# PM\n\nbody",
    });
  });

  it("parses canonical workspace access frontmatter", () => {
    expect(
      parseAgentManifest(`---
workspace_access: read-run
---

# QA`),
    ).toEqual({
      preScript: null,
      workspaceAccess: "read-run",
      body: "# QA",
    });
  });

  it("keeps legacy camelCase aliases readable", () => {
    expect(parseAgentManifest(`---
preScript: src/agent-prescripts/dev-workspace.ts
workspaceAccess: read-run
---
# Legacy`)).toMatchObject({
      preScript: "src/agent-prescripts/dev-workspace.ts",
      workspaceAccess: "read-run",
    });
  });

  it("rejects conflicting canonical and legacy aliases", () => {
    expect(() => parseAgentManifest(`---
workspace_access: write
workspaceAccess: read-run
---
# Conflict`)).toThrow(/Conflicting Agent frontmatter fields: workspace_access and workspaceAccess/);
  });

  it("rejects invalid workspace access values", () => {
    expect(() =>
      parseAgentManifest(`---
workspace_access: ../../evil.ts
---

# Bad`),
    ).toThrow(/Invalid agent workspace_access value/);
  });

  it("rejects preScript paths outside the trusted directory", () => {
    expect(() => validatePreScriptPath("../scripts/run.ts")).toThrow(/Invalid agent pre_script path/);
    expect(() => validatePreScriptPath("/tmp/run.ts")).toThrow(/Invalid agent pre_script path/);
    expect(() => validatePreScriptPath("src/agent-prescripts/../../evil.ts")).toThrow(
      /Invalid agent pre_script path/,
    );
    expect(() => validatePreScriptPath("src/not-prescripts/run.ts")).toThrow(/Invalid agent pre_script path/);
  });

  it("keeps issue workspace access limited to the first enabled roles", async () => {
    await expect(readAgentWorkspaceAccess("dev")).resolves.toBe("write");
    await expect(readAgentWorkspaceAccess("qa")).resolves.toBe("read-run");
    await expect(readAgentWorkspaceAccess("product-manager")).resolves.toBe("read-run");
    await expect(readAgentWorkspaceAccess("hermes-user")).resolves.toBe("read-run");
    await expect(readAgentWorkspaceAccess("dev-manager")).resolves.toBe(null);
    await expect(readAgentWorkspaceAccess("ceo")).resolves.toBe(null);
    await expect(readAgentWorkspaceAccess("secretary")).resolves.toBe(null);
  });
});

async function readAgentWorkspaceAccess(agent: string): Promise<string | null> {
  return parseAgentManifest(await fs.readFile(`agents/${agent}.md`, "utf8")).workspaceAccess;
}
