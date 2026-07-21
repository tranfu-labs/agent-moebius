import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentMarkdownMentionEditor,
  findAgentMentionTrigger,
  insertAgentMention,
  matchingAgentMentionMembers,
  segmentAgentMentions,
  type AgentMentionMember,
} from "./agent-markdown-mention-editor";

const teamMembers: AgentMentionMember[] = [
  { slug: "manager", displayName: "开发经理" },
  { slug: "dev", displayName: "开发" },
  { slug: "qa", displayName: "测试" },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("agent mention text model", () => {
  it("finds a slug trigger and inserts only literal @slug text", () => {
    expect(findAgentMentionTrigger("交棒给 @de", 7)).toEqual({ start: 4, end: 7, query: "de" });
    expect(insertAgentMention("交棒给 @de", 7, "dev")).toEqual({
      value: "交棒给 @dev ",
      cursor: 9,
    });
  });

  it("matches only the members supplied by the current team", () => {
    expect(matchingAgentMentionMembers(teamMembers, "d")).toEqual([
      { slug: "dev", displayName: "开发" },
    ]);
    expect(matchingAgentMentionMembers(teamMembers, "security")).toEqual([]);
  });

  it("decorates exact member references without changing the source text", () => {
    const source = "请 @dev 实现，邮件 dev@example.com 不处理，@developer 也不处理。";
    const segments = segmentAgentMentions(source, teamMembers);

    expect(segments).toContainEqual({
      kind: "mention",
      member: { slug: "dev", displayName: "开发" },
    });
    expect(segments.map((segment) => segment.kind === "text" ? segment.text : `@${segment.member.slug}`).join(""))
      .toBe(source);
  });
});

describe("AgentMarkdownMentionEditor", () => {
  it("shows readable names while preserving literal source across a rename", () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <AgentMarkdownMentionEditor
        value="交棒给 @dev。"
        members={teamMembers}
        label="AGENT.md"
        onValueChange={onValueChange}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "AGENT.md" });
    expect(editor).toHaveAttribute("data-raw-markdown", "交棒给 @dev。");
    expect(screen.getByRole("button", { name: "开发，复制 @dev" })).toBeVisible();

    rerender(
      <AgentMarkdownMentionEditor
        value="交棒给 @dev。"
        members={teamMembers.map((member) => member.slug === "dev"
          ? { ...member, displayName: "软件工程师" }
          : member)}
        label="AGENT.md"
        onValueChange={onValueChange}
      />,
    );

    expect(screen.getByRole("button", { name: "软件工程师，复制 @dev" })).toBeVisible();
    expect(editor).toHaveAttribute("data-raw-markdown", "交棒给 @dev。");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("shows current-team completion results with both name and slug and inserts raw text", () => {
    const onValueChange = vi.fn();
    render(
      <AgentMarkdownMentionEditor
        value="下一步 @d"
        members={teamMembers}
        label="AGENT.md"
        onValueChange={onValueChange}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "AGENT.md" });
    placeCaretAtEnd(editor);
    fireEvent.focus(editor);
    fireEvent.keyUp(editor, { key: "d" });

    const listbox = screen.getByRole("listbox", { name: "团队成员提及补全" });
    const option = within(listbox).getByRole("option");
    expect(option).toHaveTextContent("开发");
    expect(option).toHaveTextContent("@dev");
    expect(within(listbox).queryByText("@security")).not.toBeInTheDocument();

    fireEvent.mouseDown(option);
    expect(onValueChange).toHaveBeenCalledWith("下一步 @dev ");
  });

  it("serializes decorated mentions back to plain @slug during editing", () => {
    const onValueChange = vi.fn();
    render(
      <AgentMarkdownMentionEditor
        value="交棒给 @dev"
        members={teamMembers}
        label="AGENT.md"
        onValueChange={onValueChange}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "AGENT.md" });
    editor.append(document.createTextNode(" 完成"));
    fireEvent.input(editor);

    expect(onValueChange).toHaveBeenCalledWith("交棒给 @dev 完成");
  });

  it("restores the caret inside ordinary text after a controlled rerender", () => {
    function ControlledEditor(): JSX.Element {
      const [value, setValue] = useState("abcd");
      return (
        <AgentMarkdownMentionEditor
          value={value}
          members={teamMembers}
          label="AGENT.md"
          onValueChange={setValue}
        />
      );
    }
    render(<ControlledEditor />);

    const editor = screen.getByRole("textbox", { name: "AGENT.md" });
    const textNode = editor.querySelector("span")?.firstChild;
    expect(textNode).not.toBeNull();
    textNode!.textContent = "abXcd";
    const range = document.createRange();
    range.setStart(textNode!, 3);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.input(editor);

    expect(editor).toHaveAttribute("data-raw-markdown", "abXcd");
    expect(window.getSelection()?.anchorOffset).toBe(3);
  });

  it("commits IME composition once through the real input event path", () => {
    const onValueChange = vi.fn();
    render(
      <AgentMarkdownMentionEditor
        value=""
        members={teamMembers}
        label="AGENT.md"
        onValueChange={onValueChange}
      />,
    );
    const editor = screen.getByRole("textbox", { name: "AGENT.md" });

    fireEvent.compositionStart(editor);
    fireEvent.input(editor, { target: { textContent: "中" } });
    fireEvent.input(editor, { target: { textContent: "中文" } });
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.compositionEnd(editor, { data: "文" });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("中文");
  });

  it("lets keyboard users focus and copy the underlying slug", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <AgentMarkdownMentionEditor
        value="交棒给 @qa"
        members={teamMembers}
        label="AGENT.md"
        onValueChange={vi.fn()}
      />,
    );

    const mention = screen.getByRole("button", { name: "测试，复制 @qa" });
    act(() => mention.focus());
    expect(mention).toHaveFocus();
    expect(mention).toHaveAttribute("title", "@qa · 点击复制");
    await act(async () => {
      fireEvent.click(mention);
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("@qa");
    expect(await screen.findByText("已复制 @qa")).toBeInTheDocument();
  });
});

function placeCaretAtEnd(element: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
