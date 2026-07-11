import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConversationEmptyState } from "./conversation-empty-state";

describe("ConversationEmptyState", () => {
  it("renders invitation copy with a single composer submit action", () => {
    const onValueChange = vi.fn();
    const onSubmit = vi.fn();
    render(<ConversationEmptyState value="@dev 开始" onValueChange={onValueChange} onSubmit={onSubmit} />);

    expect(screen.getByText("开始一个新会话")).toBeInTheDocument();
    expect(screen.getByText("描述你的目标，@ 一个角色开始")).toBeInTheDocument();
    expect(screen.getByText("发消息会开启一次会话")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /发送/u }));
    expect(onSubmit).toHaveBeenCalledWith("@dev 开始");
  });
});
