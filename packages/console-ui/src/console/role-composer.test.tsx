import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";

import {
  ROLE_COMPLETIONS,
  RoleComposer,
  findActiveRoleTrigger,
  hasLegalRoleMention,
  insertRoleMention,
  type RoleCompletion,
} from "./role-composer";

const teamRoles: RoleCompletion[] = [
  { handle: "dev", label: "开发", description: "实现功能" },
  { handle: "qa", label: "测试", description: "质量保证" },
];

describe("RoleComposer", () => {
  it("opens seven role options after @ and inserts a legal handle by mouse without losing surrounding text", () => {
    render(<ControlledComposer initialValue="前文 @d 后文" />);
    const input = screen.getByRole("textbox");
    setCaret(input, "前文 @d".length);

    expect(screen.getByRole("listbox", { name: "角色补全面板" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);

    fireEvent.mouseDown(screen.getByRole("option", { name: /开发/u }));
    expect(input).toHaveValue("前文 @dev 后文");
  });

  it("shows all legal roles for an empty @ trigger", () => {
    render(<ControlledComposer initialValue="@" />);
    const input = screen.getByRole("textbox");
    setCaret(input, 1);

    expect(screen.getAllByRole("option")).toHaveLength(ROLE_COMPLETIONS.length);
    expect(screen.getByRole("option", { name: /技术负责人/u })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /产品/u })).toBeInTheDocument();
  });

  it("supports keyboard selection and Escape without modifying the value", () => {
    render(<ControlledComposer initialValue="@" />);
    const input = screen.getByRole("textbox");
    setCaret(input, 1);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("@dev ");

    fireEvent.change(input, { target: { value: "@" } });
    setCaret(input, 1);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "角色补全面板" })).not.toBeInTheDocument();
    expect(input).toHaveValue("@");
  });

  it("blocks control insertion of a second legal role mention", () => {
    render(<ControlledComposer initialValue="@dev 已在消息里，继续 @" />);
    const input = screen.getByRole("textbox");
    setCaret(input, "@dev 已在消息里，继续 @".length);

    expect(screen.queryByRole("listbox", { name: "角色补全面板" })).not.toBeInTheDocument();
    expect(insertRoleMention("@dev 已在消息里，继续 @", "@dev 已在消息里，继续 @".length, "qa").value).toBe(
      "@dev 已在消息里，继续 @"
    );
  });

  it("ignores inline and fenced code mentions while recognizing real protocol mentions", () => {
    expect(hasLegalRoleMention("`@dev` 只是示例")).toBe(false);
    expect(hasLegalRoleMention("```text\n@qa\n```\n只是示例")).toBe(false);
    expect(hasLegalRoleMention("邮件 a@dev.com 不算角色")).toBe(false);
    expect(hasLegalRoleMention("@unknown 不算角色")).toBe(false);
    expect(hasLegalRoleMention("@product-manager 请确认")).toBe(true);

    expect(findActiveRoleTrigger("`@dev` 继续 @", "`@dev` 继续 @".length)).toEqual({
      start: "`@dev` 继续 ".length,
      end: "`@dev` 继续 @".length,
      query: ""
    });
  });

  it("submits the generated value through the send button", () => {
    const onSubmit = vi.fn();
    render(<ControlledComposer initialValue="@qa 请走查" onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: /发送/u }));
    expect(onSubmit).toHaveBeenCalledWith("@qa 请走查");
  });

  it("uses only the supplied team's members for completion", () => {
    render(<ControlledComposer initialValue="@" roles={teamRoles} />);
    const input = screen.getByRole("textbox");
    setCaret(input, 1);

    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: /开发/u })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /测试/u })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /CEO/u })).not.toBeInTheDocument();
  });

  it("keeps an out-of-team handle as ordinary text while completing a team member", () => {
    const onSubmit = vi.fn();
    render(<ControlledComposer
      initialValue="@ceo 仅作为文本，交给 @"
      roles={teamRoles}
      onSubmit={onSubmit}
    />);
    const input = screen.getByRole("textbox");
    setCaret(input, "@ceo 仅作为文本，交给 @".length);

    fireEvent.mouseDown(screen.getByRole("option", { name: /测试/u }));
    expect(input).toHaveValue("@ceo 仅作为文本，交给 @qa ");
    fireEvent.click(screen.getByRole("button", { name: /发送/u }));
    expect(onSubmit).toHaveBeenCalledWith("@ceo 仅作为文本，交给 @qa ");
  });
});

function ControlledComposer({
  initialValue,
  onSubmit,
  roles,
}: {
  initialValue: string;
  onSubmit?: (value: string) => void;
  roles?: readonly RoleCompletion[];
}): JSX.Element {
  const [value, setValue] = useState(initialValue);
  return <RoleComposer value={value} onValueChange={setValue} onSubmit={onSubmit} roles={roles} />;
}

function setCaret(input: HTMLElement, position: number) {
  const textInput = input as HTMLInputElement;
  textInput.setSelectionRange(position, position);
  fireEvent.focus(textInput);
  fireEvent.select(textInput);
}
