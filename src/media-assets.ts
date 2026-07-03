import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ISSUE_MEDIA_IMAGE_MAX_BYTES,
  ISSUE_MEDIA_VIDEO_MAX_BYTES,
  OUTPUT_ARTIFACT_IMAGE_MAX_BYTES,
  OUTPUT_ARTIFACT_VIDEO_MAX_BYTES,
} from "./config.js";
import type { IssueMediaKind, IssueMediaReference, MediaPromptEntry } from "./issue-media.js";

export interface PreparedIssueMedia extends MediaPromptEntry {
  reference: IssueMediaReference;
}

export interface MediaPreparationFailure {
  reference: IssueMediaReference;
  reason: string;
}

export type MediaPreparationResult =
  | {
      ok: true;
      prepared: PreparedIssueMedia[];
      imagePaths: string[];
    }
  | {
      ok: false;
      failures: MediaPreparationFailure[];
    };

export interface PreparedOutputArtifact {
  filePath: string;
  assetName: string;
  displayName: string;
  kind: IssueMediaKind;
  byteLength: number;
}

export interface PublishedArtifact {
  displayName: string;
  kind: IssueMediaKind;
  url: string;
}

export interface ArtifactPublisherInput {
  files: PreparedOutputArtifact[];
}

export interface MediaLimits {
  imageMaxBytes: number;
  videoMaxBytes: number;
}

const DEFAULT_INPUT_LIMITS: MediaLimits = {
  imageMaxBytes: ISSUE_MEDIA_IMAGE_MAX_BYTES,
  videoMaxBytes: ISSUE_MEDIA_VIDEO_MAX_BYTES,
};

const DEFAULT_OUTPUT_LIMITS: MediaLimits = {
  imageMaxBytes: OUTPUT_ARTIFACT_IMAGE_MAX_BYTES,
  videoMaxBytes: OUTPUT_ARTIFACT_VIDEO_MAX_BYTES,
};

