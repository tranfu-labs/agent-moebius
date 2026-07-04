import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadGitHubResponseIntakeState, saveGitHubResponseIntakeState } from "../src/github-intake-state.js";
import type { GitHubResponseIntakeState } from "../src/github-response-intake.js";

describe("github response intake state store", () => {
  it("returns an empty store when the state file does not exist", async () => {
    const filePath = path.join(await makeTempDir(), "missing", "github-response-intake.json");

    await expect(loadGitHubResponseIntakeState(filePath)).resolves.toEqual({ repositories: {}, issues: {} });
  });

  it("saves and loads intake state", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "github-response-intake.json");
    const state: GitHubResponseIntakeState = {
      repositories: {
        "tranfu-labs/agent-moebius": {
          lastIdleScanAt: "2026-06-28T00:00:00.000Z",
        },
      },
      issues: {
        "tranfu-labs/agent-moebius#4": {
          owner: "tranfu-labs",
          repo: "agent-moebius",
          issueNumber: 4,
          updatedAt: "2026-06-28T00:01:00.000Z",
          mode: "active",
          activeNoChangeCount: 0,
          nextPollAt: "2026-06-28T00:02:00.000Z",
          failureCount: 2,
          lastFailureReason: "pre script failed",
          fallbackRouteDecisions: {
            "comment-node-1": {
              commentId: "comment-node-1",
              outcome: "no_action",
              judgedAt: "2026-06-28T00:01:30.000Z",
              reason: "no route intent",
            },
          },
        },
      },
    };

    await saveGitHubResponseIntakeState(state, filePath);

    await expect(loadGitHubResponseIntakeState(filePath)).resolves.toEqual(state);
  });

  it("loads legacy issue state without failure accounting or fallback route fields", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "github-response-intake.json");
    const state: GitHubResponseIntakeState = {
      repositories: {},
      issues: {
        "tranfu-labs/agent-moebius#4": {
          owner: "tranfu-labs",
          repo: "agent-moebius",
          issueNumber: 4,
          updatedAt: "2026-06-28T00:01:00.000Z",
          mode: "active",
          activeNoChangeCount: 0,
          nextPollAt: "2026-06-28T00:02:00.000Z",
        },
      },
    };
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(state)}\n`, "utf8");

    await expect(loadGitHubResponseIntakeState(filePath)).resolves.toEqual(state);
  });

  it("fails safely on invalid state shape", async () => {
    const filePath = path.join(await makeTempDir(), ".state", "github-response-intake.json");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ repositories: {}, issues: { issue: { mode: "active" } } }), "utf8");

    await expect(loadGitHubResponseIntakeState(filePath)).rejects.toThrow(/Invalid GitHub response intake state file/);
  });
});

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-github-intake-state-test-"));
}
