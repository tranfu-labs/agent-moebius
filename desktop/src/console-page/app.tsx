import "@agent-moebius/console-ui/globals.css";

import {
  OperatorConsole,
  type OperatorMessage,
  type OperatorProject,
  type OperatorRunSnapshot,
  type OperatorRunnerStatus,
  type OperatorSession,
} from "@agent-moebius/console-ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

interface DesktopApi {
  getLocalConsoleUrl?: () => Promise<string | null>;
  onStatus?: (listener: (snapshot: DesktopStatusSnapshot) => void) => () => void;
  openStatusPage?: () => Promise<void>;
}

interface DesktopStatusSnapshot {
  runner: {
    status: OperatorRunnerStatus;
  };
  localConsole?: {
    status: "starting" | "running" | "error" | "stopped";
    url?: string;
    sqlitePath?: string;
    error?: string;
  };
}

interface LocalConsoleState {
  project: OperatorProject;
  selectedSessionId: string;
  selectedSession: OperatorSession | null;
  messages: OperatorMessage[];
  activeRun: OperatorRunSnapshot | null;
  sqlitePath: string;
  lastError: string | null;
}

declare global {
  interface Window {
    agentMoebius?: DesktopApi;
    AGENT_MOEBIUS_LOCAL_CONSOLE_URL?: string;
  }
}

function App(): JSX.Element {
  const [apiBase, setApiBase] = useState<string | null>(readQueryApiBase());
  const [selectedSessionId, setSelectedSessionId] = useState("default");
  const [state, setState] = useState<LocalConsoleState | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [runnerStatus, setRunnerStatus] = useState<OperatorRunnerStatus>("stopped");
  const [isSending, setIsSending] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function resolveApiBase(): Promise<void> {
      if (apiBase !== null) {
        return;
      }
      const fromWindow = window.AGENT_MOEBIUS_LOCAL_CONSOLE_URL;
      if (fromWindow) {
        setApiBase(fromWindow);
        return;
      }
      const fromPreload = await window.agentMoebius?.getLocalConsoleUrl?.();
      if (!cancelled && fromPreload) {
        setApiBase(fromPreload);
      }
    }
    void resolveApiBase();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  useEffect(() => {
    return window.agentMoebius?.onStatus?.((snapshot) => {
      setRunnerStatus(snapshot.runner.status);
      if (snapshot.localConsole?.url) {
        setApiBase(snapshot.localConsole.url);
      }
      if (snapshot.localConsole?.error) {
        setClientError(snapshot.localConsole.error);
      }
    });
  }, []);

  const refresh = useCallback(async () => {
    if (apiBase === null) {
      return;
    }
    try {
      const url = endpoint(apiBase, "/api/local-console/state");
      url.searchParams.set("sessionId", selectedSessionId);
      const response = await fetch(url);
      const body = await response.json() as LocalConsoleState | { error?: string };
      if (!response.ok) {
        throw new Error("error" in body && body.error ? body.error : "state request failed");
      }
      setState(body as LocalConsoleState);
      setClientError(null);
    } catch (error) {
      setClientError(formatError(error));
    }
  }, [apiBase, selectedSessionId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const project = state?.project ?? emptyProject;
  const lastError = clientError ?? state?.lastError ?? null;
  const selectedSession = state?.selectedSession ?? null;
  const messages = state?.messages ?? [];
  const activeRun = state?.activeRun ?? null;
  const sqlitePath = state?.sqlitePath;

  const createSession = useCallback(async () => {
    if (apiBase === null) {
      setClientError("local console server unavailable");
      return;
    }
    try {
      const response = await fetch(endpoint(apiBase, "/api/local-console/sessions"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "新会话" }),
      });
      const body = await response.json() as { session?: OperatorSession; error?: string };
      if (!response.ok || body.session === undefined) {
        throw new Error(body.error ?? "create session failed");
      }
      setSelectedSessionId(body.session.sessionId);
      setComposerValue("");
      await refresh();
    } catch (error) {
      setClientError(formatError(error));
    }
  }, [apiBase, refresh]);

  const sendMessage = useCallback(async () => {
    if (apiBase === null || composerValue.trim() === "") {
      return;
    }
    setIsSending(true);
    try {
      const response = await fetch(endpoint(apiBase, `/api/local-console/sessions/${encodeURIComponent(selectedSessionId)}/messages`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: composerValue }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "send failed");
      }
      setComposerValue("");
      await refresh();
    } catch (error) {
      setClientError(formatError(error));
    } finally {
      setIsSending(false);
    }
  }, [apiBase, composerValue, refresh, selectedSessionId]);

  const interrupt = useCallback(async (sessionId: string, runId: string) => {
    if (apiBase === null) {
      return;
    }
    try {
      const response = await fetch(endpoint(apiBase, `/api/local-console/sessions/${encodeURIComponent(sessionId)}/interrupt`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "interrupt failed");
      }
      await refresh();
    } catch (error) {
      setClientError(formatError(error));
    }
  }, [apiBase, refresh]);

  const openDiagnostics = useMemo(() => {
    if (window.agentMoebius?.openStatusPage === undefined) {
      return undefined;
    }
    return () => {
      void window.agentMoebius?.openStatusPage?.();
    };
  }, []);

  return (
    <OperatorConsole
      project={project}
      selectedSessionId={state?.selectedSessionId ?? selectedSessionId}
      selectedSession={selectedSession}
      messages={messages}
      activeRun={activeRun}
      composerValue={composerValue}
      runnerStatus={runnerStatus}
      sqlitePath={sqlitePath}
      lastError={lastError}
      onComposerChange={setComposerValue}
      onSend={sendMessage}
      onCreateSession={createSession}
      onSelectSession={setSelectedSessionId}
      onInterrupt={interrupt}
      onOpenDiagnostics={openDiagnostics}
      isSending={isSending}
    />
  );
}

const emptyProject: OperatorProject = {
  projectId: "local",
  title: "agent-moebius",
  sessions: [],
  runningCount: 0,
  waitingCount: 0,
  stuckCount: 0,
  errorCount: 0,
};

function endpoint(base: string, path: string): URL {
  return new URL(path.replace(/^\//u, ""), base.endsWith("/") ? base : `${base}/`);
}

function readQueryApiBase(): string | null {
  const value = new URLSearchParams(window.location.search).get("api");
  return value?.trim() || null;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
