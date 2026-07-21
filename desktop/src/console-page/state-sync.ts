export interface ConsoleSelection {
  projectId: string;
  sessionId: string;
}

export type SelectionMutationKind = "create-session" | "open-project" | "rebind-session" | "archive-session";

export interface SelectionMutationToken {
  readonly id: number;
  readonly kind: SelectionMutationKind;
}

export interface RefreshLease {
  readonly generation: number;
  readonly controller: AbortController;
  readonly mutationOwner: SelectionMutationToken | null;
}

export class ConsoleStateCoordinator {
  private generation = 0;
  private refreshLease: RefreshLease | null = null;
  private mutationToken: SelectionMutationToken | null = null;
  private nextMutationId = 1;

  beginRefresh(mutationOwner: SelectionMutationToken | null = null): RefreshLease | null {
    if (mutationOwner !== null && this.mutationToken !== mutationOwner) {
      return null;
    }
    if (this.refreshLease !== null) {
      if (mutationOwner === null || this.refreshLease.mutationOwner === mutationOwner) {
        return null;
      }
      this.invalidateRefresh();
    }
    this.generation += 1;
    const lease = {
      generation: this.generation,
      controller: new AbortController(),
      mutationOwner,
    };
    this.refreshLease = lease;
    return lease;
  }

  canCommitRefresh(lease: RefreshLease): boolean {
    return this.refreshLease === lease
      && lease.generation === this.generation
      && lease.mutationOwner === this.mutationToken
      && !lease.controller.signal.aborted;
  }

  completeRefresh(lease: RefreshLease): void {
    if (this.refreshLease === lease) {
      this.refreshLease = null;
    }
  }

  invalidateRefresh(): void {
    this.generation += 1;
    this.refreshLease?.controller.abort("superseded");
    this.refreshLease = null;
  }

  beginSelectionMutation(kind: SelectionMutationKind): SelectionMutationToken | null {
    if (this.mutationToken !== null) {
      return null;
    }
    this.invalidateRefresh();
    const token = { id: this.nextMutationId, kind };
    this.nextMutationId += 1;
    this.mutationToken = token;
    return token;
  }

  endSelectionMutation(token: SelectionMutationToken): boolean {
    if (this.mutationToken !== token) {
      return false;
    }
    this.mutationToken = null;
    return true;
  }

  get mutationKind(): SelectionMutationKind | null {
    return this.mutationToken?.kind ?? null;
  }

  get isSelectionMutationPending(): boolean {
    return this.mutationToken !== null;
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface RefreshConsoleStateOptions<TState> {
  apiBase: string;
  selection: ConsoleSelection;
  coordinator: ConsoleStateCoordinator;
  fetch: FetchLike;
  readSelection(state: TState): ConsoleSelection;
  commitState(state: TState): void;
  commitSelection(selection: ConsoleSelection): void;
  setError(error: string | null): void;
  mutationOwner?: SelectionMutationToken;
}

export async function refreshConsoleState<TState>(options: RefreshConsoleStateOptions<TState>): Promise<boolean> {
  const lease = options.coordinator.beginRefresh(options.mutationOwner);
  if (lease === null) {
    return false;
  }
  try {
    const url = endpoint(options.apiBase, "/api/local-console/state");
    url.searchParams.set("sessionId", options.selection.sessionId);
    url.searchParams.set("projectId", options.selection.projectId);
    const fetch = options.fetch;
    const response = await fetch(url, { signal: lease.controller.signal });
    const body = await response.json() as TState | { error?: string };
    if (!response.ok) {
      const error = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : "state request failed";
      throw new Error(error);
    }
    if (!options.coordinator.canCommitRefresh(lease)) {
      return false;
    }
    const nextState = body as TState;
    options.commitState(nextState);
    options.commitSelection(options.readSelection(nextState));
    options.setError(null);
    return true;
  } catch (error) {
    if (options.coordinator.canCommitRefresh(lease)) {
      options.setError(formatError(error));
    }
    return false;
  } finally {
    options.coordinator.completeRefresh(lease);
  }
}

export async function acknowledgeDisplayedResult(options: {
  apiBase: string;
  sessionId: string;
  unreadSince: string;
  fetch: FetchLike;
}): Promise<boolean> {
  const fetch = options.fetch;
  const response = await fetch(
    endpoint(options.apiBase, `/api/local-console/sessions/${encodeURIComponent(options.sessionId)}/read`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unreadSince: options.unreadSince }),
    },
  );
  const body = await response.json() as { cleared?: boolean; error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "mark result read failed");
  }
  return body.cleared === true;
}

