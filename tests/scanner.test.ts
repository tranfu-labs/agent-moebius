import { describe, expect, it, vi } from "vitest";
import type { GitHubResponseIntakeState } from "../src/github-response-intake.js";
import type { RepositoryRef } from "../src/issue-source.js";
import { runIntakeScan } from "../src/scanner.js";
import { createStatePersister } from "../src/state-persister.js";

const CONFIG = { idleRepositoryScanIntervalMs: 5 * 60_000, issueDiscoveryLimit: 20 };
const REPO_A: RepositoryRef = { owner: "tranfu-labs", repo: "tranfu-agents-app" };
const REPO_B: RepositoryRef = { owner: "tranfu-labs", repo: "moebius" };
const NOW = new Date("2026-07-02T03:13:00.000Z");

function baselineState(): GitHubResponseIntakeState {
  return {
    repositories: {
      "tranfu-labs/tranfu-agents-app": { lastIdleScanAt: "2026-07-02T02:00:00.000Z" },
      "tranfu-labs/moebius": { lastIdleScanAt: "2026-07-02T02:00:00.000Z" },
    },
    issues: {
      "tranfu-labs/tranfu-agents-app#67": {
        ...REPO_A,
        issueNumber: 67,
        updatedAt: "2026-07-02T01:00:00.000Z",
        mode: "idle",
        activeNoChangeCount: 0,
        nextPollAt: null,
      },
    },
  };
}

describe("intake scanner", () => {
  it("returns changed issues and records the scan time", async () => {
    const persister = createStatePersister({ initialState: baselineState(), save: async () => {} });
    const changed = await runIntakeScan({
      repositories: [REPO_A],
      getState: persister.state,
      applyState: persister.update,
      now: NOW,
      listOpenIssueSummaries: async () => [{ issueNumber: 67, updatedAt: "2026-07-02T03:00:00.000Z" }],
      config: CONFIG,
    });

    expect(changed).toEqual([{ ...REPO_A, issueNumber: 67, updatedAt: "2026-07-02T03:00:00.000Z" }]);
    expect(persister.state().repositories["tranfu-labs/tranfu-agents-app"]?.lastIdleScanAt).toBe(NOW.toISOString());
  });

  it("does not clobber state mutations that land while the issue list fetch is in flight", async () => {
    const persister = createStatePersister({ initialState: baselineState(), save: async () => {} });
    const foldedDuringFetch: GitHubResponseIntakeState["issues"][string] = {
      ...REPO_A,
      issueNumber: 99,
      updatedAt: "2026-07-02T03:10:00.000Z",
      mode: "active",
      activeNoChangeCount: 0,
      nextPollAt: "2026-07-02T03:14:00.000Z",
    };

    await runIntakeScan({
      repositories: [REPO_A],
      getState: persister.state,
      applyState: persister.update,
      now: NOW,
      listOpenIssueSummaries: async () => {
        // 模拟执行侧在扫描的异步窗口内折叠了一个 job 结果
        persister.update((state) => ({
          ...state,
          issues: { ...state.issues, "tranfu-labs/tranfu-agents-app#99": foldedDuringFetch },
        }));
        return [{ issueNumber: 67, updatedAt: "2026-07-02T03:00:00.000Z" }];
      },
      config: CONFIG,
    });

    expect(persister.state().issues["tranfu-labs/tranfu-agents-app#99"]).toEqual(foldedDuringFetch);
    expect(persister.state().repositories["tranfu-labs/tranfu-agents-app"]?.lastIdleScanAt).toBe(NOW.toISOString());
  });

  it("continues scanning the remaining repositories when one repository fails", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const persister = createStatePersister({ initialState: baselineState(), save: async () => {} });

    const changed = await runIntakeScan({
      repositories: [REPO_A, REPO_B],
      getState: persister.state,
      applyState: persister.update,
      now: NOW,
      listOpenIssueSummaries: async (repository) => {
        if (repository.repo === REPO_A.repo) {
          throw new Error("gh EOF");
        }
        return [{ issueNumber: 20, updatedAt: "2026-07-02T03:05:00.000Z" }];
      },
      config: CONFIG,
    });

    expect(changed).toEqual([{ ...REPO_B, issueNumber: 20, updatedAt: "2026-07-02T03:05:00.000Z" }]);
    expect(
      logSpy.mock.calls.some(([line]) => typeof line === "string" && line.includes('"event":"repo-scan-failed"')),
    ).toBe(true);
    logSpy.mockRestore();
  });

  it("skips repositories that are not due yet", async () => {
    const freshState = baselineState();
    freshState.repositories["tranfu-labs/tranfu-agents-app"] = { lastIdleScanAt: "2026-07-02T03:12:30.000Z" };
    const persister = createStatePersister({ initialState: freshState, save: async () => {} });
    const listOpenIssueSummaries = vi.fn(async () => []);

    const changed = await runIntakeScan({
      repositories: [REPO_A],
      getState: persister.state,
      applyState: persister.update,
      now: NOW,
      listOpenIssueSummaries,
      config: CONFIG,
    });

    expect(changed).toEqual([]);
    expect(listOpenIssueSummaries).not.toHaveBeenCalled();
  });
});
