import { parse, stringify } from "yaml";

export interface ParsedAgentMarkdown {
  frontmatter: Record<string, unknown> | null;
  body: string;
}

export function parseAgentMarkdownFrontmatter(markdown: string): ParsedAgentMarkdown {
  const normalized = markdown.replace(/^\uFEFF/u, "");
  const match = normalized.match(
    /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)([\s\S]*)$/mu,
  );
  if (match === null) {
    if (/^---\r?\n/u.test(normalized)) {
      throw new AgentFrontmatterError("Invalid Agent frontmatter: missing closing delimiter");
    }
    return { frontmatter: null, body: normalized };
  }

  const source = (match[1] ?? "").replace(/\r?\n$/u, "");
  const body = (match[2] ?? "").replace(/^\r?\n/u, "");
  let parsed: unknown;
  try {
    parsed = parse(source, { uniqueKeys: true });
  } catch (error) {
    throw new AgentFrontmatterError(`Invalid Agent frontmatter YAML: ${formatError(error)}`);
  }

  if (parsed === null) {
    return { frontmatter: {}, body };
  }
  if (!isPlainObject(parsed)) {
    throw new AgentFrontmatterError("Agent frontmatter must be a YAML mapping");
  }
  return { frontmatter: parsed, body };
}

export function serializeAgentMarkdownFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const yaml = stringify(frontmatter).trimEnd();
  return `---\n${yaml}\n---\n\n${body.replace(/^\r?\n/u, "")}`;
}

export class AgentFrontmatterError extends Error {
  readonly code = "AGENT_FRONTMATTER_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "AgentFrontmatterError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
