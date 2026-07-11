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
  it("shows role, elapsed time, interrupt button, step statuses, and collapsed step output", () => {
    render(<RunBlock role="dev" elapsedTime="3分12秒" steps={steps} onInterrupt={vi.fn()} />);

    expect(screen.getByText("开发")).toBeVisible();
    expect(screen.getByText("3分12秒")).toBeVisible();
    expect(screen.getByRole("button", { name: "中断开发运行" })).toBeVisible();
    expect(screen.getByText("已完成")).toBeVisible();
    expect(screen.getByText("进行中")).toBeVisible();
    expect(screen.getByText("未开始")).toBeVisible();
    expect(screen.getByText("2. 运行测试")).toBeVisible();

    const rawOutput = screen.getByText(/exit:42 should stay hidden/u);
    expect(rawOutput).not.toBeVisible();

    fireEvent.click(screen.getByText("查看第 2 步原始输出"));
    expect(rawOutput).toBeVisible();
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
    expect(screen.getByText("idle-timeout raw detail")).not.toBeVisible();
  });

  it("uses deterministic fallbacks when steps, summary, and elapsed time are missing or blank", () => {
    render(<RunBlock role="dev" elapsedTime="   " summary="" steps={null} onInterrupt={vi.fn()} />);

    expect(screen.getByText("耗时未知")).toBeVisible();
    expect(screen.getByText("正在运行，等待进展")).toBeVisible();
  });

  it("toggles run step disclosure with one Enter or Space activation", () => {
    render(<RunBlock role="dev" elapsedTime="3分12秒" steps={steps} onInterrupt={vi.fn()} />);

    const summary = screen.getByText("查看第 1 步原始输出").closest("summary");
    expect(summary).not.toBeNull();
    const rawOutput = screen.getByText("completed raw output");

    fireEvent.keyDown(summary!, { key: "Enter" });
    expect(rawOutput).toBeVisible();

    fireEvent.keyDown(summary!, { key: " " });
    expect(rawOutput).not.toBeVisible();
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

  it("preserves special raw output text after expanding details", () => {
    const specialRaw = "first line\n<node attr=\"x\"> & exit:42";
    render(<RunBlock role="dev" elapsedTime="3秒" summary="正在运行测试" rawOutput={specialRaw} onInterrupt={vi.fn()} />);

    const rawOutput = screen.getByText((_, element) => element?.tagName === "PRE" && element.textContent === specialRaw);
    expect(rawOutput).not.toBeVisible();

    fireEvent.click(screen.getByText("查看原始输出"));
    expect(rawOutput).toBeVisible();
    expect(rawOutput.textContent).toBe(specialRaw);
  });
});
