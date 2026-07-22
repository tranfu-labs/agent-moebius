import { contextBridge, ipcRenderer } from "electron";
import type { DesktopStatusSnapshot } from "./status.js";
import {
  getAgentTeamFileManagerLabel,
  TEAM_FILE_MANAGER_IPC_CHANNEL,
  type AgentTeamFileManagerRequest,
} from "./team-file-manager.js";
import {
  TEAM_EXTERNAL_CHANGE_IPC_CHANNEL,
  type AgentTeamExternalChangeRequest,
  type AgentTeamExternalChangeResponse,
} from "./team-external-change.js";
import {
  TEAM_IPC_CHANNELS,
  type AgentTeamCreateRequest,
  type AgentTeamDuplicateBuiltInRequest,
  type AgentTeamDuplicateUserRequest,
  type AgentTeamListItem,
  type AgentTeamListResponse,
  type AgentTeamMemberDocument,
  type AgentTeamMemberAddRequest,
  type AgentTeamMemberAddResponse,
  type AgentTeamMemberRequest,
  type AgentTeamMemberWriteRequest,
  type AgentTeamMemberDuplicateRequest,
  type AgentTeamMemberTrashRequest,
  type AgentTeamPrimaryAgentWriteRequest,
  type AgentTeamUpdateInformationRequest,
  type AgentTeamTrashUserRequest,
} from "./team-ipc.js";
import {
  TEAM_REPAIR_IPC_CHANNELS,
  type AgentTeamRelocateRequest,
  type AgentTeamRepairRequest,
} from "./team-repair-ipc.js";
import {
  TEAM_CONVERSATION_PREFERENCE_IPC_CHANNELS,
  type LastUsedAgentTeam,
  type SuccessfulConversationAgentTeamRequest,
} from "./team-conversation-preference.js";
import { OPEN_EXTERNAL_LINK_IPC_CHANNEL } from "./external-link.js";

