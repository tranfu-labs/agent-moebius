import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarkdownMessage, safeMarkdownUrlTransform } from "./markdown-message";

describe("MarkdownMessage", () => {
  it("renders user and agent Markdown with GFM structure", () => {
    render(
      <MarkdownMessage
        content={[
          "# 标题",
          "",
          "**加粗**、`inline` 与 ~~删除~~",
          "",
          "> 引用",
          "",
          "| 能力 | 状态 |",
          "| --- | --- |",
          "| Markdown | 完成 |",
          "",
          "- [x] 任务列表",
        ].join("\n")}
      />,
    );

    expect(screen.getByRole("heading", { name: "标题" })).toBeInTheDocument();
    expect(screen.getByText("加粗")).toHaveAttribute("data-streamdown", "strong");
    expect(screen.getByText("inline").tagName).toBe("CODE");
    expect(screen.getByRole("table")).toHaveTextContent("Markdown");
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("sanitizes raw HTML and blocks dangerous URL schemes", () => {
    const { container } = render(
      <MarkdownMessage
        content={'<script>alert(1)</script>\n\n<iframe src="https://example.com"></iframe>\n\n<img src="data:image/png;base64,x" onerror="alert(2)">\n\n[危险](javascript:alert(3)) [本地](file:///tmp/a)'}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('[href^="file:"]')).toBeNull();
    expect(container).toHaveTextContent("危险");
    expect(container).toHaveTextContent("本地");
  });

  it("confirms a safe external link and never calls window.open", () => {
    const onOpenExternalLink = vi.fn();
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <MarkdownMessage
        content="[官方文档](https://example.com/docs?q=1)"
        onOpenExternalLink={onOpenExternalLink}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "官方文档" }));
    expect(screen.getByRole("dialog", { name: "确认打开外部链接" })).toHaveTextContent("https://example.com/docs?q=1");
    fireEvent.click(screen.getByRole("button", { name: /打开链接/u }));

    expect(onOpenExternalLink).toHaveBeenCalledWith("https://example.com/docs?q=1");
    expect(windowOpen).not.toHaveBeenCalled();
    windowOpen.mockRestore();
  });

  it("keeps safe URL transformation limited to supported link and image protocols", () => {
    expect(safeMarkdownUrlTransform("https://example.com/a.png", "src")).toBe("https://example.com/a.png");
    expect(safeMarkdownUrlTransform("mailto:user@example.com", "href")).toBe("mailto:user@example.com");
    expect(safeMarkdownUrlTransform("#note-1", "href")).toBe("#note-1");
    expect(safeMarkdownUrlTransform("data:image/png;base64,x", "src")).toBeNull();
    expect(safeMarkdownUrlTransform("blob:https://example.com/id", "src")).toBeNull();
    expect(safeMarkdownUrlTransform("https://example.com", "poster")).toBeNull();
  });
});
