#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const MANIFEST_PATH = "assets/brand/manifest.json";
const SOURCE = {
  path: "assets/brand/moebius.png",
  width: 1254,
  height: 1254,
};
const TARGETS = [
  {
    path: "assets/brand/generated/app-icon-1024.png",
    purpose: "Electron macOS application icon source",
    width: 1024,
    height: 1024,
    maxBytes: 1024 * 1024,
  },
  {
    path: "assets/brand/generated/ui-icon-64.png",
    purpose: "Shared in-app brand mark",
    width: 64,
    height: 64,
    maxBytes: 32 * 1024,
  },
  {
    path: "assets/brand/generated/favicon-32.png",
    purpose: "Desktop renderer and marketing-site favicon",
    width: 32,
    height: 32,
    maxBytes: 16 * 1024,
  },
  {
    path: "assets/brand/generated/apple-touch-icon-180.png",
    purpose: "Marketing-site Apple Touch Icon",
    width: 180,
    height: 180,
    maxBytes: 128 * 1024,
  },
  {
    path: "sites/marketeam/assets/moebius-icon-64.png",
    purpose: "Marketing-site header brand mark",
    width: 64,
    height: 64,
    maxBytes: 32 * 1024,
    duplicateOf: "assets/brand/generated/ui-icon-64.png",
  },
  {
    path: "sites/marketeam/assets/favicon-32.png",
    purpose: "Marketing-site favicon deployment copy",
    width: 32,
    height: 32,
    maxBytes: 16 * 1024,
    duplicateOf: "assets/brand/generated/favicon-32.png",
  },
  {
    path: "sites/marketeam/assets/apple-touch-icon.png",
    purpose: "Marketing-site Apple Touch Icon deployment copy",
    width: 180,
    height: 180,
    maxBytes: 128 * 1024,
    duplicateOf: "assets/brand/generated/apple-touch-icon-180.png",
  },
];

function parseArgs(argv) {
  let mode = "generate";
  let root = DEFAULT_ROOT;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      mode = "check";
      continue;
    }
    if (argument === "--root") {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error("--root requires a directory path");
      }
      root = path.resolve(next);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }

  return { mode, root };
}

async function readPng(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  const bytes = await fs.readFile(absolutePath);
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${relativePath} is not a PNG`);
  }
  if (bytes.length < 24 || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error(`${relativePath} has no valid IHDR chunk`);
  }
  return {
    bytes,
    byteLength: bytes.length,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

async function inspectExpectedPng(root, definition) {
  const image = await readPng(root, definition.path);
  assertEqual(image.width, definition.width, `${definition.path} width`);
  assertEqual(image.height, definition.height, `${definition.path} height`);
  if (definition.maxBytes !== undefined && image.byteLength > definition.maxBytes) {
    throw new Error(
      `${definition.path} is ${image.byteLength} bytes; limit is ${definition.maxBytes}`,
    );
  }
  return image;
}

async function buildManifest(root) {
  const sourceImage = await inspectExpectedPng(root, SOURCE);
  const assets = [];
  for (const target of TARGETS) {
    const image = await inspectExpectedPng(root, target);
    assets.push({
      path: target.path,
      purpose: target.purpose,
      width: target.width,
      height: target.height,
      maxBytes: target.maxBytes,
      bytes: image.byteLength,
      sha256: image.sha256,
      ...(target.duplicateOf === undefined ? {} : { duplicateOf: target.duplicateOf }),
    });
  }

  return {
    schemaVersion: 1,
    generator: "scripts/generate-brand-assets.mjs",
    source: {
      path: SOURCE.path,
      width: SOURCE.width,
      height: SOURCE.height,
      bytes: sourceImage.byteLength,
      sha256: sourceImage.sha256,
    },
    assets,
  };
}

async function generate(root) {
  if (process.platform !== "darwin") {
    throw new Error("brand asset generation requires macOS and /usr/bin/sips; use --check elsewhere");
  }

  const sourcePath = path.join(root, SOURCE.path);
  await inspectExpectedPng(root, SOURCE);
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "moebius-brand-"));

  try {
    const generatedBySize = new Map();
    for (const target of TARGETS) {
      const sizeKey = `${target.width}x${target.height}`;
      let generatedPath = generatedBySize.get(sizeKey);
      if (generatedPath === undefined) {
        generatedPath = path.join(temporaryRoot, `${sizeKey}.png`);
        const result = spawnSync(
          "/usr/bin/sips",
          ["-s", "format", "png", "-z", String(target.height), String(target.width), sourcePath, "--out", generatedPath],
          { encoding: "utf8", shell: false },
        );
        if (result.error !== undefined) {
          throw result.error;
        }
        if (result.status !== 0) {
          throw new Error(result.stderr.trim() || `sips failed for ${sizeKey}`);
        }
        generatedBySize.set(sizeKey, generatedPath);
      }

      const outputPath = path.join(root, target.path);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.copyFile(generatedPath, outputPath);
    }
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }

  const manifest = await buildManifest(root);
  const manifestPath = path.join(root, MANIFEST_PATH);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await check(root);
  console.log(`Generated ${TARGETS.length} brand assets and verified ${MANIFEST_PATH}.`);
}

async function check(root) {
  const manifestPath = path.join(root, MANIFEST_PATH);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assertEqual(manifest.schemaVersion, 1, "manifest schemaVersion");
  assertEqual(manifest.generator, "scripts/generate-brand-assets.mjs", "manifest generator");

  const sourceImage = await inspectExpectedPng(root, SOURCE);
  assertEqual(manifest.source?.path, SOURCE.path, "manifest source path");
  assertEqual(manifest.source?.width, SOURCE.width, "manifest source width");
  assertEqual(manifest.source?.height, SOURCE.height, "manifest source height");
  assertEqual(manifest.source?.bytes, sourceImage.byteLength, "manifest source bytes");
  assertEqual(manifest.source?.sha256, sourceImage.sha256, "manifest source sha256");

  if (!Array.isArray(manifest.assets)) {
    throw new Error("manifest assets must be an array");
  }
  assertEqual(manifest.assets.length, TARGETS.length, "manifest asset count");

  const hashes = new Map();
  for (let index = 0; index < TARGETS.length; index += 1) {
    const target = TARGETS[index];
    const record = manifest.assets[index];
    const image = await inspectExpectedPng(root, target);
    for (const property of ["path", "purpose", "width", "height", "maxBytes"]) {
      assertEqual(record?.[property], target[property], `${target.path} manifest ${property}`);
    }
    assertEqual(record?.bytes, image.byteLength, `${target.path} manifest bytes`);
    assertEqual(record?.sha256, image.sha256, `${target.path} manifest sha256`);
    assertEqual(record?.duplicateOf, target.duplicateOf, `${target.path} manifest duplicateOf`);
    hashes.set(target.path, image.sha256);
  }

  for (const target of TARGETS) {
    if (target.duplicateOf !== undefined) {
      assertEqual(
        hashes.get(target.path),
        hashes.get(target.duplicateOf),
        `${target.path} duplicate content hash`,
      );
    }
  }

  console.log(`Brand assets verified: ${TARGETS.length} outputs match ${MANIFEST_PATH}.`);
}

try {
  const { mode, root } = parseArgs(process.argv.slice(2));
  if (mode === "check") {
    await check(root);
  } else {
    await generate(root);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
