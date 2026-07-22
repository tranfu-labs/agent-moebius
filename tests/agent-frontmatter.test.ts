import { describe, expect, it } from "vitest";

import {
  parseAgentMarkdownFrontmatter,
  serializeAgentMarkdownFrontmatter,
} from "../src/agent-frontmatter.js";

describe("Agent Markdown frontmatter", () => {
  it("parses a YAML mapping and preserves the persona body", () => {
    expect(parseAgentMarkdownFrontmatter(`---
display_name: "开发经理"
description: "负责技术决策：架构与质量"
workspace_access: write # trusted capability
---

# 角色

正文`)).toEqual({
      frontmatter: {
        display_name: "开发经理",
        description: "负责技术决策：架构与质量",
        workspace_access: "write",
      },
      body: "# 角色\n\n正文",
    });
  });

  it("treats Markdown without frontmatter as persona body", () => {
    expect(parseAgentMarkdownFrontmatter("# QA\n\nbody")).toEqual({
      frontmatter: null,
      body: "# QA\n\nbody",
    });
  });

  it("accepts an empty frontmatter mapping", () => {
    expect(parseAgentMarkdownFrontmatter("---\n---\n\n# 角色\n")).toEqual({
      frontmatter: {},
      body: "# 角色\n",
    });
  });

  it("serializes canonical metadata separately from the persona body", () => {
    expect(serializeAgentMarkdownFrontmatter(
      { display_name: "开发经理", description: "负责技术决策" },
      "# 角色\n\n正文\n",
    )).toBe(`---
display_name: 开发经理
description: 负责技术决策
---

# 角色

正文
`);
  });

  it("rejects invalid YAML and non-mapping frontmatter", () => {
    expect(() => parseAgentMarkdownFrontmatter("---\nname: [\n---\n# Bad")).toThrow(/Invalid Agent frontmatter YAML/);
    expect(() => parseAgentMarkdownFrontmatter("---\nname: dev\n# Missing close")).toThrow(
      /missing closing delimiter/,
    );
    expect(() => parseAgentMarkdownFrontmatter("---\n- one\n- two\n---\n# Bad")).toThrow(
      /frontmatter must be a YAML mapping/,
    );
  });
});
