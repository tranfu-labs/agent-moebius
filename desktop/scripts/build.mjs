import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(path.join(dist, "status-page"), { recursive: true });
await fs.mkdir(path.join(dist, "console-page"), { recursive: true });

const common = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: true,
  outdir: dist,
  external: ["electron", "electron-updater"],
};

await build({
  ...common,
  entryPoints: [
    path.join(root, "src/main.ts"),
    path.join(root, "src/runner-child.ts"),
  ],
});

// sqlite-state.ts resolves its worker thread module relative to its own bundled
// location (./sqlite-state-worker.js next to main.js/runner-child.js), so it must be
// built as its own output file rather than inlined into the bundles above.
await build({
  ...common,
  entryPoints: [path.join(root, "..", "src/sqlite-state-worker.ts")],
  outdir: undefined,
  outfile: path.join(dist, "sqlite-state-worker.js"),
});

await build({
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: true,
  entryPoints: [path.join(root, "src/preload.ts")],
  outfile: path.join(dist, "preload.cjs"),
  external: ["electron"],
});

await build({
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  sourcemap: true,
  entryPoints: [path.join(root, "src/console-page/app.tsx")],
  outfile: path.join(dist, "console-page/app.js"),
  loader: {
    ".css": "css",
  },
});

await fs.copyFile(path.join(root, "src/console-page/index.html"), path.join(dist, "console-page/index.html"));
await fs.copyFile(path.join(root, "src/console-page/console.css"), path.join(dist, "console-page/console.css"));
await fs.copyFile(path.join(root, "src/status-page/index.html"), path.join(dist, "status-page/index.html"));
await fs.copyFile(path.join(root, "src/status-page/status.css"), path.join(dist, "status-page/status.css"));
await fs.copyFile(path.join(root, "src/status-page/status.js"), path.join(dist, "status-page/status.js"));
