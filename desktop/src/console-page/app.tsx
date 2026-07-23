import "@agent-moebius/console-ui/globals.css";

import {
  OperatorConsole,
  resolveNewConversationAgentTeamKey,
  type AgentTeamInformationInput,
  type AgentTeamDetailState,
  type AgentTeamMemberEditorState,
  type AgentTeamSaveAllFailureView,
  type OperatorMessage,
  type OperatorAgentTeam,
  type OperatorAgentTeamsState,
  type OperatorChildSessionSummary,
  type OperatorEditAndResendTarget,
  type OperatorProject,
  type OperatorProcessOutputState,
  type OperatorRunSnapshot,
  type OperatorRunnerStatus,
  type OperatorSession,
  type RightSidebarTabsState,
  hasBlockingComposerAttachment,
  readyComposerAttachmentIds,
  type OperatorWorkspaceDiffSummary,
} from "@agent-moebius/console-ui";
import type {
  AgentTeamDuplicateBuiltInRequest,
  AgentTeamDuplicateUserRequest,
  AgentTeamListItem,
  AgentTeamListResponse,
  AgentTeamCreateRequest,
  AgentTeamMemberAddRequest,
  AgentTeamMemberAddResponse,
  AgentTeamMemberDocument,
  AgentTeamMemberDuplicateRequest,
  AgentTeamMemberRequest,
  AgentTeamMemberWriteRequest,
  AgentTeamMemberTrashRequest,
  AgentTeamPrimaryAgentWriteRequest,
  AgentTeamUpdateInformationRequest,
  AgentTeamTrashUserRequest,
} from "../team-ipc.js";
import type { AgentTeamRelocateRequest, AgentTeamRepairRequest } from "../team-repair-ipc.js";
import type { AgentTeamFileManagerRequest } from "../team-file-manager.js";
import type {
  LastUsedAgentTeam,
  SuccessfulConversationAgentTeamRequest,
} from "../team-conversation-preference.js";
import type {
  AgentTeamExternalChangeRequest,
  AgentTeamExternalChangeResponse,
} from "../team-external-change.js";
import { tryParseAgentMarkdownIdentity } from "../team-model.js";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  acknowledgeDisplayedResult,
  ConsoleStateActions,
  ConsoleStateCoordinator,
  loadProcessOutput,
  processOutputRunId,
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
  clearConsoleSelectionPreference,
  decideConsoleSelectionCommit,
  isSameConsoleSelection,
  readConsoleSelectionPreference,
  writeConsoleSelectionPreference,
} from "./selection-preference.js";
import {
  canSubmitNewConversation,
  createNewConversationDraft,
  reduceNewConversationDraft,
  submitNewConversation,
} from "./new-conversation.js";
import {
  createConversationDraftStore,
  NEW_CONVERSATION_DRAFT_KEY,
  sessionDraftKey,
} from "./draft-store.js";
import {
  readRightSidebarVisibilityPreference,
  readRightSidebarWidthPreference,
  writeRightSidebarVisibilityPreference,
  writeRightSidebarWidthPreference,
  type RightSidebarVisibilityPreference,
} from "./right-sidebar-preference.js";
import { createRightSidebarTabsStore } from "./right-sidebar-tabs-store.js";
import {
  applyAgentTeamMemberExternalChange,
  clearAgentTeamMemberExternalChange,
  discardAgentTeamMemberDraft,
  discardAllAgentTeamDrafts,
  EMPTY_AGENT_TEAM_DRAFT_STATE,
  failAgentTeamMemberLoad,
  failAgentTeamMemberSave,
  finishAgentTeamMemberLoad,
  finishAgentTeamMemberSave,
  getAgentTeamKey,
  getDirtyAgentTeamMemberSlugs,
  getAgentTeamMemberDraft,
  isAgentTeamMemberDirty,
  loadAgentTeamMemberExternalVersion,
  reconcileAgentTeamSelection,
  removeAgentTeamDrafts,
  removeAgentTeamMemberDraft,
  saveAllAgentTeamDrafts,
  startAgentTeamMemberLoad,
  startAgentTeamMemberExternalOverwrite,
  startAgentTeamMemberSave,
  updateAgentTeamMemberDraft,
  type AgentTeamDraftState,
  type AgentTeamSaveAllFailure,
  type AgentTeamSelection,
} from "./team-state.js";
import {
  useManagedAttachmentDrafts,
  useMessagesWithAttachmentPreviews,
} from "./use-managed-attachments.js";
import { interruptLocalConsoleRun } from "./interrupt.js";
import { refillStoppedRunDraft } from "./edit-resend.js";
import type { CopySessionLogPathResult } from "../session-log-clipboard.js";

