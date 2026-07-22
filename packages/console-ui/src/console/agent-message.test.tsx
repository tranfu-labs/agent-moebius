import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgentMessage, parseAgentMarkdown } from "./agent-message";

const rawAgentMarkdown = [
  "## 结论",
  "已补齐运行块人话化展示。",
  "",
  "## 依据",
  "- packages/console-ui/src/console/run-block.tsx",
  "",
  "## 下一步",
  "交棒：@qa 请审查方案",
  "",
  "<!-- agent-moebius:stage=plan-written -->",
].join("\n");

describe("AgentMessage", () => {
  it("derives collapsed summary from raw Markdown and keeps full raw text behind disclosure", () => {
    render(<AgentMessage role="dev" rawMarkdown={rawAgentMarkdown} timestamp="09:36" />);

    expect(screen.getByText("开发")).toBeVisible();
    expect(screen.getByText("方案已写好")).toBeVisible();
    const conclusions = screen.getAllByText("已补齐运行块人话化展示。");
    expect(conclusions).toHaveLength(2);
    expect(conclusions[0]).toBeVisible();
    expect(conclusions[1]).not.toBeVisible();
    expect(screen.getByText("交给「测试」请审查方案")).toBeVisible();

    const rawHeading = screen.getByText("结论");
    expect(rawHeading).not.toBeVisible();

    fireEvent.click(screen.getByLabelText("展开开发原文"));
    expect(rawHeading).toBeVisible();
    expect(screen.getByText(/交棒：@qa 请审查方案/u)).toBeVisible();
  });

  it("lets explicit fields override parsed values without altering raw details", () => {
    render(
      <AgentMessage
        role="qa"
        rawMarkdown={rawAgentMarkdown}
        stage="code-verified"
        conclusion="显式结论"
        handoff="交给「产品」确认"
      />,
    );

    expect(screen.getByText("测试")).toBeVisible();
    expect(screen.getByText("代码已验证")).toBeVisible();
    expect(screen.getByText("显式结论")).toBeVisible();
    expect(screen.getByText("交给「产品」确认")).toBeVisible();
    expect(screen.queryByText("方案已写好")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("展开测试原文"));
    expect(screen.getAllByText(/已补齐运行块人话化展示/u).some((item) => item.closest("p") !== null)).toBe(true);
  });

  it("uses neutral fallbacks for incomplete Markdown", () => {
    render(<AgentMessage role="unknown-role" rawMarkdown="plain text without protocol" />);

    expect(screen.getByText("协作者")).toBeVisible();
    expect(screen.getByText("阶段未知")).toBeVisible();
    expect(screen.getByText("暂无结论摘要")).toBeVisible();
    expect(screen.getByText("暂无下一步")).toBeVisible();
  });

  it("toggles disclosure with one Enter or Space activation", () => {
    render(<AgentMessage role="dev" rawMarkdown={rawAgentMarkdown} />);

    const summary = screen.getByLabelText("展开开发原文");
    expect(summary).not.toBeNull();
    const rawHeading = screen.getByText("结论");

    fireEvent.keyDown(summary!, { key: "Enter" });
    expect(rawHeading).toBeVisible();

    fireEvent.keyDown(summary!, { key: " " });
    expect(rawHeading).not.toBeVisible();
  });

  it("parses conclusion, stage, and humanized handoff deterministically", () => {
    expect(parseAgentMarkdown(rawAgentMarkdown)).toEqual({
      conclusion: "已补齐运行块人话化展示。",
      handoff: "交给「测试」请审查方案",
      stage: "plan-written",
    });
  });
});
