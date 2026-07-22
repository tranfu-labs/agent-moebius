import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SubSessionPanel } from "./sub-session-panel";

describe("SubSessionPanel", () => {
  it("provides only the responsive shell and explicit close action", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <SubSessionPanel title="空状态验收" narrow={false} onClose={onClose}>
        <p>已有会话内容</p>
      </SubSessionPanel>,
    );

    expect(screen.getByTestId("sub-session-panel")).toHaveAttribute("data-layout", "split");
    expect(screen.getByText("已有会话内容")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭子会话" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <SubSessionPanel title="空状态验收" narrow onClose={onClose}>
        <p>已有会话内容</p>
      </SubSessionPanel>,
    );
    expect(screen.getByTestId("sub-session-panel")).toHaveAttribute("data-layout", "overlay");
  });
});
