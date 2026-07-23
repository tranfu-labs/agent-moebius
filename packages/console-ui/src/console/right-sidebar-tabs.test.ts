import { describe, expect, it } from "vitest";

import {
  EMPTY_RIGHT_SIDEBAR_TABS,
  RIGHT_SIDEBAR_SELECTABLE_TAB_TYPES,
  RIGHT_SIDEBAR_TAB_TYPES,
  addBlankRightSidebarTab,
  closeRightSidebarTab,
  convertBlankRightSidebarTab,
  ensureRightSidebarTabsForOpen,
  openRightSidebarSourceTab,
  parseRightSidebarTabsState,
  selectRightSidebarTab,
  serializeRightSidebarTabsState,
  type RightSidebarTabsState,
} from "./right-sidebar-tabs";

describe("right sidebar tab model", () => {
  it("keeps the complete tab enum separate from the two user-selectable types", () => {
    expect(RIGHT_SIDEBAR_TAB_TYPES).toEqual([
      "workspace-diff",
      "project-files",
      "run-output",
      "sub-session",
      "blank",
    ]);
    expect(RIGHT_SIDEBAR_SELECTABLE_TAB_TYPES).toEqual(["workspace-diff", "project-files"]);
    expect(RIGHT_SIDEBAR_SELECTABLE_TAB_TYPES).not.toContain("run-output");
    expect(RIGHT_SIDEBAR_SELECTABLE_TAB_TYPES).not.toContain("sub-session");
  });

  it("deduplicates source tabs while never deduplicating plus-created blank tabs", () => {
    const first = openRightSidebarSourceTab(EMPTY_RIGHT_SIDEBAR_TABS, {
      id: "diff-1",
      type: "workspace-diff",
      title: "改动",
      sourceKey: "workspace-diff:session-a",
    });
    const withBlank = addBlankRightSidebarTab(first, "blank-1");
    const withTwoBlanks = addBlankRightSidebarTab(withBlank, "blank-2");
    const reopened = openRightSidebarSourceTab(withTwoBlanks, {
      id: "diff-2",
      type: "workspace-diff",
      title: "另一个标题不会产生新标签",
      sourceKey: "workspace-diff:session-a",
    });

    expect(reopened.tabs.map((tab) => tab.id)).toEqual(["diff-1", "blank-1", "blank-2"]);
    expect(reopened.activeTabId).toBe("diff-1");
  });

  it("keeps new tab ids unique after restored tabs reuse the in-memory counter id", () => {
    const restored: RightSidebarTabsState = {
      tabs: [{
        id: "right-sidebar-tab-1",
        type: "project-files",
        title: "项目文件",
        sourceKey: null,
        closable: true,
      }],
      activeTabId: "right-sidebar-tab-1",
    };
    const withBlank = addBlankRightSidebarTab(restored, "right-sidebar-tab-1");
    const withSource = openRightSidebarSourceTab(withBlank, {
      id: "right-sidebar-tab-1",
      type: "workspace-diff",
      title: "改动",
      sourceKey: "workspace-diff:session-a",
    });

    expect(withSource.tabs.map((tab) => tab.id)).toEqual([
      "right-sidebar-tab-1",
      "right-sidebar-tab-1-2",
      "right-sidebar-tab-1-3",
    ]);
    expect(new Set(withSource.tabs.map((tab) => tab.id))).toHaveLength(3);
  });

  it("keeps the sidebar state alive with a blank tab after the last tab closes", () => {
    const initial = ensureRightSidebarTabsForOpen(EMPTY_RIGHT_SIDEBAR_TABS, {
      id: "initial-diff",
      isGitRepository: true,
    });
    const closed = closeRightSidebarTab(initial, "initial-diff", "fallback-blank");

    expect(closed).toEqual({
      tabs: [{
        id: "fallback-blank",
        type: "blank",
        title: "新标签",
        sourceKey: null,
        closable: true,
      }],
      activeTabId: "fallback-blank",
    });
  });

  it("converts only blank tabs and preserves the user's active tab during unrelated updates", () => {
    const state = addBlankRightSidebarTab(
      ensureRightSidebarTabsForOpen(EMPTY_RIGHT_SIDEBAR_TABS, {
        id: "diff",
        isGitRepository: true,
      }),
      "blank",
    );
    const converted = convertBlankRightSidebarTab(state, "blank", "project-files");
    const userSelected = selectRightSidebarTab(converted, "diff");
    const contentRefresh = parseRightSidebarTabsState(JSON.parse(serializeRightSidebarTabsState(userSelected)));

    expect(converted.tabs[1]).toMatchObject({ type: "project-files", title: "项目文件", sourceKey: null });
    expect(contentRefresh.activeTabId).toBe("diff");
  });

  it("drops unknown or malformed persisted tabs instead of failing restoration", () => {
    expect(parseRightSidebarTabsState({
      tabs: [
        { id: "known", type: "project-files", title: "项目文件", sourceKey: null, closable: false },
        { id: "future", type: "terminal", title: "终端", sourceKey: null },
        { id: "", type: "blank", title: "坏数据", sourceKey: null },
      ],
      activeTabId: "future",
    })).toEqual({
      tabs: [{
        id: "known",
        type: "project-files",
        title: "项目文件",
        sourceKey: null,
        closable: true,
      }],
      activeTabId: "known",
    });
  });

  it("uses project files as the first tab for a non-git project", () => {
    expect(ensureRightSidebarTabsForOpen(EMPTY_RIGHT_SIDEBAR_TABS, {
      id: "files",
      isGitRepository: false,
    }).tabs[0]?.type).toBe("project-files");
  });
});