export interface CreatedSession {
  sessionId: string;
  agentTeamOwnership?: "system" | "user" | null;
  agentTeamId?: string | null;
}

interface SessionResponse {
  session?: CreatedSession;
  error?: string;
}

interface ProjectResponse {
  project?: {
    projectId: string;
    sessions: Array<{ sessionId: string }>;
  };
  error?: string;
}

interface ProjectOrderResponse {
  projects?: Array<{ projectId: string }>;
  error?: string;
}

interface ArchiveSessionResponse {
  sessionId?: string;
  projectId?: string;
  selectedSessionId?: string | null;
  error?: string;
}

export interface ConsoleStateActionsOptions {
  apiBase: string | null;
  coordinator: ConsoleStateCoordinator;
  fetch: FetchLike;
  getSelection(): ConsoleSelection;
  commitSelection(selection: ConsoleSelection): void;
  refresh(selection: ConsoleSelection, mutationOwner?: SelectionMutationToken): Promise<boolean>;
  composerValue: string;
  clearComposer(): void;
  setMutationKind(kind: SelectionMutationKind | null): void;
  setSending(sending: boolean): void;
  setError(error: string): void;
  selectProjectFolder?: () => Promise<string | null>;
}

export class ConsoleStateActions {
  constructor(private readonly options: ConsoleStateActionsOptions) {}

