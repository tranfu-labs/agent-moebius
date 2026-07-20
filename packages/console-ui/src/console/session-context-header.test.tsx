import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionContextHeader } from "./session-context-header";

describe("SessionContextHeader", () => {
  it("renders current session breadcrumb, task status, and progress summary only", () => {
    const onOpenParent = vi.fn();
    render(
      <SessionContextHeader
        parentTitle="目标 · 导出体验"
        taskLabel="任务 T2 · 进度提示"
        status="running"
        progress={{ passed: 1, running: 1, waiting: 1 }}
        onOpenParent={onOpenParent}
      />
    );

    expect(screen.getByRole("button", { name: /属于：目标 · 导出体验/u })).toBeInTheDocument();
    expect(screen.getByText("任务 T2 · 进度提示")).toBeInTheDocument();
    expect(screen.getByText("执行中")).toBeInTheDocument();
    expect(screen.getByText("通过")).toBeInTheDocument();
    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.getByText("等你")).toBeInTheDocument();
    expect(screen.getAllByText("1")).toHaveLength(3);
    expect(screen.queryByText("新会话")).not.toBeInTheDocument();
    expect(screen.queryByText("等你清单")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /属于：目标 · 导出体验/u }));
    expect(onOpenParent).toHaveBeenCalledTimes(1);
  });
});
