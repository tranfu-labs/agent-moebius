import fs from "node:fs";
import { parse as parseToml } from "smol-toml";
import type { RepositoryRef } from "./issue-source.js";

export interface LocalConfig {
  watchRepositories: RepositoryRef[];
}

export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  watchRepositories: [],
};

export function loadMergedLocalConfig(input: { configPath: string; localConfigPath: string }): LocalConfig {
  const defaultConfig = loadLocalConfig(input.configPath);
  const localConfig = loadOptionalLocalConfig(input.localConfigPath);

  return localConfig ?? defaultConfig;
}

export function loadLocalConfig(filePath: string): LocalConfig {
  return loadOptionalLocalConfig(filePath) ?? DEFAULT_LOCAL_CONFIG;
}

function loadOptionalLocalConfig(filePath: string): LocalConfig | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  return parseLocalConfig(raw, filePath);
}

export function parseLocalConfig(raw: string, source = "config.toml"): LocalConfig {
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
      owner: repository.owner.trim(),
      repo: repository.repo.trim(),
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

  if (config.watchRepositories === undefined) {
    config.watchRepositories = [];
  }

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
