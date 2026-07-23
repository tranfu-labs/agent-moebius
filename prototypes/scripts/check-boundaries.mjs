import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const repositoryRoot = resolve(packageRoot, "..");
const prototypeExtensions = new Set([".js", ".mjs", ".ts", ".tsx"]);
const productionRoots = ["src", "desktop", "packages", "sites"];
const forbiddenPrototypeImports = [
  "../src",
  "../desktop",
  "../packages",
  "../sites",
  "../../src",
  "../../desktop",
  "../../packages",
  "../../sites"
];

async function collectFiles(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  const excludedDirectories = new Set([
    "node_modules",
    "dist",
    "dist-types",
    "storybook-static",
    "release"
  ]);

  for (const entry of entries) {
    if (excludedDirectories.has(entry.name)) {
      continue;
    }
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path, predicate)));
    } else if (predicate(path)) {
      files.push(path);
    }
  }

  return files;
}

function importSpecifiers(source) {
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\bimport\s+["']([^"']+)["']/gu
  ];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1])
  );
}

const violations = [];
const prototypeFiles = await collectFiles(
  packageRoot,
  (path) => prototypeExtensions.has(extname(path))
);

for (const path of prototypeFiles) {
  const source = await readFile(path, "utf8");
  for (const specifier of importSpecifiers(source)) {
    if (
      forbiddenPrototypeImports.some(
        (prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`)
      )
    ) {
      violations.push(`${path}: prototype imports production source "${specifier}"`);
    }
  }
}

for (const root of productionRoots) {
  const absoluteRoot = resolve(repositoryRoot, root);
  const files = await collectFiles(
    absoluteRoot,
    (path) => prototypeExtensions.has(extname(path))
  );
  for (const path of files) {
    const source = await readFile(path, "utf8");
    for (const specifier of importSpecifiers(source)) {
      if (
        specifier === "prototypes" ||
        specifier.startsWith("prototypes/") ||
        specifier.includes("/prototypes/")
      ) {
        violations.push(`${path}: production source imports prototype "${specifier}"`);
      }
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Prototype boundary violations:\n${violations.join("\n")}`);
}

process.stdout.write(
  `Prototype boundaries verified across ${prototypeFiles.length} prototype source files.\n`
);
