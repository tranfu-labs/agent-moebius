import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseAgentManifest, validatePreScriptPath } from "../src/agent-manifest.js";

describe("agent manifest", () => {
  it("parses trusted preScript frontmatter and keeps markdown body", () => {
    expect(
      parseAgentManifest(`---
preScript: src/agent-prescripts/dev-workspace.ts
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

  it("parses workspace access frontmatter", () => {
    expect(
      parseAgentManifest(`---
workspaceAccess: read-run
---

# QA`),
    ).toEqual({
      preScript: null,
      workspaceAccess: "read-run",
      body: "# QA",
    });
  });

  it("rejects invalid workspace access values", () => {
    expect(() =>
      parseAgentManifest(`---
workspaceAccess: ../../evil.ts
---

# Bad`),
    ).toThrow(/Invalid agent workspaceAccess value/);
  });

  it("rejects preScript paths outside the trusted directory", () => {
    expect(() => validatePreScriptPath("../scripts/run.ts")).toThrow(/Invalid agent preScript path/);
    expect(() => validatePreScriptPath("/tmp/run.ts")).toThrow(/Invalid agent preScript path/);
    expect(() => validatePreScriptPath("src/agent-prescripts/../../evil.ts")).toThrow(
      /Invalid agent preScript path/,
    );
    expect(() => validatePreScriptPath("src/not-prescripts/run.ts")).toThrow(/Invalid agent preScript path/);
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
