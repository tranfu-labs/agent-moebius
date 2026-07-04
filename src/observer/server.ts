import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildObserverModel } from "./model.js";
import { readObserverState } from "./read-state.js";
import type { ReadObserverStateInput } from "./read-state.js";
import { renderObserverPage } from "./render.js";

export interface ObserverServerOptions extends Pick<ReadObserverStateInput, "goalLedgerReadTimeoutMs" | "readGoalLedgerFile"> {
  projectRoot?: string;
  host?: string;
  port?: number;
}

export interface StartedObserverServer {
  server: http.Server;
  url: string;
}

const DEFAULT_OBSERVER_HOST = "127.0.0.1";
const DEFAULT_OBSERVER_PORT = 8787;

export function createObserverServer(options: ObserverServerOptions = {}): http.Server {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());

  return http.createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      response.end("Method Not Allowed");
      return;
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    if (url.pathname !== "/") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }

    try {
      const snapshot = await readObserverState({
        projectRoot,
        goalLedgerReadTimeoutMs: options.goalLedgerReadTimeoutMs,
        readGoalLedgerFile: options.readGoalLedgerFile,
      });
      const body = renderObserverPage(buildObserverModel(snapshot));
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      if (request.method === "HEAD") {
        response.end();
      } else {
        response.end(body);
      }
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(`Observer failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export async function startObserverServer(options: ObserverServerOptions = {}): Promise<StartedObserverServer> {
  const host = options.host ?? DEFAULT_OBSERVER_HOST;
  const port = options.port ?? DEFAULT_OBSERVER_PORT;
  const server = createObserverServer(options);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  const address = server.address();
  const resolvedPort = typeof address === "object" && address !== null ? address.port : port;
  return { server, url: `http://${host}:${resolvedPort}/` };
}

export function parseObserverPort(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_OBSERVER_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid OBSERVER_PORT: ${value}`);
  }

  return port;
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  startObserverServer({
    host: process.env.OBSERVER_HOST ?? DEFAULT_OBSERVER_HOST,
    port: parseObserverPort(process.env.OBSERVER_PORT),
  })
    .then(({ url }) => {
      console.log(`Agent Moebius Observer listening on ${url}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
