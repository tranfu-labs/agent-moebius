import type { TimelineMessage, TimelineSource } from "./conversation.js";

export type IssueMediaKind = "image" | "video";
export type IssueMediaKindHint = IssueMediaKind | "unknown";

export interface IssueMediaReference {
  messageIndex: number;
  source: TimelineSource;
  kind: IssueMediaKindHint;
  url: string;
  label: string | null;
  ordinalInMessage: number;
  syntax: "markdown-image" | "markdown-link" | "html" | "bare-url";
}

export interface MediaPromptEntry {
  messageIndex: number;
  kind: IssueMediaKind;
  filePath: string;
  originalUrl: string;
  label: string | null;
  contentType: string;
  byteLength: number;
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);

// Codex CLI 的 --image 不接受 SVG（vector 无法直接送模型），且 runner 曾在 20 张 SVG
// 的时间线上触发 `codex-failed exit-code-1` 死锁 issue（见 #38 / #39）。
// 这里按 URL 后缀显式过滤掉 SVG 引用，避免它们进入媒体准备。
const SKIP_MEDIA_EXTENSIONS = new Set([".svg"]);

function isSkippedMediaUrl(rawUrl: string): boolean {
  const parsed = parseUrl(rawUrl);
  if (parsed === null) {
    return false;
  }
  const pathname = parsed.pathname.toLowerCase();
  for (const extension of SKIP_MEDIA_EXTENSIONS) {
    if (pathname.endsWith(extension)) {
      return true;
    }
  }
  return false;
}

export function extractIssueMediaReferences(messages: TimelineMessage[]): IssueMediaReference[] {
  return messages.flatMap((message) => extractMediaReferencesFromMessage(message));
}

export function extractMediaReferencesFromMessage(message: TimelineMessage): IssueMediaReference[] {
  const references: IssueMediaReference[] = [];
  const seenUrls = new Set<string>();

  const addReference = (
    kind: IssueMediaKindHint,
    rawUrl: string,
    label: string | null,
    syntax: IssueMediaReference["syntax"],
  ) => {
    const normalizedUrl = normalizeHttpUrl(rawUrl);
    if (normalizedUrl === null || seenUrls.has(normalizedUrl)) {
      return;
    }
    if (isSkippedMediaUrl(normalizedUrl)) {
      return;
    }

    seenUrls.add(normalizedUrl);
    references.push({
      messageIndex: message.index,
      source: message.source,
      kind,
      url: normalizedUrl,
      label: normalizeLabel(label),
      ordinalInMessage: references.length + 1,
      syntax,
    });
  };

  for (const match of message.body.matchAll(/!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    addReference("image", unwrapMarkdownUrl(match[2] ?? ""), match[1] ?? null, "markdown-image");
  }

  for (const match of message.body.matchAll(/(^|[^!])\[([^\]]+)\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    const rawUrl = unwrapMarkdownUrl(match[3] ?? "");
    const kind = classifyUrlByExtension(rawUrl);
    if (kind !== null || isGitHubUserAttachmentUrl(rawUrl)) {
      addReference(kind ?? "unknown", rawUrl, match[2] ?? null, "markdown-link");
    }
  }

  for (const match of message.body.matchAll(/<(img|video|source)\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi)) {
    const tag = (match[1] ?? "").toLowerCase();
    const rawUrl = match[2] ?? match[3] ?? match[4] ?? "";
    const kind = tag === "img" ? "image" : classifyUrlByExtension(rawUrl) ?? "video";
    addReference(kind, rawUrl, null, "html");
  }

  for (const match of message.body.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    const rawUrl = trimUrlPunctuation(match[0] ?? "");
    const kind = classifyUrlByExtension(rawUrl);
    if (kind !== null || isGitHubUserAttachmentUrl(rawUrl)) {
      addReference(kind ?? "unknown", rawUrl, null, "bare-url");
    }
  }

  return references;
}

export function appendMediaManifest(prompt: string, entries: MediaPromptEntry[]): string {
  if (entries.length === 0) {
    return prompt;
  }

  return `${prompt.trimEnd()}

本轮可用媒体文件：
${formatMediaPromptEntries(entries)}`;
}

export function formatMediaPromptEntries(entries: MediaPromptEntry[]): string {
  return entries
    .map((entry, index) => {
      const label = entry.label === null ? "" : ` label=${JSON.stringify(entry.label)}`;
      return [
        `- media[${index + 1}]`,
        `message=#${entry.messageIndex}`,
        `kind=${entry.kind}`,
        `path=${entry.filePath}`,
        `contentType=${entry.contentType}`,
        `bytes=${entry.byteLength}`,
        `url=${entry.originalUrl}`,
        label,
      ]
        .filter((part) => part !== "")
        .join(" ");
    })
    .join("\n");
}

export function classifyUrlByExtension(rawUrl: string): IssueMediaKind | null {
  const parsed = parseUrl(rawUrl);
  if (parsed === null) {
    return null;
  }

  const pathname = parsed.pathname.toLowerCase();
  for (const extension of IMAGE_EXTENSIONS) {
    if (pathname.endsWith(extension)) {
      return "image";
    }
  }

  for (const extension of VIDEO_EXTENSIONS) {
    if (pathname.endsWith(extension)) {
      return "video";
    }
  }

  return null;
}

function normalizeHttpUrl(rawUrl: string): string | null {
  const parsed = parseUrl(unwrapMarkdownUrl(trimUrlPunctuation(rawUrl)));
  if (parsed === null || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    return null;
  }

  return parsed.toString();
}

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(unwrapMarkdownUrl(rawUrl));
  } catch {
    return null;
  }
}

function isGitHubUserAttachmentUrl(rawUrl: string): boolean {
  const parsed = parseUrl(rawUrl);
  if (parsed === null) {
    return false;
  }

  if (parsed.hostname === "github.com" && parsed.pathname.startsWith("/user-attachments/assets/")) {
    return true;
  }

  return (
    parsed.hostname === "user-images.githubusercontent.com" ||
    parsed.hostname === "private-user-images.githubusercontent.com"
  );
}

function unwrapMarkdownUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function trimUrlPunctuation(rawUrl: string): string {
  return rawUrl.replace(/[),.;:!?]+$/g, "");
}

function normalizeLabel(label: string | null): string | null {
  const normalized = label?.trim();
  return normalized === undefined || normalized === "" ? null : normalized;
}
