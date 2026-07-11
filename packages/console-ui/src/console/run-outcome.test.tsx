import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RunOutcome, type RunOutcomeStatus } from "./run-outcome";

const outcomeFixtures: Array<{ status: RunOutcomeStatus; summary: string; reason: string }> = [
  { status: "failed", summary: "运行失败", reason: "exit:42" },
  { status: "stuck", summary: "运行长时间无响应", reason: "idle-timeout:10ms" },
  { status: "interrupted", summary: "运行已中断", reason: "interrupted:user" },
  { status: "dead-letter", summary: "多次尝试仍失败，已停止自动重试", reason: "dead-letter:max-retries" },
];

describe("RunOutcome", () => {
  it("maps terminal outcomes to Chinese summaries while keeping machine reasons collapsed", () => {
    for (const fixture of outcomeFixtures) {
      const { unmount } = render(<RunOutcome status={fixture.status} role="dev" rawReason={fixture.reason} />);

      expect(screen.getByText(fixture.summary)).toBeVisible();
      const reason = screen.getByText(fixture.reason);
      expect(reason).not.toBeVisible();

      fireEvent.click(screen.getByText("查看详情"));
      expect(reason).toBeVisible();
      expect(reason.textContent).toBe(fixture.reason);
      unmount();
    }
  });

  it("toggles outcome detail with one Enter or Space activation", () => {
    render(<RunOutcome status="failed" rawReason="exit:42" />);

    const summary = screen.getByText("查看详情").closest("summary");
    expect(summary).not.toBeNull();
    const reason = screen.getByText("exit:42");

    fireEvent.keyDown(summary!, { key: "Enter" });
    expect(reason).toBeVisible();

    fireEvent.keyDown(summary!, { key: " " });
    expect(reason).not.toBeVisible();
  });

  it("preserves line breaks, angle brackets, ampersands, and machine strings as text", () => {
    const rawOutput = "line one\n<run status=\"failed\"> & exit:42";
    render(<RunOutcome status="failed" rawReason="exit:42" rawOutput={rawOutput} />);

    const output = screen.getByLabelText("原始输出");
    expect(output).not.toBeVisible();

    fireEvent.click(screen.getByText("查看详情"));
    expect(output).toBeVisible();
    expect(output.textContent).toBe(rawOutput);
  });
});
