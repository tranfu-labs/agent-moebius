import "@agent-moebius/console-ui/globals.css";

import {
  OperatorConsole,
  type OperatorMessage,
  type OperatorProject,
  type OperatorRunSnapshot,
  type OperatorRunnerStatus,
  type OperatorSession,
} from "@agent-moebius/console-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  acknowledgeDisplayedResult,
  ConsoleStateActions,
  ConsoleStateCoordinator,
  refreshConsoleState,
  type ConsoleSelection,
  type SelectionMutationKind,
  type SelectionMutationToken,
} from "./state-sync.js";
import {
  isFirstRunOnboarding,
  readSidebarVisibilityPreference,
  writeSidebarVisibilityPreference,
  type SidebarVisibilityPreference,
} from "./sidebar-preference.js";

interface DesktopApi {
  getLocalConsoleUrl?: () => Promise<string | null>;
  onStatus?: (listener: (snapshot: DesktopStatusSnapshot) => void) => () => void;
  openStatusPage?: () => Promise<void>;
  selectProjectFolder?: () => Promise<string | null>;
  selectFolderForRepair?: (projectId: string) => Promise<string | null>;
  showInFolder?: (folderPath: string) => Promise<void>;
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
  projects: OperatorProject[];
  project: OperatorProject;
  selectedProjectId: string;
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
  const [selection, setSelection] = useState<ConsoleSelection>({ projectId: "local", sessionId: "default" });
  const selectionRef = useRef(selection);
  const coordinatorRef = useRef(new ConsoleStateCoordinator());
  const [state, setState] = useState<LocalConsoleState | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [runnerStatus, setRunnerStatus] = useState<OperatorRunnerStatus>("stopped");
  const [isSending, setIsSending] = useState(false);
  const [selectionMutationKind, setSelectionMutationKind] = useState<SelectionMutationKind | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isProjectMutationPending, setIsProjectMutationPending] = useState(false);
  const [isNewConversationWithoutProject, setIsNewConversationWithoutProject] = useState(false);
  const [sidebarVisibilityPreference, setSidebarVisibilityPreference] = useState<SidebarVisibilityPreference>(() =>
    readSidebarVisibilityPreference(window.localStorage),
  );
  const resultAcknowledgementsRef = useRef(new Set<string>());

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

  const commitSelection = useCallback((nextSelection: ConsoleSelection) => {
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
  }, []);

  const refresh = useCallback(async (
    targetSelection: ConsoleSelection,
    mutationOwner?: SelectionMutationToken,
  ): Promise<boolean> => {
    if (apiBase === null) {
      return false;
    }
    return refreshConsoleState<LocalConsoleState>({
      apiBase,
      selection: targetSelection,
      coordinator: coordinatorRef.current,
      fetch,
      readSelection: (nextState) => ({
        projectId: nextState.selectedProjectId,
        sessionId: nextState.selectedSessionId,
      }),
      commitState: setState,
      commitSelection,
      setError: setClientError,
      mutationOwner,
    });
  }, [apiBase, commitSelection]);

  useEffect(() => {
    void refresh(selectionRef.current);
    const timer = window.setInterval(() => {
      if (!coordinatorRef.current.isSelectionMutationPending) {
        void refresh(selectionRef.current);
      }
    }, 1_000);
    return () => {
      window.clearInterval(timer);
      coordinatorRef.current.invalidateRefresh();
    };
  }, [refresh]);

  useEffect(() => {
    if (apiBase === null || state === null || state.selectedSession === null || state.selectedSession.unreadSince === null) {
      return;
    }
    const { sessionId, unreadSince } = state.selectedSession;
    const latestResultIsDisplayed = state.messages.some(
      (message) => message.speaker === "agent" && message.createdAt >= unreadSince,
    );
    if (!latestResultIsDisplayed) {
      return;
    }
    const acknowledgementKey = `${sessionId}:${unreadSince}`;
    if (resultAcknowledgementsRef.current.has(acknowledgementKey)) {
      return;
    }
    resultAcknowledgementsRef.current.add(acknowledgementKey);
    void acknowledgeDisplayedResult({ apiBase, sessionId, unreadSince, fetch })
      .then(async () => {
        await refresh(selectionRef.current);
      })
      .catch((error: unknown) => {
        resultAcknowledgementsRef.current.delete(acknowledgementKey);
        setClientError(formatError(error));
      });
  }, [apiBase, refresh, state]);

  const project = state?.project ?? emptyProject;
  const projects = state?.projects ?? [project];
  const lastError = clientError ?? state?.lastError ?? null;
  const selectedSession = state?.selectedSession ?? null;
  const messages = state?.messages ?? [];
  const activeRun = state?.activeRun ?? null;
  const sqlitePath = state?.sqlitePath;

  const actions = useMemo(() => new ConsoleStateActions({
    apiBase,
    coordinator: coordinatorRef.current,
    fetch,
    getSelection: () => selectionRef.current,
    commitSelection,
    refresh,
    composerValue,
    clearComposer: () => setComposerValue(""),
    setMutationKind: setSelectionMutationKind,
    setSending: setIsSending,
    setError: setClientError,
    selectProjectFolder: window.agentMoebius?.selectProjectFolder === undefined
      ? undefined
      : () => window.agentMoebius!.selectProjectFolder!(),
  }), [apiBase, commitSelection, composerValue, refresh]);

  const toggleProjectWorktree = useCallback(async (projectId: string, worktreeMode: boolean) => {
    if (apiBase === null) {
      setClientError("local console server unavailable");
      return;
    }
    try {
      const response = await fetch(endpoint(apiBase, `/api/local-console/projects/${encodeURIComponent(projectId)}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ worktreeMode }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "update project failed");
      }
      await refresh(selectionRef.current);
    } catch (error) {
      setClientError(formatError(error));
    }
  }, [apiBase, refresh]);

  const showProjectInFolder = useCallback(async (folderPath: string) => {
    try {
      if (window.agentMoebius?.showInFolder === undefined) {
        throw new Error("desktop file manager unavailable");
      }
      await window.agentMoebius.showInFolder(folderPath);
      setClientError(null);
    } catch (error) {
      setClientError(formatError(error));
    }
  }, []);

  const renameProject = useCallback(async (projectId: string, title: string) => {
    if (apiBase === null) {
      throw new Error("local console server unavailable");
    }
    setIsProjectMutationPending(true);
    try {
      const response = await fetch(endpoint(apiBase, `/api/local-console/projects/${encodeURIComponent(projectId)}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "rename project failed");
      }
      await refresh(selectionRef.current);
      setClientError(null);
    } catch (error) {
      setClientError(formatError(error));
      throw error;
    } finally {
      setIsProjectMutationPending(false);
    }
  }, [apiBase, refresh]);

  const removeProject = useCallback(async (projectId: string, force: boolean) => {
    if (apiBase === null) {
      throw new Error("local console server unavailable");
    }
    setIsProjectMutationPending(true);
    const wasCurrentProject = selectionRef.current.projectId === projectId;
    try {
      const response = await fetch(endpoint(apiBase, `/api/local-console/projects/${encodeURIComponent(projectId)}`), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "remove project failed");
      }
      await refresh(selectionRef.current);
      if (wasCurrentProject) {
        setIsNewConversationWithoutProject(true);
      }
      setClientError(null);
    } catch (error) {
      setClientError(formatError(error));
      throw error;
    } finally {
      setIsProjectMutationPending(false);
    }
  }, [apiBase, refresh]);

  const selectFolderForRepair = useCallback(async (projectId: string): Promise<string | null> => {
    if (window.agentMoebius?.selectFolderForRepair === undefined) {
      throw new Error("desktop repair folder picker unavailable");
    }
    return window.agentMoebius.selectFolderForRepair(projectId);
  }, []);

  const repairProjectFolder = useCallback(async (projectId: string, folderPath: string) => {
    if (apiBase === null) {
      throw new Error("local console server unavailable");
    }
    setIsProjectMutationPending(true);
    try {
      const response = await fetch(endpoint(apiBase, `/api/local-console/projects/${encodeURIComponent(projectId)}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderPath }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "repair project folder failed");
      }
      await refresh(selectionRef.current);
      setClientError(null);
    } catch (error) {
      setClientError(formatError(error));
      throw error;
    } finally {
      setIsProjectMutationPending(false);
    }
  }, [apiBase, refresh]);

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
      await refresh(selectionRef.current);
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

  const setSidebarOpen = useCallback((open: boolean) => {
    const preference = open ? "open" : "closed";
    setSidebarVisibilityPreference(preference);
    writeSidebarVisibilityPreference(window.localStorage, preference);
  }, []);

  return (
    <OperatorConsole
      project={project}
      projects={projects}
      selectedProjectId={selection.projectId}
      selectedSessionId={selection.sessionId}
      selectedSession={selectedSession}
      messages={messages}
      activeRun={activeRun}
      composerValue={composerValue}
      runnerStatus={runnerStatus}
      sqlitePath={sqlitePath}
      lastError={lastError}
      onComposerChange={setComposerValue}
      onSend={actions.sendMessage}
      onOpenProject={actions.openProject}
      onReorderProjects={actions.reorderProjects}
      onToggleProjectWorktree={toggleProjectWorktree}
      onSelectSession={(nextSelection) => {
        setIsNewConversationWithoutProject(false);
        actions.selectSession(nextSelection);
      }}
      onChangeSessionProject={actions.rebindSessionProject}
      onShowProjectInFolder={showProjectInFolder}
      onRenameProject={renameProject}
      onRemoveProject={removeProject}
      onSelectFolderForRepair={selectFolderForRepair}
      onRepairProjectFolder={repairProjectFolder}
      onArchiveSession={actions.archiveSession}
      onInterrupt={interrupt}
      onOpenDiagnostics={openDiagnostics}
      isSending={isSending}
      isSelectionMutationPending={selectionMutationKind !== null}
      isSessionProjectUpdating={selectionMutationKind === "rebind-session"}
      isProjectMutationPending={isProjectMutationPending}
      isNewConversationWithoutProject={isNewConversationWithoutProject}
      sidebarOpen={sidebarVisibilityPreference === "open"}
      isFirstRunOnboarding={isFirstRunOnboarding(state?.projects ?? null)}
      onSidebarOpenChange={setSidebarOpen}
    />
  );
}

const emptyProject: OperatorProject = {
  projectId: "local",
  sourceType: "local-folder",
  title: "agent-moebius",
  folderPath: "",
  worktreeMode: false,
  workspaceCwd: null,
  workspaceMode: null,
  worktreePath: null,
  worktreeUnavailableReason: null,
  workspaceUpdatedAt: null,
  directoryAvailable: true,
  directoryUnavailableReason: null,
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
