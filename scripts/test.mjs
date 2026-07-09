#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(commandArgs) {
  const result = spawnSync(pnpm, commandArgs, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(["exec", "vitest", "run", ...args]);

if (args.length === 0) {
  run(["--filter", "@agent-moebius/desktop", "test"]);
  run(["--filter", "@agent-moebius/console-ui", "test"]);
}