export interface AgentMoebiusDesktopApi {
  onStatus(listener: (snapshot: DesktopStatusSnapshot) => void): () => void;
  getLocalConsoleUrl(): Promise<string | null>;
  openObserver(): Promise<void>;
  openStatusPage(): Promise<void>;
  openDataRoot(): Promise<void>;
  checkUpdates(): Promise<void>;
  selectProjectFolder(): Promise<string | null>;
  selectFolderForRepair(projectId: string): Promise<string | null>;
  showInFolder(folderPath: string): Promise<void>;
  readonly agentTeamFileManagerLabel: string;
  openAgentTeamLocation(request: AgentTeamFileManagerRequest): Promise<void>;
  listAgentTeams(): Promise<AgentTeamListResponse>;
  createAgentTeam(request: AgentTeamCreateRequest): Promise<AgentTeamListItem>;
  readAgentTeamMember(request: AgentTeamMemberRequest): Promise<AgentTeamMemberDocument>;
  writeAgentTeamMember(request: AgentTeamMemberWriteRequest): Promise<AgentTeamMemberDocument>;
  addAgentTeamMember(request: AgentTeamMemberAddRequest): Promise<AgentTeamMemberAddResponse>;
  updateAgentTeamInformation(request: AgentTeamUpdateInformationRequest): Promise<AgentTeamListItem>;
  setAgentTeamPrimaryAgent(request: AgentTeamPrimaryAgentWriteRequest): Promise<AgentTeamListItem>;
  duplicateBuiltInAgentTeam(request: AgentTeamDuplicateBuiltInRequest): Promise<AgentTeamListItem>;
  duplicateUserAgentTeam(request: AgentTeamDuplicateUserRequest): Promise<AgentTeamListItem>;
  duplicateAgentTeamMember(request: AgentTeamMemberDuplicateRequest): Promise<AgentTeamMemberAddResponse>;
  trashAgentTeamMember(request: AgentTeamMemberTrashRequest): Promise<AgentTeamListItem>;
  trashUserAgentTeam(request: AgentTeamTrashUserRequest): Promise<void>;
  checkAgentTeamMemberExternalChange(
    request: AgentTeamExternalChangeRequest,
  ): Promise<AgentTeamExternalChangeResponse>;
  selectAgentTeamRelocationFolder(): Promise<string | null>;
  relocateAgentTeamRecord(request: AgentTeamRelocateRequest): Promise<AgentTeamListItem>;
  removeAgentTeamRecord(request: AgentTeamRepairRequest): Promise<void>;
  readLastUsedAgentTeam(): Promise<LastUsedAgentTeam | null>;
  recordSuccessfulConversationAgentTeam(
    request: SuccessfulConversationAgentTeamRequest,
  ): Promise<LastUsedAgentTeam>;
  openExternalLink(url: string): Promise<void>;
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
  getLocalConsoleUrl() {
    return ipcRenderer.invoke("local-console:get-url") as Promise<string | null>;
  },
  openObserver() {
    return ipcRenderer.invoke("action:open-observer") as Promise<void>;
  },
  openStatusPage() {
    return ipcRenderer.invoke("action:open-status-page") as Promise<void>;
  },
  openDataRoot() {
    return ipcRenderer.invoke("action:open-data-root") as Promise<void>;
  },
  checkUpdates() {
    return ipcRenderer.invoke("action:check-updates") as Promise<void>;
  },
  selectProjectFolder() {
    return ipcRenderer.invoke("project:select-folder") as Promise<string | null>;
  },
  selectFolderForRepair(projectId) {
    return ipcRenderer.invoke("project:select-folder-for-repair", projectId) as Promise<string | null>;
  },
  showInFolder(folderPath) {
    return ipcRenderer.invoke("project:show-in-folder", folderPath) as Promise<void>;
  },
  agentTeamFileManagerLabel: getAgentTeamFileManagerLabel(process.platform),
  openAgentTeamLocation(request) {
    return ipcRenderer.invoke(TEAM_FILE_MANAGER_IPC_CHANNEL, request) as Promise<void>;
  },
  listAgentTeams() {
    return ipcRenderer.invoke(TEAM_IPC_CHANNELS.list) as Promise<AgentTeamListResponse>;
  },
  createAgentTeam(request) {
    return ipcRenderer.invoke(TEAM_IPC_CHANNELS.create, request) as Promise<AgentTeamListItem>;
  },
  readAgentTeamMember(request) {
    return ipcRenderer.invoke(TEAM_IPC_CHANNELS.readMember, request) as Promise<AgentTeamMemberDocument>;
  },
  writeAgentTeamMember(request) {
    return ipcRenderer.invoke(TEAM_IPC_CHANNELS.writeMember, request) as Promise<AgentTeamMemberDocument>;
  },
  addAgentTeamMember(request) {
    return ipcRenderer.invoke(TEAM_IPC_CHANNELS.addMember, request) as Promise<AgentTeamMemberAddResponse>;
  },
  updateAgentTeamInformation(request) {
    return ipcRenderer.invoke(TEAM_IPC_CHANNELS.updateInformation, request) as Promise<AgentTeamListItem>;
  },
  setAgentTeamPrimaryAgent(request) {
    return ipcRenderer.invoke(TEAM_IPC_CHANNELS.setPrimaryAgent, request) as Promise<AgentTeamListItem>;
  },
  duplicateBuiltInAgentTeam(request) {
    return ipcRenderer.invoke(TEAM_IPC_CHANNELS.duplicateBuiltIn, request) as Promise<AgentTeamListItem>;
  },
  duplicateUserAgentTeam(request) {
    return ipcRenderer.invoke(TEAM_IPC_CHANNELS.duplicateUser, request) as Promise<AgentTeamListItem>;
  },
  duplicateAgentTeamMember(request) {
    return ipcRenderer.invoke(TEAM_IPC_CHANNELS.duplicateMember, request) as Promise<AgentTeamMemberAddResponse>;
  },
  trashAgentTeamMember(request) {
    return ipcRenderer.invoke(TEAM_IPC_CHANNELS.trashMember, request) as Promise<AgentTeamListItem>;
  },
  trashUserAgentTeam(request) {
    return ipcRenderer.invoke(TEAM_IPC_CHANNELS.trashUserTeam, request) as Promise<void>;
  },
  checkAgentTeamMemberExternalChange(request) {
    return ipcRenderer.invoke(
      TEAM_EXTERNAL_CHANGE_IPC_CHANNEL,
      request,
    ) as Promise<AgentTeamExternalChangeResponse>;
  },
  selectAgentTeamRelocationFolder() {
    return ipcRenderer.invoke(TEAM_REPAIR_IPC_CHANNELS.selectRelocationFolder) as Promise<string | null>;
  },
  relocateAgentTeamRecord(request) {
    return ipcRenderer.invoke(TEAM_REPAIR_IPC_CHANNELS.relocate, request) as Promise<AgentTeamListItem>;
  },
  removeAgentTeamRecord(request) {
    return ipcRenderer.invoke(TEAM_REPAIR_IPC_CHANNELS.removeRecord, request) as Promise<void>;
  },
  readLastUsedAgentTeam() {
    return ipcRenderer.invoke(
      TEAM_CONVERSATION_PREFERENCE_IPC_CHANNELS.readLastUsed,
    ) as Promise<LastUsedAgentTeam | null>;
  },
  recordSuccessfulConversationAgentTeam(request) {
    return ipcRenderer.invoke(
      TEAM_CONVERSATION_PREFERENCE_IPC_CHANNELS.recordSuccessful,
      request,
    ) as Promise<LastUsedAgentTeam>;
  },
  openExternalLink(url) {
    return ipcRenderer.invoke(OPEN_EXTERNAL_LINK_IPC_CHANNEL, url) as Promise<void>;
  },
};

contextBridge.exposeInMainWorld("agentMoebius", api);
