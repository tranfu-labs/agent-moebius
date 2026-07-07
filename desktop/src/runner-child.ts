import { start } from "../../src/runner.js";

let heartbeatTimer: NodeJS.Timeout | undefined;

start()
  .then((timer) => {
    heartbeatTimer = timer;
    if (process.send !== undefined) {
      process.send({ type: "runner-started", pid: process.pid });
    }
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });

async function shutdown(): Promise<void> {
  if (heartbeatTimer !== undefined) {
    clearInterval(heartbeatTimer);
  }
  process.exit(0);
}

process.once("SIGTERM", () => {
  void shutdown();
});
process.once("SIGINT", () => {
  void shutdown();
});
