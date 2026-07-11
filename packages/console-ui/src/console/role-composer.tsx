import * as React from "react";
import { Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";

export const ROLE_COMPLETIONS = [
  { handle: "ceo", label: "CEO", description: "澄清目标并编排任务", avatar: "C" },
  { handle: "dev", label: "开发", description: "写方案并实现代码", avatar: "开" },
  { handle: "qa", label: "测试", description: "审查方案与测试设计", avatar: "测" },
  { handle: "dev-manager", label: "技术负责人", description: "技术决策与质量把关", avatar: "技" },
  { handle: "product-manager", label: "产品", description: "确认需求与验收范围", avatar: "产" },
  { handle: "hermes-user", label: "用户代表", description: "从用户视角验收体验", avatar: "用" },
  { handle: "secretary", label: "秘书", description: "维护 CEO 规则与文档", avatar: "秘" }
] as const;

export type RoleHandle = (typeof ROLE_COMPLETIONS)[number]["handle"];

export interface RoleComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  statusText?: string;
  submitLabel?: string;
  disabled?: boolean;
  className?: string;
}

export interface RoleTrigger {
  start: number;
  end: number;
  query: string;
}

interface TextRange {
  start: number;
  end: number;
}

const roleHandlePattern = ROLE_COMPLETIONS.map((role) => role.handle)
  .sort((left, right) => right.length - left.length)
  .join("|");

export function maskCodeSpans(text: string): string {
  const chars = [...text];
  let index = 0;

  while (index < chars.length) {
    if (text.startsWith("```", index)) {
      const close = text.indexOf("```", index + 3);
      const end = close === -1 ? chars.length : close + 3;
      for (let cursor = index; cursor < end; cursor += 1) {
        chars[cursor] = " ";
      }
      index = end;
      continue;
    }

    if (chars[index] === "`") {
      const close = text.indexOf("`", index + 1);
      const end = close === -1 ? chars.length : close + 1;
      for (let cursor = index; cursor < end; cursor += 1) {
        chars[cursor] = " ";
      }
      index = end;
      continue;
    }

    index += 1;
  }

  return chars.join("");
}

export function findActiveRoleTrigger(text: string, cursor: number): RoleTrigger | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const beforeCursor = text.slice(0, safeCursor);
  const atIndex = beforeCursor.lastIndexOf("@");

  if (atIndex < 0) {
    return null;
  }

  const query = beforeCursor.slice(atIndex + 1);
  if (!/^[A-Za-z-]*$/u.test(query)) {
    return null;
  }

  const masked = maskCodeSpans(text);
  if (masked[atIndex] !== "@" || !hasBoundaryBefore(masked, atIndex)) {
    return null;
  }

  return { start: atIndex, end: safeCursor, query: query.toLowerCase() };
}

export function hasLegalRoleMention(text: string, ignoreRange?: TextRange): boolean {
  return findLegalRoleMentions(text, ignoreRange).length > 0;
}

export function findLegalRoleMentions(text: string, ignoreRange?: TextRange): TextRange[] {
  const masked = maskCodeSpans(text);
  const mentions: TextRange[] = [];
  const matcher = new RegExp(`@(${roleHandlePattern})`, "gu");

  for (const match of masked.matchAll(matcher)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;

    if (ignoreRange && rangesOverlap({ start, end }, ignoreRange)) {
      continue;
    }

    if (hasBoundaryBefore(masked, start) && hasBoundaryAfter(masked, end)) {
      mentions.push({ start, end });
    }
  }

  return mentions;
}

export function insertRoleMention(text: string, cursor: number, handle: RoleHandle): { value: string; cursor: number } {
  const trigger = findActiveRoleTrigger(text, cursor);
  if (!trigger || hasLegalRoleMention(text, trigger)) {
    return { value: text, cursor };
  }

  const nextCharacter = text[trigger.end];
  const replacement = `@${handle}${nextCharacter && /\s/u.test(nextCharacter) ? "" : " "}`;
  const value = `${text.slice(0, trigger.start)}${replacement}${text.slice(trigger.end)}`;
  return { value, cursor: trigger.start + replacement.length };
}

