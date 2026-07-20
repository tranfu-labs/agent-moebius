import { describe, expect, it, vi } from "vitest";
import {
  acknowledgeDisplayedResult,
  ConsoleStateActions,
  ConsoleStateCoordinator,
  refreshConsoleState,
  type ConsoleSelection,
  type SelectionMutationKind,
} from "../src/console-page/state-sync.js";

interface TestState {
  selectedProjectId: string;
  selectedSessionId: string;
}

describe("refreshConsoleState", () => {
  it("keeps a slow periodic refresh single-flight and eventually commits it", async () => {
    const coordinator = new ConsoleStateCoordinator();
    const response = deferred<Response>();
    const fetch = vi.fn(function (this: unknown) {
      expect(this).toBeUndefined();
      return response.promise;
    });
    const committed: TestState[] = [];
    const options = refreshOptions({ coordinator, fetch, committed });

    const slowRefresh = refreshConsoleState(options);
    const nextIntervalTick = await refreshConsoleState(options);

    expect(nextIntervalTick).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    response.resolve(jsonResponse({ selectedProjectId: "project-a", selectedSessionId: "session-a" }));

    await expect(slowRefresh).resolves.toBe(true);
    expect(committed).toEqual([{ selectedProjectId: "project-a", selectedSessionId: "session-a" }]);
  });

  it("drops an old selection response after a mutation and commits the explicit new selection", async () => {
    const coordinator = new ConsoleStateCoordinator();
    const oldResponse = deferred<Response>();
    const newResponse = deferred<Response>();
    const fetch = vi.fn()
      .mockImplementationOnce(() => oldResponse.promise)
      .mockImplementationOnce(() => newResponse.promise);
    const committed: TestState[] = [];
    const oldRefresh = refreshConsoleState(refreshOptions({ coordinator, fetch, committed }));

    const token = coordinator.beginSelectionMutation("rebind-session");
    expect(token).not.toBeNull();
    const nextSelection = { projectId: "project-b", sessionId: "session-a" };
    const newRefresh = refreshConsoleState(refreshOptions({
      coordinator,
      fetch,
      committed,
      selection: nextSelection,
      mutationOwner: token!,
    }));
    newResponse.resolve(jsonResponse({ selectedProjectId: "project-b", selectedSessionId: "session-a" }));
    await expect(newRefresh).resolves.toBe(true);

    oldResponse.resolve(jsonResponse({ selectedProjectId: "project-a", selectedSessionId: "session-a" }));
    await expect(oldRefresh).resolves.toBe(false);
    expect(committed).toEqual([{ selectedProjectId: "project-b", selectedSessionId: "session-a" }]);
    expect(coordinator.endSelectionMutation(token!)).toBe(true);
  });
});

describe("acknowledgeDisplayedResult", () => {
  it("acknowledges the exact unread timestamp after the result is displayed", async () => {
    const fetch = vi.fn(function (this: unknown) {
      expect(this).toBeUndefined();
      return Promise.resolve(jsonResponse({ cleared: true }));
    });

    await expect(acknowledgeDisplayedResult({
      apiBase: "http://127.0.0.1:8787/",
      sessionId: "session/a",
      unreadSince: "2026-07-09T00:00:02.000Z",
      fetch,
    })).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:8787/api/local-console/sessions/session%2Fa/read"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ unreadSince: "2026-07-09T00:00:02.000Z" }),
      }),
    );
  });
});