const EXTENSION_BY_CONTENT_TYPE = new Map<string, string>([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["image/avif", ".avif"],
  ["image/svg+xml", ".svg"],
  ["video/mp4", ".mp4"],
  ["video/quicktime", ".mov"],
  ["video/webm", ".webm"],
  ["video/x-m4v", ".m4v"],
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);
const EXCLUDED_OUTPUT_DIRS = new Set([".git", ".state", "node_modules", "dist", "coverage"]);

export async function prepareIssueMedia(input: {
  references: IssueMediaReference[];
  runDir: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  limits?: MediaLimits;
}): Promise<MediaPreparationResult> {
  if (input.references.length === 0) {
    return { ok: true, prepared: [], imagePaths: [] };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const limits = input.limits ?? DEFAULT_INPUT_LIMITS;
  const outputDir = path.join(input.runDir, "input-media");
  await fs.mkdir(outputDir, { recursive: true });

  const prepared: PreparedIssueMedia[] = [];
  const failures: MediaPreparationFailure[] = [];

  for (const reference of input.references) {
    try {
      const response = await fetchImpl(reference.url, { signal: input.signal });
      if (!response.ok) {
        failures.push({ reference, reason: `download-failed:http-${String(response.status)}` });
        continue;
      }

      const contentType = normalizeContentType(response.headers.get("content-type"));
      const byteLengthHeader = parseContentLength(response.headers.get("content-length"));
      const kind = detectMediaKind({ reference, contentType });
      if (kind === null) {
        failures.push({ reference, reason: `unsupported-content-type:${contentType || "missing"}` });
        continue;
      }

      const maxBytes = maxBytesForKind(kind, limits);
      if (byteLengthHeader !== null && byteLengthHeader > maxBytes) {
        failures.push({ reference, reason: `too-large:${String(byteLengthHeader)}>${String(maxBytes)}` });
        continue;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) {
        failures.push({ reference, reason: `too-large:${String(bytes.byteLength)}>${String(maxBytes)}` });
        continue;
      }

      const extension = extensionForMedia({ contentType, url: reference.url, kind });
      const fileName = `${String(reference.messageIndex).padStart(4, "0")}-${String(reference.ordinalInMessage).padStart(2, "0")}-${kind}${extension}`;
      const filePath = path.join(outputDir, fileName);
      await fs.writeFile(filePath, bytes);
      prepared.push({
        reference,
        messageIndex: reference.messageIndex,
        kind,
        filePath,
        originalUrl: reference.url,
        label: reference.label,
        contentType: contentType || `${kind}/unknown`,
        byteLength: bytes.byteLength,
      });
    } catch (error) {
      failures.push({ reference, reason: `download-error:${formatErrorMessage(error)}` });
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  return {
    ok: true,
    prepared,
    imagePaths: prepared.filter((media) => media.kind === "image").map((media) => media.filePath),
  };
}

export async function discoverOutputArtifacts(input: {
  cwd: string | undefined;
  runDir: string;
  finalText: string;
  startedAtMs: number;
  limits?: MediaLimits;
}): Promise<PreparedOutputArtifact[]> {
  if (input.cwd === undefined) {
    return [];
  }

  const cwd = path.resolve(input.cwd);
  const runDir = path.resolve(input.runDir);
  const limits = input.limits ?? DEFAULT_OUTPUT_LIMITS;
  const candidates = new Map<string, string>();

  for (const referencedPath of extractMediaPathsFromText(input.finalText)) {
    const resolved = resolveCandidatePath(cwd, referencedPath);
    if (resolved !== null) {
      candidates.set(resolved, path.basename(referencedPath));
    }
  }

  for (const scanned of await scanRecentMediaFiles(cwd, input.startedAtMs, runDir)) {
    candidates.set(scanned, path.basename(scanned));
  }

  const outputDir = path.join(input.runDir, "output-artifacts");
  await fs.mkdir(outputDir, { recursive: true });
  const artifacts: PreparedOutputArtifact[] = [];

  for (const [candidatePath, displayHint] of candidates.entries()) {
    const kind = classifyPath(candidatePath);
    if (kind === null || !isSubpath(candidatePath, cwd)) {
      continue;
    }

    const stat = await safeStat(candidatePath);
    if (stat === null || !stat.isFile()) {
      continue;
    }

    if (stat.size > maxBytesForKind(kind, limits)) {
      continue;
    }

    const assetName = buildAssetName(candidatePath, artifacts.length);
    const stagedPath = path.join(outputDir, assetName);
    await fs.copyFile(candidatePath, stagedPath);
    artifacts.push({
      filePath: stagedPath,
      assetName,
      displayName: displayHint || path.basename(candidatePath),
      kind,
      byteLength: stat.size,
    });
  }

  return artifacts;
}

export function formatMediaPreparationFailure(failures: MediaPreparationFailure[]): string {
  return `${formatFailureList("无法准备媒体输入：", failures.map((failure) => ({
    reference: failure.reference,
    reason: failure.reason,
  })))}

<!-- agent-moebius:stage=in-progress -->`;
}

export function formatArtifactPublishingFailure(error: unknown): string {
  return `无法发布生成产物：
- ${formatErrorMessage(error)}

<!-- agent-moebius:stage=in-progress -->`;
}

export function formatPublishedArtifactsMarkdown(artifacts: PublishedArtifact[]): string {
  if (artifacts.length === 0) {
    return "";
  }

  return `### 生成产物

${artifacts.map(formatPublishedArtifact).join("\n")}`;
}

function formatPublishedArtifact(artifact: PublishedArtifact): string {
  if (artifact.kind === "image") {
    return `![${escapeMarkdownLabel(artifact.displayName)}](${artifact.url})`;
  }

  return `[${escapeMarkdownLabel(artifact.displayName)}](${artifact.url})`;
}

function formatFailureList(title: string, failures: Array<{ reference: IssueMediaReference; reason: string }>): string {
  return `${title}
${failures
  .map(
    (failure) =>
      `- #${String(failure.reference.messageIndex)} ${failure.reference.kind}[${String(
        failure.reference.ordinalInMessage,
      )}] ${failure.reference.url}: ${failure.reason}`,
  )
  .join("\n")}`;
}

function detectMediaKind(input: { reference: IssueMediaReference; contentType: string }): IssueMediaKind | null {
  if (input.contentType.startsWith("image/")) {
    return "image";
  }

  if (input.contentType.startsWith("video/")) {
    return "video";
  }

  if (input.reference.kind !== "unknown") {
    return input.reference.kind;
  }

  return classifyPath(new URL(input.reference.url).pathname);
}

function extensionForMedia(input: { contentType: string; url: string; kind: IssueMediaKind }): string {
  const contentTypeExtension = EXTENSION_BY_CONTENT_TYPE.get(input.contentType);
  if (contentTypeExtension !== undefined) {
    return contentTypeExtension;
  }

  const pathnameExtension = path.extname(new URL(input.url).pathname).toLowerCase();
  if (input.kind === "image" && IMAGE_EXTENSIONS.has(pathnameExtension)) {
    return pathnameExtension;
  }

  if (input.kind === "video" && VIDEO_EXTENSIONS.has(pathnameExtension)) {
    return pathnameExtension;
  }

  return input.kind === "image" ? ".png" : ".mp4";
}

function normalizeContentType(contentType: string | null): string {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function parseContentLength(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function maxBytesForKind(kind: IssueMediaKind, limits: MediaLimits): number {
  return kind === "image" ? limits.imageMaxBytes : limits.videoMaxBytes;
}

function extractMediaPathsFromText(text: string): string[] {
  const paths: string[] = [];
  const pattern = /(?:^|[\s('"`])((?:\.{1,2}\/|\/)?[A-Za-z0-9_.\-/ ]+\.(?:svg|png|jpe?g|gif|webp|avif|mp4|mov|m4v|webm))(?:$|[\s)'"`,])/gi;
  for (const match of text.matchAll(pattern)) {
    const value = match[1]?.trim();
    if (value !== undefined && value !== "") {
      paths.push(value);
    }
  }

  return paths;
}

async function scanRecentMediaFiles(root: string, startedAtMs: number, runDir: string): Promise<string[]> {
  const found: string[] = [];
  await walk(root, async (filePath, directoryEntry) => {
    if (directoryEntry.isDirectory()) {
      return;
    }

    if (classifyPath(filePath) === null) {
      return;
    }

    const stat = await safeStat(filePath);
    if (stat !== null && stat.mtimeMs >= startedAtMs - 1_000 && !isSubpath(filePath, runDir)) {
      found.push(filePath);
    }
  });

  return found;
}

async function walk(root: string, visitor: (filePath: string, directoryEntry: { isDirectory(): boolean }) => Promise<void>): Promise<void> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".agent-moebius") {
      if (entry.name !== ".state") {
        continue;
      }
    }

    if (EXCLUDED_OUTPUT_DIRS.has(entry.name)) {
      continue;
    }

    const filePath = path.join(root, entry.name);
    await visitor(filePath, entry);
    if (entry.isDirectory()) {
      await walk(filePath, visitor);
    }
  }
}

function resolveCandidatePath(cwd: string, candidatePath: string): string | null {
  const resolved = path.resolve(cwd, candidatePath);
  return isSubpath(resolved, cwd) ? resolved : null;
}

function classifyPath(filePath: string): IssueMediaKind | null {
  const extension = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  return null;
}

interface FileStat {
  isFile(): boolean;
  size: number;
  mtimeMs: number;
}

async function safeStat(filePath: string): Promise<FileStat | null> {
  try {
    const stat = await fs.stat(filePath);
    return {
      isFile: () => stat.isFile(),
      size: Number(stat.size),
      mtimeMs: Number(stat.mtimeMs),
    };
  } catch {
    return null;
  }
}

function buildAssetName(filePath: string, index: number): string {
  const extension = path.extname(filePath).toLowerCase();
  const baseName = sanitizeAssetName(path.basename(filePath, extension)) || "artifact";
  const hash = crypto.createHash("sha256").update(`${filePath}:${String(index)}`).digest("hex").slice(0, 10);
  return `${baseName}-${hash}${extension}`;
}

function sanitizeAssetName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isSubpath(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/[[\]\\]/g, "\\$&");
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
