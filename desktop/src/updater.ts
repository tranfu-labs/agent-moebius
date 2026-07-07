export type UpdateStrategy = "manual-download" | "auto-update";

export interface UpdateDecision {
  strategy: UpdateStrategy;
  action: "none" | "open-download-page" | "auto-update";
  updateAvailable: boolean;
  latestVersion?: string;
  downloadUrl?: string;
}

export interface ReleaseMetadata {
  version: string;
  url: string;
}

export function resolveUpdateStrategy(platform: NodeJS.Platform): UpdateStrategy {
  return platform === "darwin" ? "manual-download" : "auto-update";
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return Math.sign(delta);
    }
  }
  return 0;
}

export function decideUpdate(input: {
  platform: NodeJS.Platform;
  currentVersion: string;
  latestVersion?: string;
  downloadUrl?: string;
}): UpdateDecision {
  const strategy = resolveUpdateStrategy(input.platform);
  const updateAvailable =
    input.latestVersion !== undefined && compareVersions(input.latestVersion, input.currentVersion) > 0;

  if (!updateAvailable) {
    return { strategy, action: "none", updateAvailable: false, latestVersion: input.latestVersion };
  }

  if (strategy === "manual-download") {
    return {
      strategy,
      action: "open-download-page",
      updateAvailable: true,
      latestVersion: input.latestVersion,
      downloadUrl: input.downloadUrl,
    };
  }

  return {
    strategy,
    action: "auto-update",
    updateAvailable: true,
    latestVersion: input.latestVersion,
    downloadUrl: input.downloadUrl,
  };
}

function parseVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^[^\d]*/u, "")
    .split(/[.-]/u)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}