  readonly createSession = async (
    projectId: string,
    agentTeam?: { ownership: "system" | "user"; id: string },
  ): Promise<CreatedSession | null> => {
    if (this.options.apiBase === null) {
      this.options.setError("local console server unavailable");
      return null;
    }
    const token = this.beginMutation("create-session");
    if (token === null) {
      return null;
    }
    try {
      const fetch = this.options.fetch;
      const response = await fetch(endpoint(this.options.apiBase, "/api/local-console/sessions"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "新会话",
          projectId,
          ...(agentTeam === undefined
            ? {}
            : { agentTeamOwnership: agentTeam.ownership, agentTeamId: agentTeam.id }),
        }),
      });
      const body = await response.json() as SessionResponse;
      if (!response.ok || body.session === undefined) {
        throw new Error(body.error ?? "create session failed");
      }
      const nextSelection = { projectId, sessionId: body.session.sessionId };
      this.options.commitSelection(nextSelection);
      this.options.clearComposer();
      await this.options.refresh(nextSelection, token);
      return body.session;
    } catch (error) {
      this.options.setError(formatError(error));
      return null;
    } finally {
      this.finishMutation(token);
    }
  };

  readonly openProject = async (): Promise<void> => {
    if (this.options.apiBase === null) {
      this.options.setError("local console server unavailable");
      return;
    }
    if (this.options.selectProjectFolder === undefined) {
      this.options.setError("desktop folder picker unavailable");
      return;
    }
    const token = this.beginMutation("open-project");
    if (token === null) {
      return;
    }
    try {
      const folderPath = await this.options.selectProjectFolder();
      if (folderPath === null) {
        return;
      }
      const fetch = this.options.fetch;
      const response = await fetch(endpoint(this.options.apiBase, "/api/local-console/projects"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderPath, worktreeMode: false }),
      });
      const body = await response.json() as ProjectResponse;
      if (!response.ok || body.project === undefined) {
        throw new Error(body.error ?? "open project failed");
      }
      const nextSelection = {
        projectId: body.project.projectId,
        sessionId: body.project.sessions[0]?.sessionId ?? this.options.getSelection().sessionId,
      };
      this.options.commitSelection(nextSelection);
      await this.options.refresh(nextSelection, token);
    } catch (error) {
      this.options.setError(formatError(error));
    } finally {
      this.finishMutation(token);
    }
  };

  readonly selectSession = (nextSelection: ConsoleSelection): void => {
    if (this.options.coordinator.isSelectionMutationPending) {
      return;
    }
    this.options.coordinator.invalidateRefresh();
    this.options.commitSelection(nextSelection);
    void this.options.refresh(nextSelection);
  };

  readonly rebindSessionProject = async (sessionId: string, projectId: string): Promise<void> => {
    if (this.options.apiBase === null || projectId === this.options.getSelection().projectId) {
      return;
    }
    const token = this.beginMutation("rebind-session");
    if (token === null) {
      return;
    }
    try {
      const fetch = this.options.fetch;
      const response = await fetch(
        endpoint(this.options.apiBase, `/api/local-console/sessions/${encodeURIComponent(sessionId)}/project`),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId }),
        },
      );
      const body = await response.json() as SessionResponse;
      if (!response.ok || body.session === undefined) {
        throw new Error(body.error ?? "change session project failed");
      }
      const nextSelection = { projectId, sessionId };
      this.options.commitSelection(nextSelection);
      await this.options.refresh(nextSelection, token);
    } catch (error) {
      this.options.setError(formatError(error));
    } finally {
      this.finishMutation(token);
    }
  };

  readonly reorderProjects = async (projectIds: string[]): Promise<boolean> => {
    if (this.options.apiBase === null || this.options.coordinator.isSelectionMutationPending) {
      if (this.options.apiBase === null) {
        this.options.setError("local console server unavailable");
      }
      return false;
    }
    try {
      const fetch = this.options.fetch;
      const response = await fetch(endpoint(this.options.apiBase, "/api/local-console/projects/order"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectIds }),
      });
      const body = await response.json() as ProjectOrderResponse;
      if (!response.ok || body.projects === undefined) {
        throw new Error(body.error ?? "reorder projects failed");
      }
      await this.options.refresh(this.options.getSelection());
      return true;
    } catch (error) {
      this.options.setError(formatError(error));
      return false;
    }
  };

  readonly archiveSession = async (sessionId: string, projectId: string): Promise<void> => {
    if (this.options.apiBase === null) {
      this.options.setError("local console server unavailable");
      return;
    }
    const token = this.beginMutation("archive-session");
    if (token === null) {
      return;
    }
    try {
      const fetch = this.options.fetch;
      const response = await fetch(
        endpoint(this.options.apiBase, `/api/local-console/sessions/${encodeURIComponent(sessionId)}/archive`),
        { method: "POST" },
      );
      const body = await response.json() as ArchiveSessionResponse;
      if (!response.ok || body.sessionId !== sessionId || body.projectId !== projectId) {
        throw new Error(body.error ?? "archive session failed");
      }
      const currentSelection = this.options.getSelection();
      const nextSelection = currentSelection.sessionId === sessionId
        ? { projectId, sessionId: body.selectedSessionId ?? sessionId }
        : currentSelection;
      this.options.commitSelection(nextSelection);
      await this.options.refresh(nextSelection, token);
    } catch (error) {
      this.options.setError(formatError(error));
    } finally {
      this.finishMutation(token);
    }
  };

  readonly sendMessage = async (): Promise<void> => {
    if (
      this.options.apiBase === null
      || this.options.composerValue.trim() === ""
      || this.options.coordinator.mutationKind === "rebind-session"
    ) {
      return;
    }
    this.options.setSending(true);
    try {
      const selection = this.options.getSelection();
      const fetch = this.options.fetch;
      const response = await fetch(
        endpoint(this.options.apiBase, `/api/local-console/sessions/${encodeURIComponent(selection.sessionId)}/messages`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: this.options.composerValue }),
        },
      );
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "send failed");
      }
      this.options.clearComposer();
      await this.options.refresh(this.options.getSelection());
    } catch (error) {
      this.options.setError(formatError(error));
    } finally {
      this.options.setSending(false);
    }
  };

  private beginMutation(kind: SelectionMutationKind): SelectionMutationToken | null {
    const token = this.options.coordinator.beginSelectionMutation(kind);
    if (token !== null) {
      this.options.setMutationKind(kind);
    }
    return token;
  }

  private finishMutation(token: SelectionMutationToken): void {
    if (this.options.coordinator.endSelectionMutation(token)) {
      this.options.setMutationKind(null);
    }
  }
}

function endpoint(base: string, path: string): URL {
  return new URL(path.replace(/^\//u, ""), base.endsWith("/") ? base : `${base}/`);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
