import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getSystemTeamsRoot, getTeamsRoot } from "./team-store.js";

export const TEAMS_SEED_MARKER_FILE = ".teams-seed.marker";

const SEED_STAGING_DIRECTORY = ".system.seed-staging";
const SEED_BACKUP_DIRECTORY = ".system.seed-backup";
const MARKER_TEMP_FILE = ".teams-seed.marker.tmp";
const FINGERPRINT_VERSION = "agent-moebius-team-seed-v1";

export interface BuiltInTeamSeedResult {
  fingerprint: string;
  status: "seeded" | "skipped";
}

interface SeedEntry {
  absolutePath: string;
  relativePath: string;
  type: "directory" | "file";
}

export async function seedBuiltInTeams(input: {
  seedTeamsRoot: string;
  dataRoot: string;
}): Promise<BuiltInTeamSeedResult> {
  const seedTeamsRoot = path.resolve(input.seedTeamsRoot);
  const systemRoot = getSystemTeamsRoot(input.dataRoot);
  const teamsRoot = getTeamsRoot(input.dataRoot);
  const markerPath = path.join(systemRoot, TEAMS_SEED_MARKER_FILE);
  const fingerprint = await computeTeamSeedFingerprint(seedTeamsRoot);

  if ((await readMarker(markerPath)) === fingerprint) {
    return { fingerprint, status: "skipped" };
  }

  await fs.mkdir(teamsRoot, { recursive: true });
  const stagingRoot = path.join(teamsRoot, SEED_STAGING_DIRECTORY);
  const backupRoot = path.join(teamsRoot, SEED_BACKUP_DIRECTORY);
  await recoverInterruptedSwap({ systemRoot, stagingRoot, backupRoot });
  await copySeedTree(seedTeamsRoot, stagingRoot);
  const stagedFingerprint = await computeTeamSeedFingerprint(stagingRoot);
  if (stagedFingerprint !== fingerprint) {
    await fs.rm(stagingRoot, { recursive: true, force: true });
    throw new Error("Team seed content changed while it was being staged");
  }

  const hadExistingSystemRoot = await pathExists(systemRoot);
  if (hadExistingSystemRoot) {
    await fs.rename(systemRoot, backupRoot);
  }

  try {
    await fs.rename(stagingRoot, systemRoot);
  } catch (error) {
    if (hadExistingSystemRoot) {
      await fs.rename(backupRoot, systemRoot);
    }
    throw error;
  }

  if (hadExistingSystemRoot) {
    await fs.rm(backupRoot, { recursive: true, force: true });
  }
  await writeMarkerLast(markerPath, fingerprint);

  return { fingerprint, status: "seeded" };
}

export async function computeTeamSeedFingerprint(seedTeamsRoot: string): Promise<string> {
  const resolvedRoot = path.resolve(seedTeamsRoot);
  const entries = await collectSeedEntries(resolvedRoot);
  const hash = createHash("sha256");
  hash.update(FINGERPRINT_VERSION);
  hash.update("\0");

  for (const entry of entries) {
    hash.update(entry.type === "directory" ? "d" : "f");
    hash.update("\0");
    hash.update(entry.relativePath);
    hash.update("\0");
    if (entry.type === "file") {
      const content = await fs.readFile(entry.absolutePath);
      hash.update(String(content.byteLength));
      hash.update("\0");
      hash.update(content);
      hash.update("\0");
    }
  }

  return hash.digest("hex");
}

async function collectSeedEntries(root: string, current = root): Promise<SeedEntry[]> {
  const directoryEntries = await fs.readdir(current, { withFileTypes: true });
  const collected: SeedEntry[] = [];

  for (const directoryEntry of directoryEntries.sort((left, right) => compareNames(left.name, right.name))) {
    const absolutePath = path.join(current, directoryEntry.name);
    const relativePath = toFingerprintPath(path.relative(root, absolutePath));
    if (relativePath === TEAMS_SEED_MARKER_FILE) {
      throw new Error(`${TEAMS_SEED_MARKER_FILE} is reserved and cannot be packaged as team seed content`);
    }
    if (directoryEntry.isDirectory()) {
      collected.push({ absolutePath, relativePath, type: "directory" });
      collected.push(...(await collectSeedEntries(root, absolutePath)));
      continue;
    }
    if (directoryEntry.isFile()) {
      collected.push({ absolutePath, relativePath, type: "file" });
      continue;
    }
    throw new Error(`Team seed contains an unsupported file type: ${absolutePath}`);
  }

  return collected;
}

async function copySeedTree(sourceRoot: string, destinationRoot: string): Promise<void> {
  await fs.rm(destinationRoot, { recursive: true, force: true });
  await fs.mkdir(destinationRoot, { recursive: true });
  const entries = await collectSeedEntries(sourceRoot);

  for (const entry of entries) {
    const destination = path.join(destinationRoot, ...entry.relativePath.split("/"));
    if (entry.type === "directory") {
      await fs.mkdir(destination, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(entry.absolutePath, destination);
  }
}

async function recoverInterruptedSwap(input: {
  systemRoot: string;
  stagingRoot: string;
  backupRoot: string;
}): Promise<void> {
  await fs.rm(input.stagingRoot, { recursive: true, force: true });
  if (!(await pathExists(input.backupRoot))) {
    return;
  }

  if (await pathExists(input.systemRoot)) {
    await fs.rm(input.backupRoot, { recursive: true, force: true });
    return;
  }

  await fs.rename(input.backupRoot, input.systemRoot);
}

async function readMarker(markerPath: string): Promise<string | null> {
  try {
    return (await fs.readFile(markerPath, "utf8")).trim();
  } catch (error) {
    if (isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return null;
    }
    throw error;
  }
}

async function writeMarkerLast(markerPath: string, fingerprint: string): Promise<void> {
  const temporaryMarkerPath = path.join(path.dirname(markerPath), MARKER_TEMP_FILE);
  await fs.writeFile(temporaryMarkerPath, `${fingerprint}\n`, "utf8");
  await fs.rename(temporaryMarkerPath, markerPath);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function toFingerprintPath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
