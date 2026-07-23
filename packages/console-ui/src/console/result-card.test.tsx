import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResultCard, shouldShowResultCard } from "./result-card";

describe("ResultCard", () => {
  it("reports a count without attributing or listing files", () => {
    const onOpen = vi.fn();
    render(<ResultCard fileCount={2} onOpen={onOpen} />);

    expect(screen.getByText("这段对话期间有 2 个文件发生改动。")).toBeInTheDocument();
    expect(screen.queryByText(/团队|成员|src\//u)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps an explicit zero result", () => {
    render(<ResultCard fileCount={0} onOpen={vi.fn()} />);
    expect(screen.getByText("这段对话期间没有文件发生改动。")).toBeInTheDocument();
  });

  it("uses the running and handoff facts shared with the status point", () => {
    const settled = {
      diffAvailable: true,
      isRunning: false,
      lastMessageMentionsAgent: false,
      hasCompletedStep: true,
      hasPendingWork: false,
    };
    expect(shouldShowResultCard(settled)).toBe(true);
    expect(shouldShowResultCard({ ...settled, isRunning: true })).toBe(false);
    expect(shouldShowResultCard({ ...settled, lastMessageMentionsAgent: true })).toBe(false);
    expect(shouldShowResultCard({ ...settled, hasPendingWork: true })).toBe(false);
    expect(shouldShowResultCard({ ...settled, diffAvailable: false })).toBe(false);
  });
});
