import { describe, expect, it } from "vitest";

import { resolveSessionWorkspaceContext } from "../src/local-console/workspace-resolution.js";

describe("session workspace resolution", () => {
  it("uses the session value without falling back to the project default", () => {
    expect(resolveSessionWorkspaceContext(
      { workspaceMode: "worktree", workspacePendingMode: null },
      { isGitRepository: true },
    )).toMatchObject({
      workspaceMode: "worktree",
      workspacePendingMode: null,
      independentWorkspaceAvailable: true,
    });
  });

  it("disables independent workspaces for non-git folders with a stable reason", () => {
    expect(resolveSessionWorkspaceContext(
      { workspaceMode: "direct", workspacePendingMode: null },
      { isGitRepository: false },
    )).toEqual({
      workspaceMode: "direct",
      workspacePendingMode: null,
      independentWorkspaceAvailable: false,
      independentWorkspaceUnavailableReason: "not-git-repository",
    });
  });

  it("keeps the effective and pending values distinct", () => {
    expect(resolveSessionWorkspaceContext(
      { workspaceMode: "direct", workspacePendingMode: "worktree" },
      { isGitRepository: true },
    )).toMatchObject({ workspaceMode: "direct", workspacePendingMode: "worktree" });
  });
});
