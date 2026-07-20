import "@agent-moebius/console-ui/globals.css";

import {
  OperatorConsole,
  type AgentTeamDetailState,
  type AgentTeamMemberEditorState,
  type AgentTeamSaveAllFailureView,
  type OperatorMessage,
  type OperatorAgentTeam,
  type OperatorAgentTeamsState,
  type OperatorProject,
  type OperatorRunSnapshot,
  type OperatorRunnerStatus,
  type OperatorSession,
} from "@agent-moebius/console-ui";
import type {
  AgentTeamListItem,
  AgentTeamListResponse,
  AgentTeamMemberDocument,
  AgentTeamMemberRequest,
  AgentTeamMemberWriteRequest,
  AgentTeamPrimaryAgentWriteRequest,
} from "../team-ipc.js";
import { parseAgentMarkdownIdentity } from "../team-model.js";
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
import {
  discardAgentTeamMemberDraft,
  discardAllAgentTeamDrafts,
  EMPTY_AGENT_TEAM_DRAFT_STATE,
  failAgentTeamMemberLoad,
  failAgentTeamMemberSave,
  finishAgentTeamMemberLoad,
  finishAgentTeamMemberSave,
  getAgentTeamKey,
  getAgentTeamMemberDraft,
  isAgentTeamMemberDirty,
  reconcileAgentTeamSelection,
  saveAllAgentTeamDrafts,
  startAgentTeamMemberLoad,
  startAgentTeamMemberSave,
  updateAgentTeamMemberDraft,
  type AgentTeamDraftState,
  type AgentTeamSaveAllFailure,
  type AgentTeamSelection,
} from "./team-state.js";

interface DesktopApi {
  getLocalConsoleUrl?: () => Promise<string | null>;
  onStatus?: (listener: (snapshot: DesktopStatusSnapshot) => void) => () => void;
  openStatusPage?: () => Promise<void>;
  selectProjectFolder?: () => Promise<string | null>;
  selectFolderForRepair?: (projectId: string) => Promise<string | null>;
  showInFolder?: (folderPath: string) => Promise<void>;
  listAgentTeams?: () => Promise<AgentTeamListResponse>;
  readAgentTeamMember?: (request: AgentTeamMemberRequest) => Promise<AgentTeamMemberDocument>;
  writeAgentTeamMember?: (request: AgentTeamMemberWriteRequest) => Promise<AgentTeamMemberDocument>;
  setAgentTeamPrimaryAgent?: (request: AgentTeamPrimaryAgentWriteRequest) => Promise<AgentTeamListItem>;
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

interface AgentTeamPrimaryAgentChangeState {
  teamKey: string;
  status: "saving" | "saved" | "failed";
  error: string | null;
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
  const [agentTeamsState, setAgentTeamsState] = useState<OperatorAgentTeamsState>({ status: "loading" });
  const [agentTeamSelection, setAgentTeamSelection] = useState<AgentTeamSelection | null>(null);
  const [activeAgentTeamKey, setActiveAgentTeamKey] = useState<string | null>(null);
  const [agentTeamDraftState, setAgentTeamDraftState] = useState<AgentTeamDraftState>(EMPTY_AGENT_TEAM_DRAFT_STATE);
  const agentTeamDraftStateRef = useRef(agentTeamDraftState);
  const [agentTeamSaveAllFailures, setAgentTeamSaveAllFailures] = useState<AgentTeamSaveAllFailure[]>([]);
  const [primaryAgentChange, setPrimaryAgentChange] = useState<AgentTeamPrimaryAgentChangeState | null>(null);
  const [agentTeamsRefreshNonce, setAgentTeamsRefreshNonce] = useState(0);
  const [sidebarVisibilityPreference, setSidebarVisibilityPreference] = useState<SidebarVisibilityPreference>(() =>
    readSidebarVisibilityPreference(window.localStorage),
  );
  const resultAcknowledgementsRef = useRef(new Set<string>());