export function RoleComposer({
  value,
  onValueChange,
  onSubmit,
  placeholder = "描述你的目标，@ 一个角色开始…",
  statusText,
  submitLabel = "发送",
  disabled = false,
  className
}: RoleComposerProps): JSX.Element {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pendingCaretRef = React.useRef<number | null>(null);
  const listboxId = React.useId();
  const [focused, setFocused] = React.useState(false);
  const [caret, setCaret] = React.useState(value.length);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [closedTriggerKey, setClosedTriggerKey] = React.useState<string | null>(null);

  const trigger = findActiveRoleTrigger(value, caret);
  const triggerKey = trigger ? `${value}:${trigger.start}:${trigger.end}` : null;
  const roles = trigger ? matchingRoles(trigger.query) : [];
  const panelOpen =
    focused &&
    !disabled &&
    trigger !== null &&
    roles.length > 0 &&
    !hasLegalRoleMention(value, trigger) &&
    closedTriggerKey !== triggerKey;

  React.useEffect(() => {
    setActiveIndex(0);
  }, [triggerKey, roles.length]);

  React.useLayoutEffect(() => {
    if (pendingCaretRef.current === null || !inputRef.current) {
      return;
    }

    const nextCaret = pendingCaretRef.current;
    pendingCaretRef.current = null;
    inputRef.current.focus();
    inputRef.current.setSelectionRange(nextCaret, nextCaret);
  }, [value]);

  const updateCaretFromInput = (input: HTMLInputElement) => {
    setCaret(input.selectionStart ?? input.value.length);
  };

  const selectRole = (handle: RoleHandle) => {
    const currentCaret = inputRef.current?.selectionStart ?? caret;
    const next = insertRoleMention(value, currentCaret, handle);
    if (next.value === value) {
      return;
    }

    pendingCaretRef.current = next.cursor;
    setCaret(next.cursor);
    setFocused(true);
    setClosedTriggerKey(null);
    onValueChange(next.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (panelOpen && event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % roles.length);
      return;
    }

    if (panelOpen && event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + roles.length) % roles.length);
      return;
    }

    if (panelOpen && event.key === "Enter") {
      event.preventDefault();
      selectRole(roles[activeIndex].handle);
      return;
    }

    if (panelOpen && event.key === "Escape") {
      event.preventDefault();
      setClosedTriggerKey(triggerKey);
      return;
    }

    if (event.key === "Enter" && onSubmit && value.trim() !== "") {
      event.preventDefault();
      onSubmit(value);
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-input p-1.5">
          <Input
            ref={inputRef}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            aria-autocomplete="list"
            aria-expanded={panelOpen}
            aria-controls={panelOpen ? listboxId : undefined}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent px-2 py-1 focus-visible:outline-none"
            onChange={(event) => {
              setClosedTriggerKey(null);
              onValueChange(event.currentTarget.value);
              updateCaretFromInput(event.currentTarget);
            }}
            onFocus={(event) => {
              setFocused(true);
              updateCaretFromInput(event.currentTarget);
            }}
            onBlur={() => setFocused(false)}
            onClick={(event) => updateCaretFromInput(event.currentTarget)}
            onKeyDown={handleKeyDown}
            onKeyUp={(event) => updateCaretFromInput(event.currentTarget)}
            onSelect={(event) => updateCaretFromInput(event.currentTarget)}
          />
          <Button
            type="button"
            size="sm"
            disabled={disabled || value.trim() === ""}
            onClick={() => onSubmit?.(value)}
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            {submitLabel}
          </Button>
        </div>

        {panelOpen ? (
          <div
            id={listboxId}
            role="listbox"
            className="absolute left-0 top-full z-20 mt-1.5 w-full rounded-lg border border-line bg-card p-1 shadow-overlay"
            aria-label="角色补全面板"
          >
            {roles.map((role, index) => (
              <button
                key={role.handle}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "grid w-full grid-cols-[28px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-hover",
                  index === activeIndex ? "bg-sel" : "bg-transparent"
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectRole(role.handle);
                }}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ava-bg text-xs font-semibold text-ava-fg">
                  {role.avatar}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{role.label}</span>
                  <span className="block truncate text-xs text-sub">{role.description}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {statusText ? <p className="mt-1.5 text-xs text-hint">{statusText}</p> : null}
    </div>
  );
}

function matchingRoles(query: string): ReadonlyArray<(typeof ROLE_COMPLETIONS)[number]> {
  if (query.length === 0) {
    return ROLE_COMPLETIONS;
  }

  return ROLE_COMPLETIONS.filter((role) => role.handle.startsWith(query));
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  return left.start < right.end && right.start < left.end;
}

function hasBoundaryBefore(text: string, atIndex: number): boolean {
  if (atIndex === 0) {
    return true;
  }

  return !/[A-Za-z0-9_.-]/u.test(text[atIndex - 1]);
}

function hasBoundaryAfter(text: string, endIndex: number): boolean {
  if (endIndex >= text.length) {
    return true;
  }

  return !/[A-Za-z0-9_.-]/u.test(text[endIndex]);
}
