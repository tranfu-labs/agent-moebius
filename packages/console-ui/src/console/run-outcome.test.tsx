import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunOutcome, type RunOutcomeStatus } from "./run-outcome";

const outcomeFixtures: Array<{ status: RunOutcomeStatus; summary: string; reason: string }> = [
  { status: "run-not-started", summary: "这一步没跑起来", reason: "exit:42" },
  { status: "run-stuck", summary: "这一步卡住了", reason: "idle-timeout:10ms" },
  { status: "user-stopped", summary: "你让这一步停下了", reason: "interrupted:user" },
  { status: "retry-exhausted", summary: "这一步反复没跑起来，已经不再重试", reason: "dead-letter:max-retries" },
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
    render(<RunOutcome status="run-not-started" rawReason="exit:42" onRetry={onOpenDiagnostics} />);

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onOpenDiagnostics).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("exit:42")).not.toBeInTheDocument();
  });

  it("offers only the accessible edit-and-resend action for a user interruption", () => {
    const onEditAndResend = vi.fn();
    render(
      <RunOutcome
        status="user-stopped"
        onOpenDiagnostics={vi.fn()}
        onEditAndResend={onEditAndResend}
      />,
    );

    expect(screen.getByText("你让这一步停下了")).toBeVisible();
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "改一改重发这轮消息" }));
    expect(onEditAndResend).toHaveBeenCalledOnce();
  });

  it("does not expose edit or resend on other outcomes", () => {
    render(<RunOutcome status="run-stuck" onRetry={vi.fn()} onEditAndResend={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /改一改重发/u })).not.toBeInTheDocument();
  });
});
