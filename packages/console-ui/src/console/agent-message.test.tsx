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
    expect(screen.getByText("已补齐运行块人话化展示。")).toBeVisible();
    expect(screen.getByText("交给「测试」请审查方案")).toBeVisible();

    const rawMarker = screen.getByText(/agent-moebius:stage=plan-written/u);
    expect(rawMarker).not.toBeVisible();

    fireEvent.click(screen.getByText("点开全文"));
    expect(rawMarker).toBeVisible();
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

    fireEvent.click(screen.getByText("点开全文"));
    expect(screen.getByText(/已补齐运行块人话化展示/u)).toBeVisible();
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

    const summary = screen.getByText("点开全文").closest("summary");
    expect(summary).not.toBeNull();
    const rawMarker = screen.getByText(/agent-moebius:stage=plan-written/u);

    fireEvent.keyDown(summary!, { key: "Enter" });
    expect(rawMarker).toBeVisible();

    fireEvent.keyDown(summary!, { key: " " });
    expect(rawMarker).not.toBeVisible();
  });

  it("parses conclusion, stage, and humanized handoff deterministically", () => {
    expect(parseAgentMarkdown(rawAgentMarkdown)).toEqual({
      conclusion: "已补齐运行块人话化展示。",
      handoff: "交给「测试」请审查方案",
      stage: "plan-written",
    });
  });
});
