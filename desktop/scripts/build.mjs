import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(path.join(dist, "status-page"), { recursive: true });

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

await fs.copyFile(path.join(root, "src/status-page/index.html"), path.join(dist, "status-page/index.html"));
await fs.copyFile(path.join(root, "src/status-page/status.css"), path.join(dist, "status-page/status.css"));
await fs.copyFile(path.join(root, "src/status-page/status.js"), path.join(dist, "status-page/status.js"));
