import { describe, expect, it, vi } from "vitest";
import type { GitHubResponseIntakeState } from "../src/github-response-intake.js";
import { createStatePersister } from "../src/state-persister.js";

function emptyState(): GitHubResponseIntakeState {
  return { repositories: {}, issues: {} };
}

function stateWithRepo(state: GitHubResponseIntakeState, repoKey: string): GitHubResponseIntakeState {
  return {
    ...state,
    repositories: {
      ...state.repositories,
      [repoKey]: { lastIdleScanAt: "2026-07-02T00:00:00.000Z" },
    },
  };
}

describe("state persister", () => {
  it("applies mutations synchronously and exposes the latest state", () => {
    const persister = createStatePersister({ initialState: emptyState(), save: async () => {} });

    const next = persister.update((state) => stateWithRepo(state, "a/b"));

    expect(next.repositories["a/b"]).toBeDefined();
    expect(persister.state()).toBe(next);
  });

  it("coalesces consecutive updates into at most two saves", async () => {
    let release = (): void => {};
    const savedSnapshots: GitHubResponseIntakeState[] = [];
    const save = vi.fn(async (state: GitHubResponseIntakeState) => {
      savedSnapshots.push(state);
      if (savedSnapshots.length === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
    });
    const persister = createStatePersister({ initialState: emptyState(), save });

    persister.update((state) => stateWithRepo(state, "a/first"));
    persister.update((state) => stateWithRepo(state, "a/second"));
    persister.update((state) => stateWithRepo(state, "a/third"));
    release();
    await persister.flush();

    expect(save).toHaveBeenCalledTimes(2);
    expect(savedSnapshots[1]?.repositories["a/second"]).toBeDefined();
    expect(savedSnapshots[1]?.repositories["a/third"]).toBeDefined();
  });

  it("keeps running after a save failure and retries on the next update", async () => {
    const save = vi
      .fn<(state: GitHubResponseIntakeState) => Promise<void>>()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue(undefined);
    const persister = createStatePersister({ initialState: emptyState(), save });

    expect(() => persister.update((state) => stateWithRepo(state, "a/b"))).not.toThrow();
    await persister.flush();
    expect(save).toHaveBeenCalledTimes(1);

    persister.update((state) => stateWithRepo(state, "a/c"));
    await persister.flush();

    expect(save).toHaveBeenCalledTimes(2);
    const lastSaved = save.mock.calls[1]?.[0];
    expect(lastSaved?.repositories["a/b"]).toBeDefined();
    expect(lastSaved?.repositories["a/c"]).toBeDefined();
  });

  it("flush resolves after all scheduled writes settle", async () => {
    const order: string[] = [];
    const persister = createStatePersister({
      initialState: emptyState(),
      save: async () => {
        await Promise.resolve();
        order.push("saved");
      },
    });

    persister.update((state) => stateWithRepo(state, "a/b"));
    await persister.flush();
    order.push("flushed");

    expect(order).toEqual(["saved", "flushed"]);
  });
});
