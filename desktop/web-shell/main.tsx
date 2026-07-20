import "./ipc-shim";

declare global {
  interface Window {
    AGENT_MOEBIUS_LOCAL_CONSOLE_URL?: string;
  }
}

const injected = import.meta.env.VITE_LOCAL_CONSOLE_URL;
if (typeof injected === "string" && injected.length > 0) {
  window.AGENT_MOEBIUS_LOCAL_CONSOLE_URL = injected;
}

await import("../src/console-page/app");