interface DesktopApi {
  getLocalConsoleUrl?: () => Promise<string | null>;
  getLocalConsoleAttachmentCapability?: () => Promise<string | null>;
  copySessionLogPath?: (sessionId: string) => Promise<CopySessionLogPathResult>;
  onStatus?: (listener: (snapshot: DesktopStatusSnapshot) => void) => () => void;
  openStatusPage?: () => Promise<void>;
  selectProjectFolder?: () => Promise<string | null>;
  selectFolderForRepair?: (projectId: string) => Promise<string | null>;
  showInFolder?: (folderPath: string) => Promise<void>;
  readonly agentTeamFileManagerLabel?: string;
  openAgentTeamLocation?: (request: AgentTeamFileManagerRequest) => Promise<void>;
  listAgentTeams?: () => Promise<AgentTeamListResponse>;
  createAgentTeam?: (request: AgentTeamCreateRequest) => Promise<AgentTeamListItem>;
  readAgentTeamMember?: (request: AgentTeamMemberRequest) => Promise<AgentTeamMemberDocument>;
  writeAgentTeamMember?: (request: AgentTeamMemberWriteRequest) => Promise<AgentTeamMemberDocument>;
  addAgentTeamMember?: (request: AgentTeamMemberAddRequest) => Promise<AgentTeamMemberAddResponse>;
  updateAgentTeamInformation?: (request: AgentTeamUpdateInformationRequest) => Promise<AgentTeamListItem>;
  setAgentTeamPrimaryAgent?: (request: AgentTeamPrimaryAgentWriteRequest) => Promise<AgentTeamListItem>;
  duplicateBuiltInAgentTeam?: (request: AgentTeamDuplicateBuiltInRequest) => Promise<AgentTeamListItem>;
  duplicateUserAgentTeam?: (request: AgentTeamDuplicateUserRequest) => Promise<AgentTeamListItem>;
  duplicateAgentTeamMember?: (request: AgentTeamMemberDuplicateRequest) => Promise<AgentTeamMemberAddResponse>;
  trashAgentTeamMember?: (request: AgentTeamMemberTrashRequest) => Promise<AgentTeamListItem>;
  trashUserAgentTeam?: (request: AgentTeamTrashUserRequest) => Promise<void>;
  checkAgentTeamMemberExternalChange?: (
    request: AgentTeamExternalChangeRequest,
  ) => Promise<AgentTeamExternalChangeResponse>;
  selectAgentTeamRelocationFolder?: () => Promise<string | null>;
  relocateAgentTeamRecord?: (request: AgentTeamRelocateRequest) => Promise<AgentTeamListItem>;
  removeAgentTeamRecord?: (request: AgentTeamRepairRequest) => Promise<void>;
  readLastUsedAgentTeam?: () => Promise<LastUsedAgentTeam | null>;
  recordSuccessfulConversationAgentTeam?: (
    request: SuccessfulConversationAgentTeamRequest,
  ) => Promise<LastUsedAgentTeam>;
  openExternalLink?: (url: string) => Promise<void>;
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
  childSessions: OperatorChildSessionSummary[];
  activeRun: OperatorRunSnapshot | null;
  workspaceDiff: OperatorWorkspaceDiffSummary;
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
  const [attachmentCapability, setAttachmentCapability] = useState<string | null>(null);
  const [initialSelectionPreference] = useState<ConsoleSelection | null>(() =>
    readConsoleSelectionPreference(window.localStorage),
  );
  const [selection, setSelection] = useState<ConsoleSelection>(
    initialSelectionPreference ?? { projectId: "local", sessionId: "default" },
  );
  const selectionRef = useRef(selection);
  const persistedSelectionRef = useRef(initialSelectionPreference);
  const startupSelectionPendingRef = useRef(true);
  const selectionPersistenceEnabledRef = useRef(false);
  const coordinatorRef = useRef(new ConsoleStateCoordinator());
  const [state, setState] = useState<LocalConsoleState | null>(null);
  const conversationDraftStoreRef = useRef(createConversationDraftStore(window.localStorage));
  const rightSidebarTabsStoreRef = useRef(createRightSidebarTabsStore(window.localStorage));
  const [rightSidebarTabs, setRightSidebarTabs] = useState<RightSidebarTabsState>(() =>
    rightSidebarTabsStoreRef.current.read(selection.sessionId),
  );
  const [processOutputs, setProcessOutputs] = useState<Record<string, OperatorProcessOutputState>>({});
  const [composerValue, setComposerValue] = useState(() =>
    conversationDraftStoreRef.current.read(sessionDraftKey(selection.sessionId)),
  );
  const [runnerStatus, setRunnerStatus] = useState<OperatorRunnerStatus>("stopped");
  const [isSending, setIsSending] = useState(false);
  const [selectionMutationKind, setSelectionMutationKind] = useState<SelectionMutationKind | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isProjectMutationPending, setIsProjectMutationPending] = useState(false);
  const [newConversation, dispatchNewConversation] = useReducer(reduceNewConversationDraft, null);
  const [agentTeamsState, setAgentTeamsState] = useState<OperatorAgentTeamsState>({ status: "loading" });
  const [lastUsedAgentTeamKey, setLastUsedAgentTeamKey] = useState<string | null>(null);
  const [agentTeamSelection, setAgentTeamSelection] = useState<AgentTeamSelection | null>(null);
  const [activeAgentTeamKey, setActiveAgentTeamKey] = useState<string | null>(null);
  const [agentTeamDraftState, setAgentTeamDraftState] = useState<AgentTeamDraftState>(EMPTY_AGENT_TEAM_DRAFT_STATE);
  const agentTeamDraftStateRef = useRef(agentTeamDraftState);
  const checkingAgentTeamExternalChangesRef = useRef(new Set<string>());
  const [agentTeamSaveAllFailures, setAgentTeamSaveAllFailures] = useState<AgentTeamSaveAllFailure[]>([]);
  const [primaryAgentChange, setPrimaryAgentChange] = useState<AgentTeamPrimaryAgentChangeState | null>(null);
  const [agentTeamsRefreshNonce, setAgentTeamsRefreshNonce] = useState(0);
  const [sidebarVisibilityPreference, setSidebarVisibilityPreference] = useState<SidebarVisibilityPreference>(() =>
    readSidebarVisibilityPreference(window.localStorage),
  );
  const [rightSidebarVisibilityPreference, setRightSidebarVisibilityPreference] =
    useState<RightSidebarVisibilityPreference>(() => readRightSidebarVisibilityPreference(window.localStorage));
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() =>
    readRightSidebarWidthPreference(window.localStorage),
  );
  const resultAcknowledgementsRef = useRef(new Set<string>());
  const currentAttachmentDraftKey = newConversation === null
    ? sessionDraftKey(selection.sessionId)
    : NEW_CONVERSATION_DRAFT_KEY;
  const reportAttachmentError = useCallback((error: string) => setClientError(error), []);
  const managedAttachments = useManagedAttachmentDrafts({
    apiBase,
    capability: attachmentCapability,
    currentDraftKey: currentAttachmentDraftKey,
    onError: reportAttachmentError,
  });

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
        const [result, lastUsedTeam] = await Promise.all([
          listTeams(),
          window.agentMoebius?.readLastUsedAgentTeam?.().catch(() => null) ?? Promise.resolve(null),
        ]);
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
        setLastUsedAgentTeamKey(lastUsedTeam === null ? null : getAgentTeamIdentityKey(lastUsedTeam));
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

  const checkAgentTeamMemberExternalChange = useCallback(async (teamKey: string, memberSlug: string): Promise<void> => {
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    const current = getAgentTeamMemberDraft(agentTeamDraftStateRef.current, teamKey, memberSlug);
    const checkExternalChange = window.agentMoebius?.checkAgentTeamMemberExternalChange;
    if (
      team?.ownership !== "user"
      || current?.loadStatus !== "ready"
      || current.savedMarkdown === null
      || current.saveStatus === "saving"
      || checkExternalChange === undefined
    ) {
      return;
    }

    const checkKey = `${teamKey}\u0000${memberSlug}`;
    if (checkingAgentTeamExternalChangesRef.current.has(checkKey)) {
      return;
    }
    checkingAgentTeamExternalChangesRef.current.add(checkKey);
    try {
      const result = await checkExternalChange({
        teamId: team.id,
        ownership: team.ownership,
        memberSlug,
        knownAgentMarkdown: current.savedMarkdown,
      });
      if (result.status === "unchanged") {
        commitAgentTeamDraftState(clearAgentTeamMemberExternalChange(
          agentTeamDraftStateRef.current,
          teamKey,
          memberSlug,
        ));
        return;
      }
      if (result.status !== "changed") {
        return;
      }

      const nextState = applyAgentTeamMemberExternalChange(
        agentTeamDraftStateRef.current,
        teamKey,
        memberSlug,
        result.document.agentMarkdown,
      );
      commitAgentTeamDraftState(nextState);
      if (getAgentTeamMemberDraft(nextState, teamKey, memberSlug)?.externalChangeStatus === "reloaded") {
        updateAgentTeamMemberSummary(teamKey, result.document);
      }
    } catch (error) {
      commitAgentTeamDraftState(failAgentTeamMemberLoad(
        agentTeamDraftStateRef.current,
        teamKey,
        memberSlug,
        `无法检查外部修改：${formatError(error)}`,
      ));
    } finally {
      checkingAgentTeamExternalChangesRef.current.delete(checkKey);
    }
  }, [agentTeamsState, commitAgentTeamDraftState, updateAgentTeamMemberSummary]);

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

  const loadAgentTeamMemberExternalChange = useCallback((teamKey: string, memberSlug: string): void => {
    const current = getAgentTeamMemberDraft(agentTeamDraftStateRef.current, teamKey, memberSlug);
    if (current?.externalChangeStatus !== "conflict" || current.externalMarkdown === null) {
      return;
    }
    const externalMarkdown = current.externalMarkdown;
    commitAgentTeamDraftState(loadAgentTeamMemberExternalVersion(
      agentTeamDraftStateRef.current,
      teamKey,
      memberSlug,
    ));
    updateAgentTeamMemberSummary(teamKey, {
      slug: memberSlug,
      agentMarkdown: externalMarkdown,
      ...tryParseAgentMarkdownIdentity(externalMarkdown),
    });
  }, [commitAgentTeamDraftState, updateAgentTeamMemberSummary]);

  const overwriteAgentTeamMemberExternalChange = useCallback(async (
    teamKey: string,
    memberSlug: string,
  ): Promise<void> => {
    commitAgentTeamDraftState(startAgentTeamMemberExternalOverwrite(
      agentTeamDraftStateRef.current,
      teamKey,
      memberSlug,
    ));
    const saving = getAgentTeamMemberDraft(agentTeamDraftStateRef.current, teamKey, memberSlug);
    const requestedMarkdown = saving?.saveRequestedMarkdown;
    if (saving?.saveStatus !== "saving" || requestedMarkdown === null || requestedMarkdown === undefined) {
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

  const activateCopiedAgentTeam = useCallback(async (copiedItem: AgentTeamListItem): Promise<string> => {
    const copiedTeam = toOperatorAgentTeam(copiedItem);
    setAgentTeamsState((current) => current.status !== "ready"
      ? current
      : { status: "ready", teams: [...current.teams, copiedTeam] });

    const memberSlug = copiedTeam.primaryAgentSlug !== null
      && copiedTeam.members.some((member) => member.slug === copiedTeam.primaryAgentSlug)
      ? copiedTeam.primaryAgentSlug
      : copiedTeam.members[0]?.slug ?? null;
    setActiveAgentTeamKey(copiedTeam.teamKey);
    setAgentTeamSelection({ teamKey: copiedTeam.teamKey, memberSlug });
    setAgentTeamSaveAllFailures([]);

    if (memberSlug !== null) {
      commitAgentTeamDraftState(startAgentTeamMemberLoad(
        agentTeamDraftStateRef.current,
        copiedTeam.teamKey,
        memberSlug,
      ));
      try {
        const document = await window.agentMoebius?.readAgentTeamMember?.({
          teamId: copiedTeam.id,
          ownership: copiedTeam.ownership,
          memberSlug,
        });
        if (document === undefined) {
          throw new Error("当前无法读取复制后的 Agent 内容，请稍后重试。");
        }
        commitAgentTeamDraftState(finishAgentTeamMemberLoad(
          agentTeamDraftStateRef.current,
          copiedTeam.teamKey,
          memberSlug,
          document.agentMarkdown,
        ));
      } catch (error) {
        commitAgentTeamDraftState(failAgentTeamMemberLoad(
          agentTeamDraftStateRef.current,
          copiedTeam.teamKey,
          memberSlug,
          formatError(error),
        ));
      }
    }

    return copiedTeam.teamKey;
  }, [commitAgentTeamDraftState]);

  const duplicateBuiltInAgentTeam = useCallback(async (teamKey: string): Promise<string> => {
    const source = findOperatorAgentTeam(agentTeamsState, teamKey);
    const duplicateTeam = window.agentMoebius?.duplicateBuiltInAgentTeam;
    if (source === undefined || source.ownership !== "system" || duplicateTeam === undefined) {
      throw new Error("当前无法复制这支内置团队，请稍后重试。");
    }

    const copiedItem = await duplicateTeam({ teamId: source.id, ownership: "system" });
    return activateCopiedAgentTeam(copiedItem);
  }, [activateCopiedAgentTeam, agentTeamsState]);

  const assertAgentTeamDraftsResolved = useCallback((teamKey: string) => {
    if (getDirtyAgentTeamMemberSlugs(agentTeamDraftStateRef.current, teamKey).length > 0) {
      throw new Error("请先保存或放弃这支团队中未保存的修改。");
    }
  }, []);

  const duplicateUserAgentTeam = useCallback(async (teamKey: string): Promise<string> => {
    assertAgentTeamDraftsResolved(teamKey);
    const source = findOperatorAgentTeam(agentTeamsState, teamKey);
    const duplicateTeam = window.agentMoebius?.duplicateUserAgentTeam;
    if (source === undefined || source.ownership !== "user" || duplicateTeam === undefined) {
      throw new Error("当前无法复制这支用户团队，请稍后重试。");
    }
    const copiedItem = await duplicateTeam({ teamId: source.id, ownership: "user" });
    return activateCopiedAgentTeam(copiedItem);
  }, [activateCopiedAgentTeam, agentTeamsState, assertAgentTeamDraftsResolved]);

  const duplicateAgentTeamMember = useCallback(async (teamKey: string, memberSlug: string): Promise<void> => {
    assertAgentTeamDraftsResolved(teamKey);
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    const duplicateMember = window.agentMoebius?.duplicateAgentTeamMember;
    if (team === undefined || team.ownership !== "user" || duplicateMember === undefined) {
      throw new Error("当前无法复制这个 Agent，请稍后重试。");
    }
    const result = await duplicateMember({
      teamId: team.id,
      ownership: "user",
      memberSlug,
    });
    const updatedTeam = toOperatorAgentTeam(result.team);
    setAgentTeamsState((current) => current.status !== "ready"
      ? current
      : {
          status: "ready",
          teams: current.teams.map((candidate) => candidate.teamKey === teamKey ? updatedTeam : candidate),
        });
    commitAgentTeamDraftState(finishAgentTeamMemberLoad(
      agentTeamDraftStateRef.current,
      teamKey,
      result.member.slug,
      result.member.agentMarkdown,
    ));
    setAgentTeamSelection({ teamKey, memberSlug: result.member.slug });
    setAgentTeamSaveAllFailures([]);
  }, [agentTeamsState, assertAgentTeamDraftsResolved, commitAgentTeamDraftState]);

  const trashAgentTeamMember = useCallback(async (teamKey: string, memberSlug: string): Promise<void> => {
    assertAgentTeamDraftsResolved(teamKey);
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    const trashMember = window.agentMoebius?.trashAgentTeamMember;
    if (team === undefined || team.ownership !== "user" || trashMember === undefined) {
      throw new Error("当前无法删除这个 Agent，请稍后重试。");
    }
    if (team.primaryAgentSlug === memberSlug) {
      throw new Error("删除主 Agent 前，请先指定另一名有效成员作为主 Agent。");
    }
    const updatedItem = await trashMember({ teamId: team.id, ownership: "user", memberSlug });
    const updatedTeam = toOperatorAgentTeam(updatedItem);
    setAgentTeamsState((current) => current.status !== "ready"
      ? current
      : {
          status: "ready",
          teams: current.teams.map((candidate) => candidate.teamKey === teamKey ? updatedTeam : candidate),
        });
    commitAgentTeamDraftState(removeAgentTeamMemberDraft(
      agentTeamDraftStateRef.current,
      teamKey,
      memberSlug,
    ));
    const nextMemberSlug = updatedTeam.primaryAgentSlug !== null
      && updatedTeam.members.some((member) => member.slug === updatedTeam.primaryAgentSlug)
      ? updatedTeam.primaryAgentSlug
      : updatedTeam.members[0]?.slug ?? null;
    setAgentTeamSelection({ teamKey, memberSlug: nextMemberSlug });
    setAgentTeamSaveAllFailures([]);
    if (nextMemberSlug !== null) {
      void loadAgentTeamMember(teamKey, nextMemberSlug);
    }
  }, [agentTeamsState, assertAgentTeamDraftsResolved, commitAgentTeamDraftState, loadAgentTeamMember]);

  const trashUserAgentTeam = useCallback(async (teamKey: string): Promise<void> => {
    assertAgentTeamDraftsResolved(teamKey);
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    const trashTeam = window.agentMoebius?.trashUserAgentTeam;
    if (team === undefined || team.ownership !== "user" || trashTeam === undefined) {
      throw new Error("当前无法把这支团队移到系统废纸篓，请稍后重试。");
    }
    await trashTeam({ teamId: team.id, ownership: "user" });
    const remainingTeams = agentTeamsState.status === "ready"
      ? agentTeamsState.teams.filter((candidate) => candidate.teamKey !== teamKey)
      : [];
    setAgentTeamsState({ status: "ready", teams: remainingTeams });
    commitAgentTeamDraftState(removeAgentTeamDrafts(agentTeamDraftStateRef.current, teamKey));
    const fallbackTeam = remainingTeams[0];
    const fallbackMemberSlug = fallbackTeam === undefined
      ? null
      : fallbackTeam.primaryAgentSlug !== null
          && fallbackTeam.members.some((member) => member.slug === fallbackTeam.primaryAgentSlug)
        ? fallbackTeam.primaryAgentSlug
        : fallbackTeam.members[0]?.slug ?? null;
    setAgentTeamSelection(fallbackTeam === undefined
      ? null
      : { teamKey: fallbackTeam.teamKey, memberSlug: fallbackMemberSlug });
    setActiveAgentTeamKey(null);
    setAgentTeamSaveAllFailures([]);
    setPrimaryAgentChange(null);
  }, [agentTeamsState, assertAgentTeamDraftsResolved, commitAgentTeamDraftState]);

  const createAgentTeam = useCallback(async (
    information: AgentTeamInformationInput,
  ): Promise<OperatorAgentTeam> => {
    const createTeam = window.agentMoebius?.createAgentTeam;
    if (createTeam === undefined) {
      throw new Error("当前无法创建团队，请稍后重试。");
    }
    const created = toOperatorAgentTeam(await createTeam(information));
    setAgentTeamsState((current) => current.status !== "ready"
      ? current
      : { status: "ready", teams: [...current.teams, created] });
    setActiveAgentTeamKey(created.teamKey);
    setAgentTeamSelection({ teamKey: created.teamKey, memberSlug: null });
    setAgentTeamSaveAllFailures([]);
    setPrimaryAgentChange(null);
    return created;
  }, []);

  const addAgentTeamMember = useCallback(async (teamKey: string): Promise<void> => {
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    const addMember = window.agentMoebius?.addAgentTeamMember;
    if (team === undefined || addMember === undefined) {
      throw new Error("当前无法添加 Agent，请稍后重试。");
    }
    const result = await addMember({ teamId: team.id, ownership: team.ownership });
    const updatedTeam = toOperatorAgentTeam(result.team);
    setAgentTeamsState((current) => current.status !== "ready"
      ? current
      : {
          status: "ready",
          teams: current.teams.map((candidate) => candidate.teamKey === teamKey ? updatedTeam : candidate),
        });
    commitAgentTeamDraftState(finishAgentTeamMemberLoad(
      agentTeamDraftStateRef.current,
      teamKey,
      result.member.slug,
      result.member.agentMarkdown,
    ));
    setAgentTeamSelection({ teamKey, memberSlug: result.member.slug });
    setAgentTeamSaveAllFailures([]);
  }, [agentTeamsState, commitAgentTeamDraftState]);

  const updateAgentTeamInformation = useCallback(async (
    teamKey: string,
    information: AgentTeamInformationInput,
  ): Promise<void> => {
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    const updateInformation = window.agentMoebius?.updateAgentTeamInformation;
    if (team === undefined || updateInformation === undefined) {
      throw new Error("当前无法修改团队信息，请稍后重试。");
    }
    const updatedTeam = toOperatorAgentTeam(await updateInformation({
      teamId: team.id,
      ownership: team.ownership,
      ...information,
    }));
    setAgentTeamsState((current) => current.status !== "ready"
      ? current
      : {
          status: "ready",
          teams: current.teams.map((candidate) => candidate.teamKey === teamKey ? updatedTeam : candidate),
      });
  }, [agentTeamsState]);

  const openAgentTeamLocation = useCallback(async (teamKey: string, memberSlug?: string): Promise<void> => {
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    const openLocation = window.agentMoebius?.openAgentTeamLocation;
    if (team === undefined || openLocation === undefined) {
      throw new Error("暂时无法打开这个位置，请稍后重试。");
    }
    await openLocation({
      teamId: team.id,
      ownership: team.ownership,
      ...(memberSlug === undefined ? {} : { memberSlug }),
    });
  }, [agentTeamsState]);

  const relocateAgentTeam = useCallback(async (teamKey: string): Promise<void> => {
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    const selectFolder = window.agentMoebius?.selectAgentTeamRelocationFolder;
    const relocateRecord = window.agentMoebius?.relocateAgentTeamRecord;
    if (team === undefined || team.ownership !== "user" || selectFolder === undefined || relocateRecord === undefined) {
      throw new Error("当前无法重新定位这支团队，请稍后重试。");
    }
    const directory = await selectFolder();
    if (directory === null) {
      return;
    }
    const updated = toOperatorAgentTeam(await relocateRecord({
      teamId: team.id,
      ownership: "user",
      directory,
    }));
    setAgentTeamsState((current) => current.status !== "ready"
      ? current
      : {
          status: "ready",
          teams: current.teams.map((candidate) => candidate.teamKey === teamKey ? updated : candidate),
        });
  }, [agentTeamsState]);

  const removeAgentTeamRecord = useCallback(async (teamKey: string): Promise<void> => {
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    const removeRecord = window.agentMoebius?.removeAgentTeamRecord;
    if (team === undefined || team.ownership !== "user" || removeRecord === undefined) {
      throw new Error("当前无法移除这条团队记录，请稍后重试。");
    }
    await removeRecord({ teamId: team.id, ownership: "user" });
    setAgentTeamsState((current) => current.status !== "ready"
      ? current
      : { status: "ready", teams: current.teams.filter((candidate) => candidate.teamKey !== teamKey) });
    setActiveAgentTeamKey((current) => current === teamKey ? null : current);
    setAgentTeamSelection((current) => current?.teamKey === teamKey ? null : current);
    setAgentTeamSaveAllFailures([]);
    setPrimaryAgentChange(null);
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
        ? tryParseAgentMarkdownIdentity(editor.draftMarkdown, {
            displayName: member.displayName,
            description: member.description,
          })
        : { displayName: member.displayName, description: member.description };
      memberEditors[member.slug] = {
        memberSlug: member.slug,
        loadStatus: editor.loadStatus,
        loadError: editor.loadError,
        draftMarkdown: editor.draftMarkdown,
        isDirty: isAgentTeamMemberDirty(editor),
        saveStatus: editor.saveStatus,
        saveError: editor.saveError,
        externalChangeStatus: editor.externalChangeStatus,
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
    let cancelled = false;
    void window.agentMoebius?.getLocalConsoleAttachmentCapability?.().then((capability) => {
      if (!cancelled) setAttachmentCapability(capability);
    });
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

  const forgetPersistedSelection = useCallback(() => {
    clearConsoleSelectionPreference(window.localStorage);
    persistedSelectionRef.current = null;
  }, []);

  const rememberConfirmedSelection = useCallback((nextSelection: ConsoleSelection) => {
    if (isSameConsoleSelection(persistedSelectionRef.current, nextSelection)) {
      return;
    }
    writeConsoleSelectionPreference(window.localStorage, nextSelection);
    persistedSelectionRef.current = nextSelection;
  }, []);

  const commitConsoleState = useCallback((nextState: LocalConsoleState) => {
    const nextSelection = {
      projectId: nextState.selectedProjectId,
      sessionId: nextState.selectedSessionId,
    };
    const snapshot = {
      ...nextSelection,
      isRootSession: nextState.selectedSession !== null
        && nextState.selectedSession.parentSessionId == null,
    };
    const startupPending = startupSelectionPendingRef.current;
    const decision = decideConsoleSelectionCommit({
      startupPending,
      persistenceEnabled: selectionPersistenceEnabledRef.current,
      remembered: persistedSelectionRef.current,
      snapshot,
    });
    startupSelectionPendingRef.current = false;
    selectionPersistenceEnabledRef.current = decision.persistenceEnabled;

    if (decision.action === "remember") {
      rememberConfirmedSelection(nextSelection);
    } else if (decision.action === "forget" || decision.action === "open-new-conversation") {
      forgetPersistedSelection();
    }
    if (decision.action === "open-new-conversation") {
      dispatchNewConversation({
        type: "open",
        draft: createNewConversationDraft({
          teamKey: null,
          draft: conversationDraftStoreRef.current.read(NEW_CONVERSATION_DRAFT_KEY),
        }),
      });
    }

    setState(nextState);
  }, [forgetPersistedSelection, rememberConfirmedSelection]);

  useEffect(() => {
    setRightSidebarTabs(rightSidebarTabsStoreRef.current.read(selection.sessionId));
    setProcessOutputs({});
  }, [selection.sessionId]);

  const activeRightSidebarTab = rightSidebarTabs.tabs.find(
    (tab) => tab.id === rightSidebarTabs.activeTabId,
  ) ?? null;
  const activeProcessSourceKey = activeRightSidebarTab?.type === "run-output"
    ? activeRightSidebarTab.sourceKey
    : null;

  useEffect(() => {
    if (apiBase === null || activeProcessSourceKey === null) {
      return;
    }
    const runId = processOutputRunId(activeProcessSourceKey, selection.sessionId);
    if (runId === null) {
      return;
    }

    const controller = new AbortController();
    let inFlight = false;
    let timer: number | null = null;
    setProcessOutputs((current) => ({
      ...current,
      [activeProcessSourceKey]: current[activeProcessSourceKey]?.status === "ready"
        ? current[activeProcessSourceKey]!
        : { status: "loading" },
    }));
    const refreshProcessOutput = async (): Promise<void> => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      try {
        const output = await loadProcessOutput({
          apiBase,
          sessionId: selection.sessionId,
          runId,
          fetch,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setProcessOutputs((current) => ({
            ...current,
            [activeProcessSourceKey]: { status: "ready", output },
          }));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setProcessOutputs((current) => ({
            ...current,
            [activeProcessSourceKey]: { status: "error", message: formatError(error) },
          }));
        }
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) {
          timer = window.setTimeout(() => void refreshProcessOutput(), 1_000);
        }
      }
    };
    void refreshProcessOutput();
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      controller.abort("process-output-tab-changed");
    };
  }, [activeProcessSourceKey, apiBase, selection.sessionId]);

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
      commitState: commitConsoleState,
      commitSelection,
      setError: setClientError,
      mutationOwner,
    });
  }, [apiBase, commitConsoleState, commitSelection]);

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
    if (newConversation === null) {
      setComposerValue(conversationDraftStoreRef.current.read(sessionDraftKey(selection.sessionId)));
    }
  }, [newConversation, selection.sessionId]);

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
  const messagesWithPreviews = useMessagesWithAttachmentPreviews({
    messages,
    apiBase,
    capability: attachmentCapability,
  });
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
    clearComposer: (sessionId) => {
      const targetSessionId = sessionId ?? selectionRef.current.sessionId;
      conversationDraftStoreRef.current.clear(sessionDraftKey(targetSessionId));
      if (selectionRef.current.sessionId === targetSessionId) setComposerValue("");
    },
    getAttachmentIds: () => readyComposerAttachmentIds(managedAttachments.attachments),
    clearAttachments: (sessionId) => managedAttachments.clearDraft(sessionDraftKey(sessionId)),
    setMutationKind: setSelectionMutationKind,
    setSending: setIsSending,
    setError: setClientError,
    selectProjectFolder: window.agentMoebius?.selectProjectFolder === undefined
      ? undefined
      : () => window.agentMoebius!.selectProjectFolder!(),
  }), [apiBase, commitSelection, composerValue, managedAttachments, refresh]);

  const editAndResend = useCallback((target: OperatorEditAndResendTarget) => {
    if (state === null) {
      return;
    }
    const targetSessionId = target.sessionId;
    setClientError(null);
    void refillStoppedRunDraft({
      messages: state.messages,
      stoppedMessageId: target.stoppedMessageId,
      stoppedRunId: target.runId,
      sessionId: targetSessionId,
      replaceAttachments: managedAttachments.replaceWithMessageAttachments,
      persistBody: (body) => {
        const draftKey = sessionDraftKey(targetSessionId);
        conversationDraftStoreRef.current.write(draftKey, body);
        if (selectionRef.current.sessionId === targetSessionId) {
          setComposerValue(body);
        }
      },
    }).catch((error: unknown) => setClientError(formatError(error)));
  }, [managedAttachments.replaceWithMessageAttachments, state]);

  const preferredNewConversationTeamKey = useMemo(() => resolveNewConversationAgentTeamKey(
    agentTeamsState.status === "ready" ? agentTeamsState.teams : [],
    lastUsedAgentTeamKey,
  ), [agentTeamsState, lastUsedAgentTeamKey]);

  useEffect(() => {
    if (newConversation === null || agentTeamsState.status !== "ready") {
      return;
    }
    const selectionIsUsable = agentTeamsState.teams.some(
      (team) => team.teamKey === newConversation.teamKey && team.canCreateConversation,
    );
    if (!selectionIsUsable && newConversation.teamKey !== preferredNewConversationTeamKey) {
      dispatchNewConversation({ type: "select-team", teamKey: preferredNewConversationTeamKey });
    }
  }, [agentTeamsState, newConversation, preferredNewConversationTeamKey]);

  const startNewConversation = useCallback((projectId?: string) => {
    const selectedProject = projectId === undefined
      ? undefined
      : projects.find((candidate) => candidate.projectId === projectId
        && candidate.directoryAvailable !== false
        && candidate.newConversationDisabledReason == null);
    setClientError(null);
    dispatchNewConversation({
      type: "open",
      draft: createNewConversationDraft({
        projectId: selectedProject?.projectId,
        workspaceMode: selectedProject?.worktreeMode === true ? "worktree" : "direct",
        teamKey: preferredNewConversationTeamKey,
        draft: conversationDraftStoreRef.current.read(NEW_CONVERSATION_DRAFT_KEY),
      }),
    });
  }, [preferredNewConversationTeamKey, projects]);

  const createConversation = useCallback(async (): Promise<void> => {
    if (newConversation === null || !canSubmitNewConversation({
      projectId: newConversation.projectId,
      workspaceMode: newConversation.workspaceMode,
      teamKey: newConversation.teamKey,
      draft: newConversation.draft,
      isSubmitting: newConversation.isSubmitting,
      error: newConversation.error,
      readyAttachmentCount: readyComposerAttachmentIds(managedAttachments.attachments).length,
      hasBlockingAttachments: hasBlockingComposerAttachment(managedAttachments.attachments),
    })) {
      return;
    }
    const projectId = newConversation.projectId!;
    const teamKey = newConversation.teamKey!;
    const team = findOperatorAgentTeam(agentTeamsState, teamKey);
    if (team === undefined || !team.canCreateConversation) {
      dispatchNewConversation({
        type: "submit-failed",
        error: "所选 Agent 团队当前不能用于新建对话。",
      });
      return;
    }

    dispatchNewConversation({ type: "submit-started" });
    const recordSuccessfulTeam = window.agentMoebius?.recordSuccessfulConversationAgentTeam;
    const result = await submitNewConversation({
      projectId,
      workspaceMode: newConversation.workspaceMode,
      initialMessage: newConversation.draft,
      team: { teamId: team.id, ownership: team.ownership },
      createSessionWithFirstMessage: (targetProjectId, initialMessage, selectedTeam, workspaceMode) =>
        actions.createSessionWithFirstMessage(targetProjectId, initialMessage, {
          ownership: selectedTeam.ownership,
          id: selectedTeam.teamId,
        }, workspaceMode, readyComposerAttachmentIds(managedAttachments.attachments)),
      recordSuccessfulTeam: recordSuccessfulTeam === undefined
        ? async () => undefined
        : (request) => recordSuccessfulTeam(request),
    });
    if (!result.created) {
      dispatchNewConversation({
        type: "submit-failed",
        error: "创建失败，请检查当前项目和 Agent 团队后重试。",
      });
      return;
    }

    selectionPersistenceEnabledRef.current = true;
    rememberConfirmedSelection({ projectId, sessionId: result.sessionId });
    conversationDraftStoreRef.current.clear(NEW_CONVERSATION_DRAFT_KEY);
    managedAttachments.clearDraft(NEW_CONVERSATION_DRAFT_KEY);
    setComposerValue(conversationDraftStoreRef.current.read(sessionDraftKey(result.sessionId)));
    dispatchNewConversation({ type: "close" });
    if (result.preferenceRecorded) {
      setLastUsedAgentTeamKey(team.teamKey);
      setClientError(null);
    } else {
      setClientError(`会话已创建，但无法记住本次使用的 Agent 团队：${formatError(result.preferenceError)}`);
    }
  }, [actions, agentTeamsState, managedAttachments, newConversation, rememberConfirmedSelection]);

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
      if (wasCurrentProject) {
        selectionPersistenceEnabledRef.current = false;
        forgetPersistedSelection();
      }
      await refresh(selectionRef.current);
      if (wasCurrentProject) {
        startNewConversation();
      }
      setClientError(null);
    } catch (error) {
      setClientError(formatError(error));
      throw error;
    } finally {
      setIsProjectMutationPending(false);
    }
  }, [apiBase, forgetPersistedSelection, refresh, startNewConversation]);

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
      await interruptLocalConsoleRun({
        apiBase,
        sessionId,
        runId,
        fetch,
        refresh: () => refresh(selectionRef.current),
      });
      setClientError(null);
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

  const setRightSidebarOpen = useCallback((open: boolean) => {
    const preference = open ? "open" : "closed";
    setRightSidebarVisibilityPreference(preference);
    writeRightSidebarVisibilityPreference(window.localStorage, preference);
  }, []);

  const changeRightSidebarWidth = useCallback((width: number) => {
    setRightSidebarWidth(width);
    writeRightSidebarWidthPreference(window.localStorage, width);
  }, []);

  const changeRightSidebarTabs = useCallback((nextState: RightSidebarTabsState) => {
    const sessionId = selectionRef.current.sessionId;
    rightSidebarTabsStoreRef.current.write(sessionId, nextState);
    setRightSidebarTabs(nextState);
  }, []);

  return (
    <OperatorConsole
      project={project}
      projects={projects}
      selectedProjectId={selection.projectId}
      selectedSessionId={selection.sessionId}
      selectedSession={selectedSession}
      messages={messagesWithPreviews}
      childSessions={state?.childSessions ?? []}
      activeRun={activeRun}
      workspaceDiff={state?.workspaceDiff ?? { available: false, fileCount: null, reason: "unavailable" }}
      composerValue={composerValue}
      composerAttachments={managedAttachments.attachments}
      runnerStatus={runnerStatus}
      sqlitePath={sqlitePath}
      lastError={lastError}
      projectListState={projectListState}
      agentTeamsState={agentTeamsState}
      lastUsedAgentTeamKey={lastUsedAgentTeamKey}
      conversationAgentTeamKey={selectedSession?.agentTeamOwnership != null && selectedSession.agentTeamId != null
        ? `${selectedSession.agentTeamOwnership}:${selectedSession.agentTeamId}`
        : null}
      selectedAgentTeamKey={agentTeamSelection?.teamKey}
      selectedAgentTeamMemberSlug={agentTeamSelection?.memberSlug}
      agentTeamDetailState={agentTeamDetailState}
      newConversation={newConversation === null ? null : {
        selectedProjectId: newConversation.projectId,
        selectedWorkspaceMode: newConversation.workspaceMode,
        selectedTeamKey: newConversation.teamKey,
        draft: newConversation.draft,
        isSubmitting: newConversation.isSubmitting,
        error: newConversation.error ?? clientError,
      }}
      onComposerChange={(value) => {
        conversationDraftStoreRef.current.write(sessionDraftKey(selectionRef.current.sessionId), value);
        setComposerValue(value);
      }}
      onComposerFilesAdded={managedAttachments.addFiles}
      onComposerAttachmentRemove={managedAttachments.remove}
      onComposerAttachmentRetry={managedAttachments.retry}
      onSend={actions.sendMessage}
      onStartNewConversation={startNewConversation}
      onNewConversationProjectChange={(projectId) => {
        setClientError(null);
        dispatchNewConversation({ type: "select-project", projectId });
        const selectedProject = projects.find((candidate) => candidate.projectId === projectId);
        dispatchNewConversation({
          type: "select-workspace",
          workspaceMode: selectedProject?.worktreeMode === true ? "worktree" : "direct",
        });
      }}
      onNewConversationWorkspaceChange={(workspaceMode) => {
        dispatchNewConversation({ type: "select-workspace", workspaceMode });
      }}
      onNewConversationTeamChange={(teamKey) => {
        dispatchNewConversation({ type: "select-team", teamKey });
      }}
      onNewConversationDraftChange={(value) => {
        conversationDraftStoreRef.current.write(NEW_CONVERSATION_DRAFT_KEY, value);
        dispatchNewConversation({ type: "edit-draft", draft: value });
      }}
      onSubmitNewConversation={() => void createConversation()}
      onAddNewConversationProject={() => {
        void actions.addProject(projects.map((candidate) => candidate.projectId)).then((added) => {
          if (added !== null) {
            setClientError(null);
            dispatchNewConversation({ type: "select-project", projectId: added.projectId });
            dispatchNewConversation({ type: "select-workspace", workspaceMode: "direct" });
          }
        });
      }}
      onReorderProjects={actions.reorderProjects}
      onChangeSessionWorkspace={actions.changeSessionWorkspace}
      onChangeSessionTeam={(sessionId, team) => actions.changeSessionTeam(sessionId, {
        ownership: team.ownership,
        id: team.id,
      })}
      onSelectSession={(nextSelection) => {
        selectionPersistenceEnabledRef.current = true;
        dispatchNewConversation({ type: "close" });
        setComposerValue(conversationDraftStoreRef.current.read(sessionDraftKey(nextSelection.sessionId)));
        setRightSidebarTabs(rightSidebarTabsStoreRef.current.read(nextSelection.sessionId));
        actions.selectSession(nextSelection);
      }}
      onChangeSessionProject={actions.rebindSessionProject}
      onShowProjectInFolder={showProjectInFolder}
      onRenameProject={renameProject}
      onRemoveProject={removeProject}
      onSelectFolderForRepair={selectFolderForRepair}
      onRepairProjectFolder={repairProjectFolder}
      onArchiveSession={actions.archiveSession}
      onCopySessionLogPath={async (sessionId) => {
        const copySessionLogPath = window.agentMoebius?.copySessionLogPath;
        if (copySessionLogPath === undefined) {
          return { ok: false, reason: "service-unavailable" };
        }
        return copySessionLogPath(sessionId);
      }}
      onInterrupt={interrupt}
      onEditAndResend={editAndResend}
      onOpenDiagnostics={openDiagnostics}
      onOpenExternalLink={window.agentMoebius?.openExternalLink === undefined
        ? undefined
        : (url) => {
          void window.agentMoebius?.openExternalLink?.(url).catch((error: unknown) => {
            setClientError(error instanceof Error ? error.message : String(error));
          });
        }}
      onRetryProjectList={() => {
        setClientError(null);
        void refresh(selectionRef.current);
      }}
      onRetryAgentTeams={() => setAgentTeamsRefreshNonce((current) => current + 1)}
      onCreateAgentTeam={createAgentTeam}
      onOpenAgentTeam={openAgentTeam}
      onCloseAgentTeam={() => {
        setActiveAgentTeamKey(null);
        setAgentTeamSaveAllFailures([]);
        setPrimaryAgentChange(null);
      }}
      onSelectAgentTeamMember={selectAgentTeamMember}
      onChangeAgentTeamPrimaryAgent={changeAgentTeamPrimaryAgent}
      onAddAgentTeamMember={addAgentTeamMember}
      onUpdateAgentTeamInformation={updateAgentTeamInformation}
      onChangeAgentTeamMember={(teamKey, memberSlug, agentMarkdown) => {
        commitAgentTeamDraftState(updateAgentTeamMemberDraft(
          agentTeamDraftStateRef.current,
          teamKey,
          memberSlug,
          agentMarkdown,
        ));
      }}
      onSaveAgentTeamMember={saveAgentTeamMember}
      onCheckAgentTeamMemberExternalChange={checkAgentTeamMemberExternalChange}
      onLoadAgentTeamMemberExternalVersion={loadAgentTeamMemberExternalChange}
      onOverwriteAgentTeamMemberExternalVersion={overwriteAgentTeamMemberExternalChange}
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
      onDuplicateBuiltInAgentTeam={duplicateBuiltInAgentTeam}
      onRecheckAgentTeam={() => setAgentTeamsRefreshNonce((current) => current + 1)}
      onRelocateAgentTeam={relocateAgentTeam}
      onRemoveAgentTeamRecord={removeAgentTeamRecord}
      agentTeamFileManagerLabel={window.agentMoebius?.agentTeamFileManagerLabel ?? "在文件管理器中打开"}
      onOpenAgentTeamLocation={openAgentTeamLocation}
      onDuplicateUserAgentTeam={duplicateUserAgentTeam}
      onDuplicateAgentTeamMember={duplicateAgentTeamMember}
      onTrashAgentTeamMember={trashAgentTeamMember}
      onTrashUserAgentTeam={trashUserAgentTeam}
      isSending={isSending}
      isSelectionMutationPending={selectionMutationKind !== null}
      isSessionProjectUpdating={selectionMutationKind === "rebind-session"}
      isProjectMutationPending={isProjectMutationPending}
      sidebarOpen={sidebarVisibilityPreference === "open"}
      isFirstRunOnboarding={isFirstRunOnboarding(state?.projects ?? null)}
      onSidebarOpenChange={setSidebarOpen}
      rightSidebarOpen={rightSidebarVisibilityPreference === "open"}
      rightSidebarWidth={rightSidebarWidth}
      rightSidebarTabs={rightSidebarTabs}
      processOutputs={processOutputs}
      onRightSidebarOpenChange={setRightSidebarOpen}
      onRightSidebarWidthChange={changeRightSidebarWidth}
      onRightSidebarTabsChange={changeRightSidebarTabs}
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
  branchName: null,
  isGitRepository: false,
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
    members: team.members.map((member) => ({ ...member, available: member.available !== false })),
    status: team.status,
    canCreateConversation: team.canCreateConversation,
    issues: team.issues,
  };
}

function getAgentTeamIdentityKey(team: LastUsedAgentTeam): string {
  return `${team.ownership}:${team.teamId}`;
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
