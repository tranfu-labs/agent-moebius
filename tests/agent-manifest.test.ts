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
      body: "# Dev\n\nbody",
    });
  });

  it("treats markdown without frontmatter as persona body only", () => {
    expect(parseAgentManifest("# PM\n\nbody")).toEqual({
      preScript: null,
      body: "# PM\n\nbody",
    });
  });

  it("rejects preScript paths outside the trusted directory", () => {
    expect(() => validatePreScriptPath("../scripts/run.ts")).toThrow(/Invalid agent preScript path/);
    expect(() => validatePreScriptPath("/tmp/run.ts")).toThrow(/Invalid agent preScript path/);
    expect(() => validatePreScriptPath("src/agent-prescripts/../../evil.ts")).toThrow(
      /Invalid agent preScript path/,
    );
    expect(() => validatePreScriptPath("src/not-prescripts/run.ts")).toThrow(/Invalid agent preScript path/);
  });
});
