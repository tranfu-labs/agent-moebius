import path from "node:path";

export interface AgentManifest {
  body: string;
  preScript: string | null;
}

export function parseAgentManifest(markdown: string): AgentManifest {
  const parsed = splitFrontmatter(markdown);
  if (parsed === null) {
    return {
      body: markdown,
      preScript: null,
    };
  }

  return {
    body: parsed.body,
    preScript: parsePreScript(parsed.frontmatter),
  };
}

function splitFrontmatter(markdown: string): { frontmatter: string; body: string } | null {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (match === null) {
    return null;
  }

  const frontmatter = match[1];
  const body = match[2];
  if (frontmatter === undefined || body === undefined) {
    return null;
  }

  return { frontmatter, body: body.replace(/^\r?\n/, "") };
}

function parsePreScript(frontmatter: string): string | null {
  for (const line of frontmatter.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^preScript:\s*(.+)$/);
    if (match === null) {
      continue;
    }

    const value = match[1]?.trim().replace(/^['"]|['"]$/g, "");
    if (value === undefined || value === "") {
      throw new Error("Agent preScript frontmatter must be a non-empty path");
    }

    return validatePreScriptPath(value);
  }

  return null;
}

export function validatePreScriptPath(value: string): string {
  if (value.includes("\\")) {
    throw new Error(`Invalid agent preScript path: ${value}`);
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
    throw new Error(`Invalid agent preScript path: ${value}`);
  }

  return normalized;
}
