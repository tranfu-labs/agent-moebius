import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunBlock, type RunBlockStep } from "./run-block";

const steps: RunBlockStep[] = [
  {
    id: "bridge",
    title: "写消息组件",
    status: "completed",
    summary: "组件文件已生成",
    rawOutput: "completed raw output",
  },
  {
    id: "test",
    title: "运行测试",
    status: "running",
    summary: "正在运行组件测试",
    rawOutput: "RUNS console-ui\nexit:42 should stay hidden",
  },
  {
    id: "review",
    title: "自测走查",
    status: "pending",
  },
];

describe("RunBlock", () => {
  it("shows role, elapsed time, interrupt button, and step statuses without machine output", () => {
    render(<RunBlock role="dev" elapsedTime="3分12秒" steps={steps} onInterrupt={vi.fn()} />);

    expect(screen.getByText("开发")).toBeVisible();
    expect(screen.getByText("3分12秒")).toBeVisible();
    expect(screen.getByRole("button", { name: "中断开发运行" })).toBeVisible();
    expect(screen.getByText("已完成")).toBeVisible();
    expect(screen.getByText("进行中")).toBeVisible();
    expect(screen.getByText("未开始")).toBeVisible();
    expect(screen.getByText("2. 运行测试")).toBeVisible();

    expect(screen.queryByText(/exit:42 should stay hidden/u)).not.toBeInTheDocument();
  });

  it("degrades to a single useful line when no step data exists", () => {
    render(
      <RunBlock
        role="qa"
        elapsedTime="12秒"
        summary="正在整理测试设计"
        rawOutput="idle-timeout raw detail"
        steps={[]}
        onInterrupt={vi.fn()}
      />,
    );

    expect(screen.getByText("测试")).toBeVisible();
    expect(screen.getByText("12秒")).toBeVisible();
    expect(screen.getByText("正在整理测试设计")).toBeVisible();
    expect(screen.getByRole("button", { name: "中断测试运行" })).toBeVisible();
    expect(screen.queryByText("idle-timeout raw detail")).not.toBeInTheDocument();
  });

  it("uses deterministic fallbacks when steps, summary, and elapsed time are missing or blank", () => {
    render(<RunBlock role="dev" elapsedTime="   " summary="" steps={null} onInterrupt={vi.fn()} />);

    expect(screen.getByText("耗时未知")).toBeVisible();
    expect(screen.getByText("正在运行，等待进展")).toBeVisible();
  });

  it("calls onInterrupt once for one mouse activation and once for one keyboard activation", () => {
    const onInterrupt = vi.fn();
    render(<RunBlock role="dev" elapsedTime="3分12秒" steps={steps} onInterrupt={onInterrupt} />);

    const interrupt = screen.getByRole("button", { name: "中断开发运行" });
    fireEvent.click(interrupt);
    expect(onInterrupt).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(interrupt, { key: "Enter" });
    expect(onInterrupt).toHaveBeenCalledTimes(2);
    expect(screen.getByText("开发")).toBeVisible();
  });

  it("keeps top-level machine output out of the conversation surface", () => {
    const specialRaw = "first line\n<node attr=\"x\"> & exit:42";
    render(<RunBlock role="dev" elapsedTime="3秒" summary="正在运行测试" rawOutput={specialRaw} onInterrupt={vi.fn()} />);

    expect(screen.queryByText(specialRaw)).not.toBeInTheDocument();
    expect(screen.queryByText("查看原始输出")).not.toBeInTheDocument();
  });
});
