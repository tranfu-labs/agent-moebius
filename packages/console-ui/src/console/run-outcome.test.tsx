import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunOutcome, type RunOutcomeStatus } from "./run-outcome";

const outcomeFixtures: Array<{ status: RunOutcomeStatus; summary: string; reason: string }> = [
  { status: "failed", summary: "运行失败", reason: "exit:42" },
  { status: "stuck", summary: "运行长时间无响应", reason: "idle-timeout:10ms" },
  { status: "interrupted", summary: "运行已中断", reason: "interrupted:user" },
  { status: "dead-letter", summary: "多次尝试仍失败，已停止自动重试", reason: "dead-letter:max-retries" },
];

describe("RunOutcome", () => {
  it("maps terminal outcomes to readable summaries without rendering machine reasons", () => {
    for (const fixture of outcomeFixtures) {
      const { unmount } = render(<RunOutcome status={fixture.status} role="dev" rawReason={fixture.reason} />);

      expect(screen.getByText(fixture.summary)).toBeVisible();
      expect(screen.queryByText(fixture.reason)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("routes failed-run diagnostics through the explicit log action", () => {
    const onOpenDiagnostics = vi.fn();
    render(<RunOutcome status="failed" rawReason="exit:42" onOpenDiagnostics={onOpenDiagnostics} />);

    fireEvent.click(screen.getByRole("button", { name: "查看日志" }));
    expect(onOpenDiagnostics).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("exit:42")).not.toBeInTheDocument();
  });

  it("does not offer a diagnostic action for a user interruption", () => {
    render(<RunOutcome status="interrupted" onOpenDiagnostics={vi.fn()} />);

    expect(screen.getByText("运行已中断")).toBeVisible();
    expect(screen.queryByRole("button", { name: "查看日志" })).not.toBeInTheDocument();
  });
});
