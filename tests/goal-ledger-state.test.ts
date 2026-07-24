import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createEmptyGoalLedgerState,
  markGoalReady,
  upsertGoalIntakeDraft,
  type GoalLedgerState,
  type GoalRecord,
  type LedgerProvenance,
} from "../src/goal-ledger.js";
import {
  GoalLedgerStateIoError,
  loadGoalLedgerState,
  saveGoalLedgerEntry,
  saveGoalLedgerState,
  type GoalLedgerStateIo,
} from "../src/goal-ledger-state.js";

const NOW = "2026-07-04T00:00:00.000Z";

describe("goal ledger state", () => {
  it("loads a missing state file as an empty ledger", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "goal-ledger.json");

    await expect(loadGoalLedgerState(filePath)).resolves.toEqual(createEmptyGoalLedgerState());
  });

  it("saves and loads valid state atomically", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "goal-ledger.json");
    const state = readyGoalState("goal-1");

    await saveGoalLedgerState(state, filePath);

    await expect(loadGoalLedgerState(filePath)).resolves.toEqual(state);
  });

  it("fails closed on malformed or unsupported state files", async () => {
    const dir = await makeTempDir();
    const malformed = path.join(dir, "malformed.json");
    const unsupported = path.join(dir, "unsupported.json");
    await fs.writeFile(malformed, "{bad", "utf8");
    await fs.writeFile(unsupported, JSON.stringify({ ...createEmptyGoalLedgerState(), schemaVersion: 999 }), "utf8");

    await expect(loadGoalLedgerState(malformed)).rejects.toThrow();
    await expect(loadGoalLedgerState(unsupported)).rejects.toThrow(/schemaVersion/);
  });

  it("preserves the old ledger when temporary file writing fails", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "goal-ledger.json");
    const oldState = readyGoalState("old-goal");
    await saveGoalLedgerState(oldState, filePath);
    const io = makeFsIo({
      async writeFile() {
        throw new Error("disk full");
      },
    });

    await expect(saveGoalLedgerState(readyGoalState("new-goal"), filePath, { io })).rejects.toThrow(/disk full/);
    await expect(loadGoalLedgerState(filePath)).resolves.toEqual(oldState);
  });

  it("preserves the old ledger when rename fails", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "goal-ledger.json");
    const oldState = readyGoalState("old-goal");
    await saveGoalLedgerState(oldState, filePath);
    const io = makeFsIo({
      async rename() {
        throw new Error("rename failed");
      },
    });

    await expect(saveGoalLedgerState(readyGoalState("new-goal"), filePath, { io })).rejects.toThrow(/rename failed/);
    await expect(loadGoalLedgerState(filePath)).resolves.toEqual(oldState);
  });

  it("serializes overlapping entry saves without stale snapshot overwrites", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "goal-ledger.json");
    const releaseFirstWrite: { current: (() => void) | null } = { current: null };
    let firstWriteStarted: (() => void) | null = null;
    const firstWriteStartedPromise = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    let writeCount = 0;
    const io = makeFsIo({
      async writeFile(filePathArg, data) {
        writeCount += 1;
        if (writeCount === 1) {
          firstWriteStarted?.();
          await new Promise<void>((resolve) => {
            releaseFirstWrite.current = resolve;
          });
        }
        await fs.writeFile(filePathArg, data, "utf8");
      },
    });

    const first = saveGoalLedgerEntry("goals", "goal-1", () => readyGoal("goal-1"), filePath, { io });
    await firstWriteStartedPromise;
    let secondSettled = false;
    const second = saveGoalLedgerEntry("goals", "goal-2", () => readyGoal("goal-2"), filePath, { io }).finally(() => {
      secondSettled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(secondSettled).toBe(false);
    if (releaseFirstWrite.current === null) {
      throw new Error("first write did not start");
    }
    releaseFirstWrite.current();
    await Promise.all([first, second]);
    const loaded = await loadGoalLedgerState(filePath);
    expect(Object.keys(loaded.goals).sort()).toEqual(["goal-1", "goal-2"]);
  });

  it("releases the entry lock after timeout or abort", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "goal-ledger.json");
    const hangingIo = makeFsIo({
      async writeFile() {
        await new Promise(() => {});
      },
    });

    await expect(
      saveGoalLedgerEntry("goals", "goal-1", () => readyGoal("goal-1"), filePath, {
        io: hangingIo,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject(new GoalLedgerStateIoError("timeout", "writeFile"));

    await expect(
      Promise.race([
        saveGoalLedgerEntry("goals", "goal-2", () => readyGoal("goal-2"), filePath, { io: makeFsIo({}) }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("lock not released")), 100)),
      ]),
    ).resolves.toBeUndefined();

    const controller = new AbortController();
    const abortingIo = makeFsIo({
      async writeFile() {
        controller.abort();
        await new Promise(() => {});
      },
    });
    await expect(
      saveGoalLedgerEntry("goals", "goal-3", () => readyGoal("goal-3"), filePath, {
        io: abortingIo,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject(new GoalLedgerStateIoError("aborted", "writeFile"));
  });
});

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "moebius-goal-ledger-state-test-"));
}

function readyGoalState(id: string): GoalLedgerState {
  return markGoalReady(
    upsertGoalIntakeDraft(createEmptyGoalLedgerState(), {
      goalId: id,
      title: `Goal ${id}`,
      scope: "scope",
      acceptanceStatements: ["accept"],
      dependencies: [],
      qualityBaseline: "data-correct",
      provenance: makeProvenance(),
      now: NOW,
    }).state,
    id,
    NOW,
  );
}

function readyGoal(id: string): GoalRecord {
  const state = readyGoalState(id);
  const goal = state.goals[id];
  if (goal === undefined) {
    throw new Error(`missing test goal ${id}`);
  }
  return goal;
}

function makeProvenance(): LedgerProvenance {
  return {
    issue: { owner: "tranfu-labs", repo: "moebius", number: 63 },
    messageIndex: 1,
    capturedAt: NOW,
  };
}

function makeFsIo(overrides: Partial<GoalLedgerStateIo>): GoalLedgerStateIo {
  return {
    async mkdir(dirPath) {
      await fs.mkdir(dirPath, { recursive: true });
    },
    async readFile(filePath) {
      return fs.readFile(filePath, "utf8");
    },
    async writeFile(filePath, data) {
      await fs.writeFile(filePath, data, "utf8");
    },
    async rename(from, to) {
      await fs.rename(from, to);
    },
    ...overrides,
  };
}
