import fs from "node:fs";
import { parse as parseToml } from "smol-toml";
import type { RepositoryRef } from "./issue-source.js";

export interface LocalConfig {
  watchRepositories: RepositoryRef[];
}

export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  watchRepositories: [],
};

export function loadLocalConfig(filePath: string): LocalConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return DEFAULT_LOCAL_CONFIG;
    }

    throw error;
  }

  return parseLocalConfig(raw, filePath);
}

export function parseLocalConfig(raw: string, source = "config.local"): LocalConfig {
  let parsed: unknown;
  try {
    parsed = parseToml(raw);
  } catch (error) {
    throw new Error(`Invalid local config TOML at ${source}: ${formatError(error)}`);
  }

  if (!isLocalConfigShape(parsed)) {
    throw new Error(`Invalid local config shape at ${source}`);
  }

  return {
    watchRepositories: parsed.watchRepositories.map((repository) => ({
      owner: repository.owner,
      repo: repository.repo,
    })),
  };
}

function isLocalConfigShape(value: unknown): value is {
  watchRepositories: Array<{ owner: string; repo: string }>;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const config = value as Partial<{
    watchRepositories: unknown;
  }>;

  return Array.isArray(config.watchRepositories) && config.watchRepositories.every(isRepositoryRefShape);
}

function isRepositoryRefShape(value: unknown): value is RepositoryRef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const repository = value as Partial<RepositoryRef>;
  return (
    typeof repository.owner === "string" &&
    repository.owner.trim().length > 0 &&
    typeof repository.repo === "string" &&
    repository.repo.trim().length > 0
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