  const commitAgentTeamDraftState = useCallback((nextState: AgentTeamDraftState) => {
    agentTeamDraftStateRef.current = nextState;
    setAgentTeamDraftState(nextState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTimer: number | undefined;

    async function loadTeams(): Promise<void> {
      const listTeams = window.agentMoebius?.listAgentTeams;
      if (listTeams === undefined) {
        if (!cancelled) {
          setAgentTeamsState({ status: "error" });
        }
        return;
      }

      try {
        const result = await listTeams();
        if (cancelled) {
          return;
        }
        if (result.status === "loading") {
          setAgentTeamsState({ status: "loading" });
          loadingTimer = window.setTimeout(() => void loadTeams(), 250);
          return;
        }
        if (result.status === "configuration-error") {
          setAgentTeamsState({ status: "configuration-error" });
          setAgentTeamSelection(null);
          return;
        }

        setAgentTeamsState({ status: "ready", teams: result.teams.map(toOperatorAgentTeam) });
        setAgentTeamSelection((current) => reconcileAgentTeamSelection(result.teams, current));
      } catch {
        if (!cancelled) {
          setAgentTeamsState({ status: "error" });
        }
      }
    }

    setAgentTeamsState({ status: "loading" });
    void loadTeams();
    return () => {
      cancelled = true;
      if (loadingTimer !== undefined) {
        window.clearTimeout(loadingTimer);
      }
    };
  }, [agentTeamsRefreshNonce]);

  const loadAgentTeamMember = useCallback(async (teamKey: string, memberSlug: string) => {
    const current = getAgentTeamMemberDraft(agentTeamDraftStateRef.current, teamKey, memberSlug);
    if (current?.loadStatus === "ready" || current?.loadStatus === "loading") {
      return;
    }

    commitAgentTeamDraftState(startAgentTeamMemberLoad(agentTeamDraftStateRef.current, teamKey, memberSlug));
    try {
      const team = findOperatorAgentTeam(agentTeamsState, teamKey);
      const readMember = window.agentMoebius?.readAgentTeamMember;
      if (team === undefined || readMember === undefined) {
        throw new Error("当前无法读取 Agent 内容，请稍后重试。");
      }
      const document = await readMember({ teamId: team.id, ownership: team.ownership, memberSlug });
      commitAgentTeamDraftState(finishAgentTeamMemberLoad(
        agentTeamDraftStateRef.current,
        teamKey,
        memberSlug,
        document.agentMarkdown,
      ));
    } catch (error) {
      commitAgentTeamDraftState(failAgentTeamMemberLoad(
        agentTeamDraftStateRef.current,
        teamKey,
        memberSlug,
        formatError(error),
      ));
    }
  }, [agentTeamsState, commitAgentTeamDraftState]);

  const updateAgentTeamMemberSummary = useCallback((teamKey: string, document: AgentTeamMemberDocument) => {
    setAgentTeamsState((current) => current.status !== "ready"
      ? current
      : {
          status: "ready",
          teams: current.teams.map((team) => team.teamKey !== teamKey
            ? team
            : {
                ...team,
                members: team.members.map((member) => member.slug === document.slug
                  ? {
                      slug: document.slug,
                      displayName: document.displayName,
                      description: document.description,
                    }
                  : member),
              }),
        });
  }, []);

  const persistAgentTeamMember = useCallback(async (
    teamKey: string,
    memberSlug: string,
    agentMarkdown: string,
  ): Promise<AgentTeamMemberDocument> => {
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    const writeMember = window.agentMoebius?.writeAgentTeamMember;
    if (team === undefined || writeMember === undefined) {
      throw new Error("当前无法保存 Agent 内容，请稍后重试。");
    }
    const document = await writeMember({
      teamId: team.id,
      ownership: team.ownership,
      memberSlug,
      agentMarkdown,
    });
    updateAgentTeamMemberSummary(teamKey, document);
    return document;
  }, [agentTeamsState, updateAgentTeamMemberSummary]);

  const saveAgentTeamMember = useCallback(async (teamKey: string, memberSlug: string): Promise<void> => {
    const current = getAgentTeamMemberDraft(agentTeamDraftStateRef.current, teamKey, memberSlug);
    if (!isAgentTeamMemberDirty(current) || current?.saveStatus === "saving") {
      return;
    }
    commitAgentTeamDraftState(startAgentTeamMemberSave(agentTeamDraftStateRef.current, teamKey, memberSlug));
    const saving = getAgentTeamMemberDraft(agentTeamDraftStateRef.current, teamKey, memberSlug);
    const requestedMarkdown = saving?.saveRequestedMarkdown;
    if (requestedMarkdown === null || requestedMarkdown === undefined) {
      return;
    }

    try {
      const document = await persistAgentTeamMember(teamKey, memberSlug, requestedMarkdown);
      commitAgentTeamDraftState(finishAgentTeamMemberSave(
        agentTeamDraftStateRef.current,
        teamKey,
        memberSlug,
        document.agentMarkdown,
      ));
      setAgentTeamSaveAllFailures((currentFailures) =>
        currentFailures.filter((failure) => failure.memberSlug !== memberSlug));
    } catch (error) {
      commitAgentTeamDraftState(failAgentTeamMemberSave(
        agentTeamDraftStateRef.current,
        teamKey,
        memberSlug,
        formatError(error),
      ));
    }
  }, [commitAgentTeamDraftState, persistAgentTeamMember]);

  const saveAllDraftsAndLeave = useCallback(async (
    teamKey: string,
  ): Promise<{ failures: AgentTeamSaveAllFailureView[] }> => {
    const result = await saveAllAgentTeamDrafts({
      state: agentTeamDraftStateRef.current,
      teamKey,
      saveMember: async (memberSlug, agentMarkdown) => {
        const document = await persistAgentTeamMember(teamKey, memberSlug, agentMarkdown);
        return document.agentMarkdown;
      },
      onTransition: commitAgentTeamDraftState,
    });
    commitAgentTeamDraftState(result.state);
    setAgentTeamSaveAllFailures(result.failures);
    return { failures: result.failures };
  }, [commitAgentTeamDraftState, persistAgentTeamMember]);

  const openAgentTeam = useCallback((teamKey: string) => {
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    if (team === undefined) {
      return;
    }
    const currentMemberSlug = agentTeamSelection?.teamKey === teamKey
      && agentTeamSelection.memberSlug !== null
      && team.members.some((member) => member.slug === agentTeamSelection.memberSlug)
      ? agentTeamSelection.memberSlug
      : team.primaryAgentSlug !== null && team.members.some((member) => member.slug === team.primaryAgentSlug)
        ? team.primaryAgentSlug
        : team.members[0]?.slug ?? null;
    setActiveAgentTeamKey(teamKey);
    setAgentTeamSelection({ teamKey, memberSlug: currentMemberSlug });
    setAgentTeamSaveAllFailures([]);
    if (currentMemberSlug !== null) {
      void loadAgentTeamMember(teamKey, currentMemberSlug);
    }
  }, [agentTeamSelection, agentTeamsState, loadAgentTeamMember]);

  const selectAgentTeamMember = useCallback((teamKey: string, memberSlug: string) => {
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    if (team === undefined || !team.members.some((member) => member.slug === memberSlug)) {
      return;
    }
    setAgentTeamSelection({ teamKey, memberSlug });
    void loadAgentTeamMember(teamKey, memberSlug);
  }, [agentTeamsState, loadAgentTeamMember]);

  const changeAgentTeamPrimaryAgent = useCallback(async (teamKey: string, memberSlug: string): Promise<void> => {
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    const setPrimaryAgent = window.agentMoebius?.setAgentTeamPrimaryAgent;
    if (team === undefined || team.ownership !== "user" || setPrimaryAgent === undefined) {
      return;
    }
    if (team.primaryAgentSlug === memberSlug || !team.members.some((member) => member.slug === memberSlug)) {
      return;
    }

    setPrimaryAgentChange({ teamKey, status: "saving", error: null });
    try {
      const updatedTeam = await setPrimaryAgent({
        teamId: team.id,
        ownership: team.ownership,
        primaryAgentSlug: memberSlug,
      });
      setAgentTeamsState((current) => current.status !== "ready"
        ? current
        : {
            status: "ready",
            teams: current.teams.map((candidate) => candidate.teamKey === teamKey
              ? toOperatorAgentTeam(updatedTeam)
              : candidate),
          });
      setPrimaryAgentChange({ teamKey, status: "saved", error: null });
    } catch (error) {
      setPrimaryAgentChange({ teamKey, status: "failed", error: formatError(error) });
    }
  }, [agentTeamsState]);

  const agentTeamDetailState = useMemo<AgentTeamDetailState | null>(() => {
    if (activeAgentTeamKey === null) {
      return null;
    }
    const team = findOperatorAgentTeam(agentTeamsState, activeAgentTeamKey);
    if (team === undefined) {
      return null;
    }
    const selectedMemberSlug = agentTeamSelection?.teamKey === activeAgentTeamKey
      ? agentTeamSelection.memberSlug
      : null;
    const memberEditors: Record<string, AgentTeamMemberEditorState | undefined> = {};
    for (const member of team.members) {
      const editor = getAgentTeamMemberDraft(agentTeamDraftState, activeAgentTeamKey, member.slug);
      if (editor === undefined) {
        continue;
      }
      const identity = editor.loadStatus === "ready"
        ? parseAgentMarkdownIdentity(editor.draftMarkdown)
        : { displayName: member.displayName, description: member.description };
      memberEditors[member.slug] = {
        memberSlug: member.slug,
        loadStatus: editor.loadStatus,
        loadError: editor.loadError,
        draftMarkdown: editor.draftMarkdown,
        isDirty: isAgentTeamMemberDirty(editor),
        saveStatus: editor.saveStatus,
        saveError: editor.saveError,
        displayName: identity.displayName,
        description: identity.description,
      };
    }
    return {
      teamKey: activeAgentTeamKey,
      selectedMemberSlug,
      memberEditors,
      saveAllFailures: agentTeamSaveAllFailures,
      primaryAgentChangeStatus: primaryAgentChange?.teamKey === activeAgentTeamKey
        ? primaryAgentChange.status
        : "idle",
      primaryAgentChangeError: primaryAgentChange?.teamKey === activeAgentTeamKey
        ? primaryAgentChange.error
        : null,
    };
  }, [
    activeAgentTeamKey,
    agentTeamDraftState,
    agentTeamSaveAllFailures,
    agentTeamSelection,
    agentTeamsState,
    primaryAgentChange,
  ]);

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
  const projectListState = state !== null ? "ready" : clientError === null ? "loading" : "error";

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
      projectListState={projectListState}
      agentTeamsState={agentTeamsState}
      selectedAgentTeamKey={agentTeamSelection?.teamKey}
      selectedAgentTeamMemberSlug={agentTeamSelection?.memberSlug}
      agentTeamDetailState={agentTeamDetailState}
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
      onRetryProjectList={() => {
        setClientError(null);
        void refresh(selectionRef.current);
      }}
      onRetryAgentTeams={() => setAgentTeamsRefreshNonce((current) => current + 1)}
      onOpenAgentTeam={openAgentTeam}
      onCloseAgentTeam={() => {
        setActiveAgentTeamKey(null);
        setAgentTeamSaveAllFailures([]);
        setPrimaryAgentChange(null);
      }}
      onSelectAgentTeamMember={selectAgentTeamMember}
      onChangeAgentTeamPrimaryAgent={changeAgentTeamPrimaryAgent}
      onChangeAgentTeamMember={(teamKey, memberSlug, agentMarkdown) => {
        commitAgentTeamDraftState(updateAgentTeamMemberDraft(
          agentTeamDraftStateRef.current,
          teamKey,
          memberSlug,
          agentMarkdown,
        ));
      }}
      onSaveAgentTeamMember={saveAgentTeamMember}
      onRetryAgentTeamMember={(teamKey, memberSlug) => {
        void loadAgentTeamMember(teamKey, memberSlug);
      }}
      onDiscardAgentTeamMember={(teamKey, memberSlug) => {
        commitAgentTeamDraftState(discardAgentTeamMemberDraft(
          agentTeamDraftStateRef.current,
          teamKey,
          memberSlug,
        ));
      }}
      onDiscardAllAgentTeamDrafts={(teamKey) => {
        commitAgentTeamDraftState(discardAllAgentTeamDrafts(agentTeamDraftStateRef.current, teamKey));
        setAgentTeamSaveAllFailures([]);
      }}
      onSaveAllAgentTeamDrafts={saveAllDraftsAndLeave}
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

function toOperatorAgentTeam(team: AgentTeamListItem): OperatorAgentTeam {
  return {
    teamKey: getAgentTeamKey(team),
    id: team.id,
    ownership: team.ownership,
    name: team.definition?.name ?? null,
    description: team.definition?.description ?? null,
    primaryAgentSlug: team.definition?.primaryAgentSlug ?? null,
    memberOrder: team.definition?.memberOrder ?? [],
    members: team.members,
    status: team.status,
    canCreateConversation: team.canCreateConversation,
  };
}

function findOperatorAgentTeam(state: OperatorAgentTeamsState, teamKey: string): OperatorAgentTeam | undefined {
  return state.status === "ready"
    ? state.teams.find((team) => team.teamKey === teamKey)
    : undefined;
}

function readQueryApiBase(): string | null {
  const value = new URLSearchParams(window.location.search).get("api");
  return value?.trim() || null;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
