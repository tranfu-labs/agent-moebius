import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ISSUE_MEDIA_IMAGE_MAX_BYTES,
  ISSUE_MEDIA_VIDEO_MAX_BYTES,
  OUTPUT_ARTIFACT_IMAGE_MAX_BYTES,
  OUTPUT_ARTIFACT_VIDEO_MAX_BYTES,
} from "./config.js";
import { downloadReleaseAsset, parseGitHubReleaseAssetUrl } from "./github.js";
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
export async function prepareIssueMedia(input: {
  references: IssueMediaReference[];
  runDir: string;
  fetchImpl?: typeof fetch;
  downloadReleaseAssetImpl?: typeof downloadReleaseAsset;
  signal?: AbortSignal;
  limits?: MediaLimits;
}): Promise<MediaPreparationResult> {
  if (input.references.length === 0) {
    return { ok: true, prepared: [], imagePaths: [] };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const downloadReleaseAssetImpl = input.downloadReleaseAssetImpl ?? downloadReleaseAsset;
  const limits = input.limits ?? DEFAULT_INPUT_LIMITS;
  const outputDir = path.join(input.runDir, "input-media");
  await fs.mkdir(outputDir, { recursive: true });

  const prepared: PreparedIssueMedia[] = [];
  const failures: MediaPreparationFailure[] = [];

  for (const reference of input.references) {
    try {
      // github.com 的 release 资产在私有仓库下匿名 HTTP 下载必然 404，改走带认证的 gh CLI；
      // 非 github.com release 资产的 URL 保持原有 fetch 逻辑。
      const releaseAsset = parseGitHubReleaseAssetUrl(reference.url);
      if (releaseAsset !== null) {
        const outcome = await prepareGitHubReleaseAsset({
          reference,
          releaseAsset,
          outputDir,
          limits,
          downloadReleaseAssetImpl,
          signal: input.signal,
        });
        if (outcome.ok) {
          prepared.push(outcome.media);
        } else {
          failures.push(outcome.failure);
        }
        continue;
      }

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
      const filePath = buildInputMediaFilePath({ outputDir, reference, kind, extension });
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

async function prepareGitHubReleaseAsset(input: {
  reference: IssueMediaReference;
  releaseAsset: NonNullable<ReturnType<typeof parseGitHubReleaseAssetUrl>>;
  outputDir: string;
  limits: MediaLimits;
  downloadReleaseAssetImpl: typeof downloadReleaseAsset;
  signal?: AbortSignal;
}): Promise<{ ok: true; media: PreparedIssueMedia } | { ok: false; failure: MediaPreparationFailure }> {
  const { reference, releaseAsset, limits } = input;
  // gh CLI 直接落盘，拿不到 content-type 响应头，媒体类型只能靠引用标注或 URL 扩展名判断。
  const kind = detectMediaKind({ reference, contentType: "" });
  if (kind === null) {
    return { ok: false, failure: { reference, reason: "unsupported-content-type:missing" } };
  }

  const extension = extensionForMedia({ contentType: "", url: reference.url, kind });
  const filePath = buildInputMediaFilePath({ outputDir: input.outputDir, reference, kind, extension });
  await input.downloadReleaseAssetImpl(releaseAsset, filePath, { signal: input.signal });

  const stat = await fs.stat(filePath);
  const byteLength = Number(stat.size);
  const maxBytes = maxBytesForKind(kind, limits);
  if (byteLength > maxBytes) {
    await fs.rm(filePath, { force: true });
    return { ok: false, failure: { reference, reason: `too-large:${String(byteLength)}>${String(maxBytes)}` } };
  }

  return {
    ok: true,
    media: {
      reference,
      messageIndex: reference.messageIndex,
      kind,
      filePath,
      originalUrl: reference.url,
      label: reference.label,
      contentType: `${kind}/unknown`,
      byteLength,
    },
  };
}

function buildInputMediaFilePath(input: {
  outputDir: string;
  reference: IssueMediaReference;
  kind: IssueMediaKind;
  extension: string;
}): string {
  const fileName = `${String(input.reference.messageIndex).padStart(4, "0")}-${String(
    input.reference.ordinalInMessage,
  ).padStart(2, "0")}-${input.kind}${input.extension}`;
  return path.join(input.outputDir, fileName);
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
  const limits = input.limits ?? DEFAULT_OUTPUT_LIMITS;
  const candidates = new Map<string, string>();

  for (const referencedPath of extractMediaPathsFromText(input.finalText)) {
    const resolved = resolveCandidatePath(cwd, referencedPath);
    if (resolved !== null) {
      candidates.set(resolved, path.basename(referencedPath));
    }
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

<!-- moebius:stage=in-progress -->`;
}

export function formatArtifactPublishingFailure(error: unknown): string {
  return `无法发布生成产物：
- ${formatErrorMessage(error)}

<!-- moebius:stage=in-progress -->`;
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
  const pattern = /(?:^|[\s('"`:：])((?:\.{1,2}\/|\/)?[A-Za-z0-9_.\-/ ]+\.(?:svg|png|jpe?g|gif|webp|avif|mp4|mov|m4v|webm))(?:$|[\s)'"`,])/gi;
  for (const match of text.matchAll(pattern)) {
    const value = match[1]?.trim();
    if (value !== undefined && value !== "") {
      paths.push(value);
    }
  }

  return paths;
}

function resolveCandidatePath(cwd: string, candidatePath: string): string | null {
  if (path.isAbsolute(candidatePath)) {
    return null;
  }

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
