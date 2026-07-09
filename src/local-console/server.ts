import http from "node:http";
import path from "node:path";
import {
  CODEX_RUN_IDLE_TIMEOUT_MS,
  CODEX_RUN_MAX_DURATION_MS,
  LOCAL_CONSOLE_HOST,
  LOCAL_CONSOLE_PORT,
  LOCAL_CONSOLE_SQLITE_BUSY_TIMEOUT_MS,
  LOCAL_CONSOLE_SQLITE_PATH,
  LOCAL_CONSOLE_STORE_TIMEOUT_MS,
  PROJECT_ROOT,
  TMP_ROOT,
} from "../config.js";
import { run as runCodex } from "../codex.js";
import { log } from "../log.js";
import { createSqliteLocalConsoleStore } from "./store.js";
import { LocalConsoleBusyError, type LocalConsoleSnapshot, type LocalConsoleStore } from "./types.js";
import { formatLocalError, LocalConsoleRuntime, type LocalConsoleAgentFile } from "./runtime.js";

export interface LocalConsoleServerOptions {
  host?: string;
  port?: number;
  projectRoot?: string;
  store?: LocalConsoleStore;
  sqlitePath?: string;
  listAgentFiles?: () => Promise<LocalConsoleAgentFile[]>;
  runCodex?: typeof runCodex;
  makeRunDir?: (count: number, now?: Date) => string;
  storeTimeoutMs?: number;
  sqliteBusyTimeoutMs?: number;
  codexIdleTimeoutMs?: number;
  codexMaxDurationMs?: number;
  pollIntervalMs?: number;
}

export interface StartedLocalConsoleServer {
  server: http.Server;
  runtime: LocalConsoleRuntime;
  url: string;
  sqlitePath: string;
  close(): Promise<void>;
}

export async function startLocalConsoleServer(options: LocalConsoleServerOptions = {}): Promise<StartedLocalConsoleServer> {
  const host = options.host ?? LOCAL_CONSOLE_HOST;
  const requestedPort = options.port ?? LOCAL_CONSOLE_PORT;
  const projectRoot = options.projectRoot ?? PROJECT_ROOT;
  const sqlitePath = options.sqlitePath ?? (options.projectRoot === undefined ? LOCAL_CONSOLE_SQLITE_PATH : path.join(projectRoot, ".state", "local-console.sqlite"));
  const store =
    options.store ??
    (await createSqliteLocalConsoleStore({
      sqlitePath,
      busyTimeoutMs: options.sqliteBusyTimeoutMs ?? LOCAL_CONSOLE_SQLITE_BUSY_TIMEOUT_MS,
      timeoutMs: options.storeTimeoutMs ?? LOCAL_CONSOLE_STORE_TIMEOUT_MS,
    }));
  const runtime = new LocalConsoleRuntime({
    store,
    listAgentFiles: options.listAgentFiles ?? (() => listLocalAgentFiles(path.join(projectRoot, "agents"))),
    runCodex: options.runCodex ?? runCodex,
    makeRunDir: options.makeRunDir ?? makeLocalConsoleRunDir,
    projectRoot,
    storeTimeoutMs: options.storeTimeoutMs ?? LOCAL_CONSOLE_STORE_TIMEOUT_MS,
    codexIdleTimeoutMs: options.codexIdleTimeoutMs ?? CODEX_RUN_IDLE_TIMEOUT_MS,
    codexMaxDurationMs: options.codexMaxDurationMs ?? CODEX_RUN_MAX_DURATION_MS,
  });
  await runtime.init();

  const server = createLocalConsoleHttpServer(runtime);
  const { port } = await listenWithFallback(server, host, requestedPort);
  const interval = setInterval(() => {
    void runtime.processPending();
  }, options.pollIntervalMs ?? 1_000);
  interval.unref();

  const url = `http://${host}:${String(port)}/`;
  log({ event: "local-console-started", url, sqlitePath: store.sqlitePath });

  return {
    server,
    runtime,
    url,
    sqlitePath: store.sqlitePath,
    async close() {
      clearInterval(interval);
      await closeServer(server);
      await runtime.close();
    },
  };
}

let localRunDirSequence = 0;

export function makeLocalConsoleRunDir(count: number, now = new Date()): string {
  localRunDirSequence += 1;
  return path.join(TMP_ROOT, `agent-moebius-local-${now.toISOString()}-c${count}-r${localRunDirSequence}`);
}

export function createLocalConsoleHttpServer(runtime: LocalConsoleRuntime): http.Server {
  return http.createServer((request, response) => {
    void handleRequest(runtime, request, response);
  });
}

async function handleRequest(
  runtime: LocalConsoleRuntime,
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/") {
      sendHtml(response, renderLocalConsolePage());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/local-console/messages") {
      sendJson(response, 200, await runtime.snapshot());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/local-console/messages") {
      const payload = await readJsonBody(request);
      if (!isRecord(payload) || typeof payload.body !== "string") {
        sendJson(response, 400, { error: "Expected JSON body with a string body field" });
        return;
      }

      try {
        const message = await runtime.submitUserMessage(payload.body);
        sendJson(response, 202, { message });
      } catch (error) {
        if (error instanceof LocalConsoleBusyError) {
          sendJson(response, 409, { error: error.message });
          return;
        }
        sendJson(response, 503, { error: formatLocalError(error) });
      }
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: formatLocalError(error) });
  }
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw === "") {
    return {};
  }
  return JSON.parse(raw) as unknown;
}