describe("ConsoleStateActions", () => {
  it("blocks every selection handler and duplicate mutation while create is pending", async () => {
    const coordinator = new ConsoleStateCoordinator();
    const createResponse = deferred<Response>();
    const refreshResponse = deferred<boolean>();
    const fetch = vi.fn(function (this: unknown) {
      expect(this).toBeUndefined();
      return createResponse.promise;
    });
    const refresh = vi.fn(() => refreshResponse.promise);
    const selectProjectFolder = vi.fn(async () => "/tmp/project-c");
    const harness = actionHarness({ coordinator, fetch, refresh, selectProjectFolder });

    const create = harness.actions.createSession("project-b");
    expect(coordinator.mutationKind).toBe("create-session");

    harness.actions.selectSession({ projectId: "project-c", sessionId: "session-c" });
    await harness.actions.createSession("project-c");
    await harness.actions.openProject();
    await harness.actions.rebindSessionProject("session-a", "project-c");

    expect(harness.selection()).toEqual({ projectId: "project-a", sessionId: "session-a" });
    expect(selectProjectFolder).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);

    createResponse.resolve(jsonResponse({ session: { sessionId: "session-b" } }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(harness.selection()).toEqual({ projectId: "project-b", sessionId: "session-b" });
    expect(coordinator.isSelectionMutationPending).toBe(true);

    refreshResponse.resolve(true);
    await create;
    expect(coordinator.isSelectionMutationPending).toBe(false);
    expect(harness.mutationKinds).toEqual(["create-session", null]);
  });

  it("blocks every selection handler and duplicate mutation while folder picking is pending", async () => {
    const coordinator = new ConsoleStateCoordinator();
    const folderPath = deferred<string | null>();
    const projectResponse = deferred<Response>();
    const fetch = vi.fn(() => projectResponse.promise);
    const selectProjectFolder = vi.fn(() => folderPath.promise);
    const harness = actionHarness({ coordinator, fetch, selectProjectFolder });

    const open = harness.actions.openProject();
    expect(coordinator.mutationKind).toBe("open-project");

    harness.actions.selectSession({ projectId: "project-c", sessionId: "session-c" });
    await harness.actions.createSession("project-c");
    await harness.actions.openProject();
    await harness.actions.rebindSessionProject("session-a", "project-c");

    expect(harness.selection()).toEqual({ projectId: "project-a", sessionId: "session-a" });
    expect(selectProjectFolder).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();

    folderPath.resolve("/tmp/project-b");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    projectResponse.resolve(jsonResponse({
      project: { projectId: "project-b", sessions: [{ sessionId: "session-b" }] },
    }));
    await open;

    expect(harness.selection()).toEqual({ projectId: "project-b", sessionId: "session-b" });
    expect(coordinator.isSelectionMutationPending).toBe(false);
  });

  it("blocks every selection handler and duplicate mutation while rebind is pending", async () => {
    const coordinator = new ConsoleStateCoordinator();
    const rebindResponse = deferred<Response>();
    const fetch = vi.fn(() => rebindResponse.promise);
    const selectProjectFolder = vi.fn(async () => "/tmp/project-c");
    const harness = actionHarness({ coordinator, fetch, selectProjectFolder });

    const rebind = harness.actions.rebindSessionProject("session-a", "project-b");
    expect(coordinator.mutationKind).toBe("rebind-session");

    harness.actions.selectSession({ projectId: "project-c", sessionId: "session-c" });
    await harness.actions.createSession("project-c");
    await harness.actions.openProject();
    await harness.actions.rebindSessionProject("session-a", "project-c");

    expect(harness.selection()).toEqual({ projectId: "project-a", sessionId: "session-a" });
    expect(selectProjectFolder).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);

    rebindResponse.resolve(jsonResponse({ session: { sessionId: "session-a" } }));
    await rebind;
    expect(harness.selection()).toEqual({ projectId: "project-b", sessionId: "session-a" });
    expect(coordinator.isSelectionMutationPending).toBe(false);
  });

  it("lets the mutation owner preempt an inserted non-owner refresh", async () => {
    const coordinator = new ConsoleStateCoordinator();
    const rebindResponse = deferred<Response>();
    const oldStateResponse = deferred<Response>();
    const targetStateResponse = deferred<Response>();
    const committed: TestState[] = [];
    const fetch = vi.fn()
      .mockImplementationOnce(() => rebindResponse.promise)
      .mockImplementationOnce(() => oldStateResponse.promise)
      .mockImplementationOnce(() => targetStateResponse.promise);
    let selection: ConsoleSelection = { projectId: "project-a", sessionId: "session-a" };
    const refresh = (target: ConsoleSelection, mutationOwner?: Parameters<ConsoleStateCoordinator["beginRefresh"]>[0]) =>
      refreshConsoleState(refreshOptions({
        coordinator,
        fetch,
        committed,
        selection: target,
        mutationOwner: mutationOwner ?? undefined,
        commitSelection: (nextSelection) => {
          selection = nextSelection;
        },
      }));
    const actions = new ConsoleStateActions({
      apiBase: "http://127.0.0.1:8787/",
      coordinator,
      fetch,
      getSelection: () => selection,
      commitSelection: (nextSelection) => {
        selection = nextSelection;
      },
      refresh,
      composerValue: "draft",
      clearComposer: vi.fn(),
      setMutationKind: vi.fn(),
      setSending: vi.fn(),
      setError: vi.fn(),
    });

    const rebind = actions.rebindSessionProject("session-a", "project-b");
    expect(coordinator.mutationKind).toBe("rebind-session");

    const insertedOldRefresh = refresh({ projectId: "project-a", sessionId: "session-a" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    rebindResponse.resolve(jsonResponse({ session: { sessionId: "session-a" } }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(selection).toEqual({ projectId: "project-b", sessionId: "session-a" });

    targetStateResponse.resolve(jsonResponse({ selectedProjectId: "project-b", selectedSessionId: "session-a" }));
    await expect(rebind).resolves.toBeUndefined();

    oldStateResponse.resolve(jsonResponse({ selectedProjectId: "project-a", selectedSessionId: "session-a" }));
    await expect(insertedOldRefresh).resolves.toBe(false);
    expect(committed).toEqual([{ selectedProjectId: "project-b", selectedSessionId: "session-a" }]);
    expect(selection).toEqual({ projectId: "project-b", sessionId: "session-a" });
  });

  it("keeps the original selection when folder picking is cancelled or rebind fails", async () => {
    const coordinator = new ConsoleStateCoordinator();
    const fetch = vi.fn(async () => jsonResponse({ error: "locked" }, 409));
    const selectProjectFolder = vi.fn(async () => null);
    const harness = actionHarness({ coordinator, fetch, selectProjectFolder });

    await harness.actions.openProject();
    expect(harness.selection()).toEqual({ projectId: "project-a", sessionId: "session-a" });
    expect(fetch).not.toHaveBeenCalled();

    await harness.actions.rebindSessionProject("session-a", "project-b");
    expect(harness.selection()).toEqual({ projectId: "project-a", sessionId: "session-a" });
    expect(harness.errors).toEqual(["locked"]);
    expect(coordinator.isSelectionMutationPending).toBe(false);
  });

  it("keeps the API-confirmed target selection when the follow-up refresh fails", async () => {
    const coordinator = new ConsoleStateCoordinator();
    const fetch = vi.fn(async () => jsonResponse({ session: { sessionId: "session-a" } }));
    const refresh = vi.fn(async () => false);
    const harness = actionHarness({ coordinator, fetch, refresh, composerValue: "draft" });

    await harness.actions.rebindSessionProject("session-a", "project-b");

    expect(harness.selection()).toEqual({ projectId: "project-b", sessionId: "session-a" });
    expect(refresh).toHaveBeenCalledWith(
      { projectId: "project-b", sessionId: "session-a" },
      expect.objectContaining({ kind: "rebind-session" }),
    );
    expect(harness.clearComposer).not.toHaveBeenCalled();
    expect(coordinator.isSelectionMutationPending).toBe(false);
  });

  it("does not send when the send handler is called directly during rebind", async () => {
    const coordinator = new ConsoleStateCoordinator();
    const rebindResponse = deferred<Response>();
    const fetch = vi.fn(() => rebindResponse.promise);
    const harness = actionHarness({ coordinator, fetch, composerValue: "hello" });

    const rebind = harness.actions.rebindSessionProject("session-a", "project-b");
    await harness.actions.sendMessage();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(harness.sending).toEqual([]);
    rebindResponse.resolve(jsonResponse({ session: { sessionId: "session-a" } }));
    await rebind;
  });

  it("only lets the mutation token owner release the pending gate", () => {
    const coordinator = new ConsoleStateCoordinator();
    const owner = coordinator.beginSelectionMutation("create-session");
    expect(owner).not.toBeNull();
    expect(coordinator.beginSelectionMutation("open-project")).toBeNull();
    expect(coordinator.beginSelectionMutation("rebind-session")).toBeNull();
    expect(coordinator.endSelectionMutation({ id: 999, kind: "create-session" })).toBe(false);
    expect(coordinator.isSelectionMutationPending).toBe(true);
    expect(coordinator.endSelectionMutation(owner!)).toBe(true);
    expect(coordinator.isSelectionMutationPending).toBe(false);
  });
});

function refreshOptions(input: {
  coordinator: ConsoleStateCoordinator;
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  committed: TestState[];
  selection?: ConsoleSelection;
  mutationOwner?: Parameters<ConsoleStateCoordinator["beginRefresh"]>[0];
  commitSelection?: (selection: ConsoleSelection) => void;
}) {
  return {
    apiBase: "http://127.0.0.1:8787/",
    selection: input.selection ?? { projectId: "project-a", sessionId: "session-a" },
    coordinator: input.coordinator,
    fetch: input.fetch,
    readSelection: (state: TestState) => ({
      projectId: state.selectedProjectId,
      sessionId: state.selectedSessionId,
    }),
    commitState: (state: TestState) => input.committed.push(state),
    commitSelection: input.commitSelection ?? vi.fn(),
    setError: vi.fn(),
    mutationOwner: input.mutationOwner ?? undefined,
  };
}

function actionHarness(input: {
  coordinator: ConsoleStateCoordinator;
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  refresh?: (
    selection: ConsoleSelection,
    mutationOwner?: Parameters<ConsoleStateCoordinator["beginRefresh"]>[0],
  ) => Promise<boolean>;
  selectProjectFolder?: () => Promise<string | null>;
  composerValue?: string;
}) {
  let selection: ConsoleSelection = { projectId: "project-a", sessionId: "session-a" };
  const mutationKinds: Array<SelectionMutationKind | null> = [];
  const errors: string[] = [];
  const sending: boolean[] = [];
  const clearComposer = vi.fn();
  const actions = new ConsoleStateActions({
    apiBase: "http://127.0.0.1:8787/",
    coordinator: input.coordinator,
    fetch: input.fetch,
    getSelection: () => selection,
    commitSelection: (nextSelection) => {
      selection = nextSelection;
    },
    refresh: input.refresh ?? (async () => true),
    composerValue: input.composerValue ?? "draft",
    clearComposer,
    setMutationKind: (kind) => mutationKinds.push(kind),
    setSending: (value) => sending.push(value),
    setError: (error) => errors.push(error),
    selectProjectFolder: input.selectProjectFolder,
  });
  return {
    actions,
    clearComposer,
    errors,
    mutationKinds,
    selection: () => selection,
    sending,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
