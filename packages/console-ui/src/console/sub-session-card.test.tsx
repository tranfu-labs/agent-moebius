import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SubSessionCard, type SubSessionCardItem } from "./sub-session-card";

const items: SubSessionCardItem[] = [
  { sessionId: "copy", title: "落地页文案", memberName: "开发", status: "running", statusLabel: "进行中" },
  { sessionId: "qa", title: "空状态验收", memberName: "测试", status: "not-started", statusLabel: "没跑起来" },
  { sessionId: "build", title: "构建脚本", memberName: "开发", status: "finished", statusLabel: "已结束" },
];

describe("SubSessionCard", () => {
  it("renders every required fact on every fully clickable row", () => {
    const onOpen = vi.fn();
    render(<SubSessionCard items={items} openedSessionId="qa" onOpen={onOpen} />);

    const rows = screen.getAllByTestId("sub-session-card-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("落地页文案")).toBeVisible();
    expect(within(rows[0]!).getByText("开发")).toBeVisible();
    expect(within(rows[0]!).getByText("进行中")).toBeVisible();
    expect(rows[1]).toHaveAttribute("aria-pressed", "true");
    expect(rows[1]).toHaveAttribute("data-status", "not-started");

    fireEvent.click(rows[1]!);
    expect(onOpen).toHaveBeenCalledWith("qa");
  });
});
