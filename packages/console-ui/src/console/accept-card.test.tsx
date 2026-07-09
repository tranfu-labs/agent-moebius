import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AcceptCard, acceptanceConclusion, formatAcceptanceProtocol, type AcceptanceItem } from "./accept-card";

const items: AcceptanceItem[] = [
  {
    id: "one",
    statement: "跑 pnpm test -> 退出码 0",
    decision: "pass",
    evidence: "pnpm test 通过"
  },
  {
    id: "two",
    statement: "打开 Storybook -> 应看到近单色验收卡",
    decision: "fail",
    evidence: "截图里按钮未对齐"
  }
];

describe("AcceptCard", () => {
  it("renders neutral waiting copy and evidence-first sections", () => {
    render(
      <AcceptCard
        reviewerLabel="用户代表"
        summary="新增桌面对话操作台组件库"
        selfTestSummary="组件样板已通过"
        items={items}
      />
    );

    expect(screen.getByText("轮到你了 · 「用户代表」请你验收")).toBeInTheDocument();
    expect(screen.getByText(/改了什么/)).toBeInTheDocument();
    expect(screen.getByText("pnpm test 通过")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交验收结果" })).toBeInTheDocument();
  });

  it("formats strict runner acceptance protocol text", () => {
    expect(formatAcceptanceProtocol(items)).toBe(
      [
        "1. 通过 — pnpm test 通过",
        "2. 不通过 — 截图里按钮未对齐",
        "验收结论：不通过"
      ].join("\n")
    );
  });

  it("refuses to submit protocol text while a row is pending", () => {
    expect(() =>
      formatAcceptanceProtocol([{ id: "pending", statement: "待验收", decision: "pending" }])
    ).toThrow("pending");
  });

  it("concludes pass only when every row passes", () => {
    expect(acceptanceConclusion(items)).toBe("fail");
    expect(acceptanceConclusion(items.map((item) => ({ ...item, decision: "pass" })))).toBe("pass");
    expect(acceptanceConclusion([{ id: "pending", statement: "待验收", decision: "pending" }])).toBe("pending");
  });
});
