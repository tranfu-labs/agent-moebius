import fs from "node:fs/promises";
import path from "node:path";

import type { LocalConsoleFileContent } from "./types.js";

export const LOCAL_CONSOLE_FILE_CONTENT_MAX_BYTES = 2 * 1024 * 1024;

export async function listLocalWorkspaceFiles(workspacePath: string): Promise<string[]> {
  const root = await fs.realpath(workspacePath);
  const files: string[] = [];
  await visit(root, "");
  return files.sort((left, right) => left.localeCompare(right));

  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (relativeDirectory === "" && entry.name === ".git") {
        continue;
      }
      const relativePath = relativeDirectory === ""
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(path.join(directory, entry.name), relativePath);
        continue;
      }
      if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(relativePath);
      }
    }
  }
}

export async function readLocalWorkspaceTextFile(input: {
  workspacePath: string;
  filePath: string;
  maxBytes?: number;
}): Promise<LocalConsoleFileContent & { text?: string }> {
  const normalizedPath = normalizeLocalWorkspaceFilePath(input.filePath);
  if (normalizedPath === null) {
    return unavailable(input.filePath, "outside-workspace");
  }

  let root: string;
  let candidate: string;
  try {
    root = await fs.realpath(input.workspacePath);
    candidate = await fs.realpath(path.join(root, ...normalizedPath.split("/")));
  } catch (error) {
    return unavailable(normalizedPath, isMissingFileError(error) ? "not-found" : "workspace-unavailable");
  }
  if (!isPathInside(root, candidate)) {
    return unavailable(normalizedPath, "outside-workspace");
  }

  let stat;
  try {
    stat = await fs.stat(candidate);
  } catch (error) {
    return unavailable(normalizedPath, isMissingFileError(error) ? "not-found" : "workspace-unavailable");
  }
  if (!stat.isFile()) {
    return unavailable(normalizedPath, "not-file");
  }
  if (stat.size > (input.maxBytes ?? LOCAL_CONSOLE_FILE_CONTENT_MAX_BYTES)) {
    return unavailable(normalizedPath, "file-too-large");
  }

  let content: Buffer;
  try {
    content = await fs.readFile(candidate);
  } catch {
    return unavailable(normalizedPath, "workspace-unavailable");
  }
  if (content.includes(0)) {
    return unavailable(normalizedPath, "binary-file");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return unavailable(normalizedPath, "binary-file");
  }
  return {
    available: true,
    path: normalizedPath,
    lines: textToUnchangedLines(text),
    reason: null,
    text,
  };
}

export function normalizeLocalWorkspaceFilePath(filePath: string): string | null {
  const portable = filePath.replaceAll("\\", "/");
  if (portable.trim() === "" || portable.startsWith("/") || /^[a-z]:\//iu.test(portable)) {
    return null;
  }
  const normalized = path.posix.normalize(portable);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return null;
  }
  return normalized;
}

export function textToUnchangedLines(text: string): LocalConsoleFileContent["lines"] {
  return splitTextLines(text).map((line, index) => ({
    kind: "unchanged",
    oldLineNumber: index + 1,
    newLineNumber: index + 1,
    text: line,
  }));
}

export function splitTextLines(text: string): string[] {
  if (text === "") {
    return [];
  }
  const lines = text.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines.map((line) => line.endsWith("\r") ? line.slice(0, -1) : line);
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function unavailable(
  filePath: string,
  reason: Extract<LocalConsoleFileContent, { available: false }>["reason"],
): Extract<LocalConsoleFileContent, { available: false }> {
  return { available: false, path: filePath, lines: [], reason };
}
