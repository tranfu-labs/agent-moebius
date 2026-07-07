import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, shell, utilityProcess, type UtilityProcess } from "electron";
import electronUpdater from "electron-updater";
import { startObserverServer, type StartedObserverServer } from "../../src/observer/server.js";
import { buildSeedCopyPlan, executeSeedCopyPlan, resolveDesktopDataRoot } from "./data-root.js";
import { checkDesktopEnvironment } from "./env-doctor.js";
import { RunnerSupervisor, type RunnerProcess } from "./runner-supervisor.js";
import { resolveShellPath } from "./shell-path.js";
import type { DesktopStatusSnapshot } from "./status.js";
import { decideUpdate, type ReleaseMetadata } from "./updater.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, "..", "..");
const { autoUpdater } = electronUpdater;

let mainWindow: BrowserWindow | null = null;
let observerServer: StartedObserverServer | null = null;
let runnerSupervisor: RunnerSupervisor | null = null;
let isQuitting = false;

const status: DesktopStatusSnapshot = {
  appVersion: app.getVersion(),
  dataRoot: "",
  observer: { status: "starting" },
  runner: { status: "stopped", crashCount: 0, maxCrashCount: 3 },
  doctor: null,
  shellPath: null,
  seed: { status: "pending", copied: 0, skipped: 0 },
  update: null,
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    void boot();
  });
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (!isQuitting) {
    void shutdownAndQuit();
  }
});

async function boot(): Promise<void> {
  status.dataRoot = resolveDesktopDataRoot({
    env: process.env,
    isPackaged: app.isPackaged,
    projectRoot,
  });

  createWindow();
  publishStatus();

  const shellPath = await resolveShellPath({
    platform: process.platform,
    currentPath: process.env.PATH,
  });
  status.shellPath = shellPath;
  process.env.PATH = shellPath.path;
  publishStatus();

  try {
    const seedRoot = resolveSeedRoot();
    const plan = await buildSeedCopyPlan({ seedRoot, dataRoot: status.dataRoot });
    await executeSeedCopyPlan(plan.operations);
    status.seed = { status: "ok", copied: plan.operations.length, skipped: plan.skippedDestinations.length };
  } catch (error) {
    status.seed = { status: "error", copied: 0, skipped: 0, error: formatError(error) };
    publishStatus();
    return;
  }
  publishStatus();

  status.doctor = await checkDesktopEnvironment();
  publishStatus();

  await startObserver();
  startRunner();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 560,
    minWidth: 520,
    minHeight: 420,
    title: "agent-moebius",
    webPreferences: {
      preload: path.join(dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.on("did-finish-load", publishStatus);
  void mainWindow.loadFile(path.join(dirname, "status-page", "index.html"));
}

async function startObserver(): Promise<void> {
  try {
    observerServer = await startObserverServer({
      host: "127.0.0.1",
      port: 0,
      projectRoot: status.dataRoot,
    });
    status.observer = { status: "running", url: observerServer.url };
  } catch (error) {
    status.observer = { status: "error", error: formatError(error) };
  }
  publishStatus();
}

function startRunner(): void {
  const logPath = path.join(status.dataRoot, "logs", `runner-${new Date().toISOString().replace(/[:.]/gu, "-")}.log`);
  runnerSupervisor = new RunnerSupervisor({
    spawn: () => spawnRunnerProcess(logPath),
    logPath,
    onStateChange: (runnerState) => {
      status.runner = runnerState;
      publishStatus();
    },
  });
  runnerSupervisor.start();
}

function spawnRunnerProcess(logPath: string): RunnerProcess {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const child = utilityProcess.fork(path.join(dirname, "runner-child.js"), [], {
    cwd: status.dataRoot,
    env: {
      ...process.env,
      AGENT_MOEBIUS_DATA_ROOT: status.dataRoot,
      AGENT_MOEBIUS_WORKDIR_ROOT: path.join(status.dataRoot, "workdir"),
    },
    stdio: "pipe",
    serviceName: "agent-moebius-runner",
  });

  child.stdout?.on("data", (chunk) => {
    logStream.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    logStream.write(chunk);
  });
  child.once("exit", () => {
    logStream.end();
  });

  return new ElectronRunnerProcess(child);
}

class ElectronRunnerProcess implements RunnerProcess {
  readonly pid?: number;
  private readonly child: UtilityProcess;

  constructor(child: UtilityProcess) {
    this.child = child;
    this.pid = child.pid;
  }

  onExit(listener: Parameters<RunnerProcess["onExit"]>[0]): void {
    this.child.once("exit", (exitCode) => {
      listener({ reason: "exit", exitCode, signal: null });
    });
    this.child.once("spawn", () => undefined);
  }

  terminate(): void {
    this.child.kill();
  }

  kill(): void {
    this.child.kill();
  }
}

ipcMain.handle("action:open-observer", async () => {
  if (status.observer.status === "running" && status.observer.url !== undefined) {
    await shell.openExternal(status.observer.url);
  }
});

ipcMain.handle("action:open-data-root", async () => {
  await shell.openPath(status.dataRoot);
});

ipcMain.handle("action:check-updates", async () => {
  if (process.platform === "darwin") {
    const latestRelease = await fetchLatestDesktopRelease();
    const decision = decideUpdate({
      platform: process.platform,
      currentVersion: app.getVersion(),
      latestVersion: latestRelease?.version,
      downloadUrl: latestRelease?.url ?? "https://github.com/tranfu-labs/agent-moebius/releases/latest",
    });
    status.update = decision;
    publishStatus();
    if (decision.action === "open-download-page") {
      await shell.openExternal(decision.downloadUrl ?? "https://github.com/tranfu-labs/agent-moebius/releases/latest");
    }
    return;
  }

  status.update = decideUpdate({ platform: process.platform, currentVersion: app.getVersion(), latestVersion: app.getVersion() });
  publishStatus();
  await autoUpdater.checkForUpdatesAndNotify();
});

async function shutdownAndQuit(): Promise<void> {
  isQuitting = true;
  runnerSupervisor?.stop();
  await closeObserver();
  app.quit();
}

async function closeObserver(): Promise<void> {
  if (observerServer === null) {
    return;
  }

  await new Promise<void>((resolve) => {
    observerServer?.server.close(() => resolve());
  });
  observerServer = null;
}

function publishStatus(): void {
  mainWindow?.webContents.send("status:snapshot", status);
}

function resolveSeedRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "seed");
  }
  return projectRoot;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchLatestDesktopRelease(): Promise<ReleaseMetadata | null> {
  try {
    const response = await fetch("https://api.github.com/repos/tranfu-labs/agent-moebius/releases/latest", {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "agent-moebius-desktop",
      },
    });
    if (!response.ok) {
      return null;
    }
    const raw = await response.json() as unknown;
    if (!isReleaseResponse(raw)) {
      return null;
    }
    return {
      version: raw.tag_name.replace(/^desktop-/u, ""),
      url: raw.html_url,
    };
  } catch {
    return null;
  }
}

function isReleaseResponse(value: unknown): value is { tag_name: string; html_url: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const release = value as Partial<{ tag_name: unknown; html_url: unknown }>;
  return typeof release.tag_name === "string" && typeof release.html_url === "string";
}