function sendHtml(response: http.ServerResponse, body: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

function sendJson(response: http.ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function renderLocalConsolePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Moebius Local Spike</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f6f5; color: #171717; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: stretch; }
    main { max-width: 920px; width: min(920px, calc(100vw - 32px)); margin: 24px auto; border: 1px solid #d4d4d4; background: #ffffff; }
    header, footer, .meta { padding: 14px 16px; border-bottom: 1px solid #e4e4e4; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; }
    h1 { font-size: 18px; margin: 0; font-weight: 650; }
    .status { font-size: 13px; color: #525252; }
    .meta { font-size: 13px; color: #525252; display: grid; gap: 6px; }
    .messages { min-height: 360px; padding: 16px; display: grid; gap: 12px; align-content: start; }
    .message { border: 1px solid #e5e5e5; padding: 12px; background: #fafafa; }
    .message.agent { border-color: #c7d2fe; background: #f8f9ff; }
    .message.system, .message.failed { border-color: #fecaca; background: #fff7f7; }
    .message-title { font-size: 12px; color: #525252; margin-bottom: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; font: inherit; }
    footer { border-top: 1px solid #e4e4e4; border-bottom: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
    input { min-width: 0; font: inherit; padding: 10px 12px; border: 1px solid #cfcfcf; }
    button { font: inherit; padding: 10px 14px; border: 1px solid #1f2937; background: #1f2937; color: #fff; cursor: pointer; }
    button:disabled, input:disabled { opacity: 0.55; cursor: not-allowed; }
    .error { color: #b91c1c; font-size: 13px; padding: 0 16px 12px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Agent Moebius Local Spike</h1>
      <div class="status" id="status">loading</div>
    </header>
    <section class="meta">
      <div>SQLite: <span id="sqlite">loading</span></div>
      <div>Session: <span id="session">default</span></div>
    </section>
    <section class="messages" id="messages"></section>
    <div class="error" id="error"></div>
    <footer>
      <input id="body" type="text" value="@dev 帮我写个 hello" />
      <button id="send" type="button">Send</button>
    </footer>
  </main>
  <script>
    const statusEl = document.getElementById("status");
    const sqliteEl = document.getElementById("sqlite");
    const sessionEl = document.getElementById("session");
    const messagesEl = document.getElementById("messages");
    const errorEl = document.getElementById("error");
    const inputEl = document.getElementById("body");
    const sendEl = document.getElementById("send");

    async function refresh() {
      try {
        const response = await fetch("/api/local-console/messages");
        const snapshot = await response.json();
        if (!response.ok) throw new Error(snapshot.error || "snapshot failed");
        render(snapshot);
      } catch (error) {
        errorEl.textContent = String(error.message || error);
      }
    }

    function render(snapshot) {
      statusEl.textContent = snapshot.status;
      sqliteEl.textContent = snapshot.sqlitePath;
      sessionEl.textContent = snapshot.sessionId;
      errorEl.textContent = snapshot.lastError || "";
      inputEl.disabled = snapshot.status === "running";
      sendEl.disabled = snapshot.status === "running";
      messagesEl.innerHTML = "";
      for (const message of snapshot.messages) {
        const node = document.createElement("article");
        node.className = "message " + message.speaker + (message.status === "failed" ? " failed" : "");
        const title = document.createElement("div");
        title.className = "message-title";
        title.textContent = [message.role || message.speaker, message.status, message.runDir || ""].filter(Boolean).join(" · ");
        const body = document.createElement("pre");
        body.textContent = message.body;
        node.append(title, body);
        messagesEl.append(node);
      }
    }

    sendEl.addEventListener("click", async () => {
      errorEl.textContent = "";
      try {
        const response = await fetch("/api/local-console/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: inputEl.value }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "send failed");
        await refresh();
      } catch (error) {
        errorEl.textContent = String(error.message || error);
      }
    });

    void refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`;
}

async function listenWithFallback(
  server: http.Server,
  host: string,
  requestedPort: number,
): Promise<{ port: number }> {
  try {
    return await listen(server, host, requestedPort);
  } catch (error) {
    if (requestedPort !== 0 && isListenAddressInUse(error)) {
      log({ event: "local-console-port-in-use", requestedPort });
      return await listen(server, host, 0);
    }
    throw error;
  }
}

async function listen(server: http.Server, host: string, port: number): Promise<{ port: number }> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Local console server did not expose a TCP port");
  }
  return { port: address.port };
}

function isListenAddressInUse(error: unknown): boolean {
  return isRecord(error) && error.code === "EADDRINUSE";
}

async function closeServer(server: http.Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function listLocalAgentFiles(dir: string): Promise<LocalConsoleAgentFile[]> {
  const entries = await fsReaddir(dir);
  return entries
    .filter((entry) => entry.name.endsWith(".md"))
    .map((entry) => ({ name: path.basename(entry.name, ".md"), path: path.join(dir, entry.name) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function fsReaddir(dir: string): Promise<Array<{ name: string }>> {
  const fs = await import("node:fs/promises");
  return await fs.readdir(dir, { withFileTypes: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
