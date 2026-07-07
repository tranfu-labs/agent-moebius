import { contextBridge, ipcRenderer } from "electron";
import type { DesktopStatusSnapshot } from "./status.js";

export interface AgentMoebiusDesktopApi {
  onStatus(listener: (snapshot: DesktopStatusSnapshot) => void): () => void;
  openObserver(): Promise<void>;
  openDataRoot(): Promise<void>;
  checkUpdates(): Promise<void>;
}

const api: AgentMoebiusDesktopApi = {
  onStatus(listener) {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: DesktopStatusSnapshot): void => {
      listener(snapshot);
    };
    ipcRenderer.on("status:snapshot", wrapped);
    return () => {
      ipcRenderer.off("status:snapshot", wrapped);
    };
  },
  openObserver() {
    return ipcRenderer.invoke("action:open-observer") as Promise<void>;
  },
  openDataRoot() {
    return ipcRenderer.invoke("action:open-data-root") as Promise<void>;
  },
  checkUpdates() {
    return ipcRenderer.invoke("action:check-updates") as Promise<void>;
  },
};

contextBridge.exposeInMainWorld("agentMoebius", api);
