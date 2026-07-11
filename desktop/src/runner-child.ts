import { start, type StartedRuntime } from "../../src/runner.js";
import { DESKTOP_RUNNER_MODE } from "./runner-launch.js";

let runtime: StartedRuntime | undefined;

start({ mode: DESKTOP_RUNNER_MODE })
  .then((startedRuntime) => {
    runtime = startedRuntime;
    if (process.send !== undefined) {
      process.send({ type: "runner-started", pid: process.pid });
    }
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });

async function shutdown(): Promise<void> {
  await runtime?.close();
  process.exit(0);
}

process.once("SIGTERM", () => {
  void shutdown();
});
process.once("SIGINT", () => {
  void shutdown();
});
