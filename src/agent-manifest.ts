import path from "node:path";

import { parseAgentMarkdownFrontmatter } from "./agent-frontmatter.js";

export interface AgentManifest {
  body: string;
  preScript: string | null;
  workspaceAccess: WorkspaceAccess | null;
}

export type WorkspaceAccess = "write" | "read-run";

export function parseAgentManifest(markdown: string): AgentManifest {
  const parsed = parseAgentMarkdownFrontmatter(markdown);

  return {
    body: parsed.body,
    preScript: parsePreScript(parsed.frontmatter),
    workspaceAccess: parseWorkspaceAccess(parsed.frontmatter),
  };
}

function parsePreScript(frontmatter: Record<string, unknown> | null): string | null {
  if (frontmatter === null) {
    return null;
  }
  const value = readAliasedField(frontmatter, "pre_script", "preScript");
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Agent pre_script frontmatter must be a non-empty path");
  }
  return validatePreScriptPath(value.trim());
}

function parseWorkspaceAccess(frontmatter: Record<string, unknown> | null): WorkspaceAccess | null {
  if (frontmatter === null) {
    return null;
  }
  const value = readAliasedField(frontmatter, "workspace_access", "workspaceAccess");
  if (value === undefined) {
    return null;
  }
  if (value === "write" || value === "read-run") {
    return value;
  }
  throw new Error(`Invalid agent workspace_access value: ${String(value)}`);
}

function readAliasedField(
  frontmatter: Record<string, unknown>,
  canonicalKey: string,
  legacyKey: string,
): unknown {
  const canonical = frontmatter[canonicalKey];
  const legacy = frontmatter[legacyKey];
  if (canonical !== undefined && legacy !== undefined && canonical !== legacy) {
    throw new Error(`Conflicting Agent frontmatter fields: ${canonicalKey} and ${legacyKey}`);
  }
  return canonical ?? legacy;
}

export function validatePreScriptPath(value: string): string {
  if (value.includes("\\")) {
    throw new Error(`Invalid agent pre_script path: ${value}`);
  }

  const normalized = path.posix.normalize(value);
  if (
    path.posix.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    !normalized.startsWith("src/agent-prescripts/") ||
    !normalized.endsWith(".ts")
  ) {
    throw new Error(`Invalid agent pre_script path: ${value}`);
  }

  return normalized;
}
