import * as React from "react";
import { ArrowUp, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import {
  StructuredAttachmentList,
  hasBlockingComposerAttachment,
  readyComposerAttachmentIds,
  type ComposerAttachment,
} from "@/console/structured-attachments";

export interface RoleCompletion {
  handle: string;
  label: string;
  description: string;
  avatar?: string;
}

export const ROLE_COMPLETIONS = [
  { handle: "ceo", label: "CEO", description: "澄清目标并编排任务", avatar: "C" },
  { handle: "dev", label: "开发", description: "写方案并实现代码", avatar: "开" },
  { handle: "qa", label: "测试", description: "审查方案与测试设计", avatar: "测" },
  { handle: "dev-manager", label: "技术负责人", description: "技术决策与质量把关", avatar: "技" },
  { handle: "product-manager", label: "产品", description: "确认需求与验收范围", avatar: "产" },
  { handle: "hermes-user", label: "用户代表", description: "从用户视角验收体验", avatar: "用" },
  { handle: "secretary", label: "秘书", description: "维护 CEO 规则与文档", avatar: "秘" },
] as const satisfies readonly RoleCompletion[];

export type RoleHandle = string;

export interface RoleComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit?: (value: string, attachmentIds: readonly string[]) => void;
  attachments?: readonly ComposerAttachment[];
  onFilesAdded?: (files: File[]) => void;
  onAttachmentRemove?: (clientId: string) => void;
  onAttachmentRetry?: (clientId: string) => void;
  placeholder?: string;
  statusText?: string;
  submitLabel?: string;
  disabled?: boolean;
  submitDisabled?: boolean;
  roles?: readonly RoleCompletion[];
  context?: React.ReactNode;
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

export function hasLegalRoleMention(
  text: string,
  ignoreRange?: TextRange,
  roles: readonly RoleCompletion[] = ROLE_COMPLETIONS,
): boolean {
  return findLegalRoleMentions(text, ignoreRange, roles).length > 0;
}

export function findLegalRoleMentions(
  text: string,
  ignoreRange?: TextRange,
  roles: readonly RoleCompletion[] = ROLE_COMPLETIONS,
): TextRange[] {
  if (roles.length === 0) {
    return [];
  }

  const masked = maskCodeSpans(text);
  const mentions: TextRange[] = [];
  const roleHandlePattern = roles
    .map((role) => escapeRegExp(role.handle))
    .sort((left, right) => right.length - left.length)
    .join("|");
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

export function insertRoleMention(
  text: string,
  cursor: number,
  handle: RoleHandle,
  roles: readonly RoleCompletion[] = ROLE_COMPLETIONS,
): { value: string; cursor: number } {
  const trigger = findActiveRoleTrigger(text, cursor);
  if (!trigger || !roles.some((role) => role.handle === handle) || hasLegalRoleMention(text, trigger, roles)) {
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
  submitLabel = "发送消息",
  disabled = false,
  submitDisabled = false,
  roles: roleOptions = ROLE_COMPLETIONS,
  context,
  className,
  attachments = [],
  onFilesAdded,
  onAttachmentRemove,
  onAttachmentRetry,
}: RoleComposerProps): JSX.Element {
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const pendingCaretRef = React.useRef<number | null>(null);
  const listboxId = React.useId();
  const [focused, setFocused] = React.useState(false);
  const [caret, setCaret] = React.useState(value.length);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [closedTriggerKey, setClosedTriggerKey] = React.useState<string | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const readyAttachmentIds = readyComposerAttachmentIds(attachments);
  const attachmentBlocked = hasBlockingComposerAttachment(attachments);
  const canSubmit = !disabled
    && !submitDisabled
    && !attachmentBlocked
    && (value.trim() !== "" || readyAttachmentIds.length > 0);

  const trigger = findActiveRoleTrigger(value, caret);
  const triggerKey = trigger ? `${value}:${trigger.start}:${trigger.end}` : null;
  const matchingRoleOptions = trigger ? matchingRoles(roleOptions, trigger.query) : [];
  const panelOpen =
    focused &&
    !disabled &&
    trigger !== null &&
    matchingRoleOptions.length > 0 &&
    !hasLegalRoleMention(value, trigger, roleOptions) &&
    closedTriggerKey !== triggerKey;

  React.useEffect(() => {
    setActiveIndex(0);
  }, [triggerKey, matchingRoleOptions.length]);

  React.useLayoutEffect(() => {
    if (pendingCaretRef.current === null || !inputRef.current) {
      return;
    }

    const nextCaret = pendingCaretRef.current;
    pendingCaretRef.current = null;
    inputRef.current.focus();
    inputRef.current.setSelectionRange(nextCaret, nextCaret);
  }, [value]);

  const updateCaretFromInput = (input: HTMLTextAreaElement) => {
    setCaret(input.selectionStart ?? input.value.length);
  };

  const selectRole = (handle: RoleHandle) => {
    const currentCaret = inputRef.current?.selectionStart ?? caret;
    const next = insertRoleMention(value, currentCaret, handle, roleOptions);
    if (next.value === value) {
      return;
    }

    pendingCaretRef.current = next.cursor;
    setCaret(next.cursor);
    setFocused(true);
    setClosedTriggerKey(null);
    onValueChange(next.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (panelOpen && event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % matchingRoleOptions.length);
      return;
    }

    if (panelOpen && event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + matchingRoleOptions.length) % matchingRoleOptions.length);
      return;
    }

    if (panelOpen && event.key === "Enter") {
      event.preventDefault();
      selectRole(matchingRoleOptions[activeIndex].handle);
      return;
    }

    if (panelOpen && event.key === "Escape") {
      event.preventDefault();
      setClosedTriggerKey(triggerKey);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && onSubmit && canSubmit) {
      event.preventDefault();
      onSubmit(value, readyAttachmentIds);
    }
  };

  return (
    <div className={cn("relative w-full", className)}>
      {panelOpen ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute bottom-full left-0 z-30 mb-2 w-full rounded-xl border border-line bg-card p-1.5 shadow-overlay"
          aria-label="角色补全面板"
        >
          {matchingRoleOptions.map((role, index) => (
            <button
              key={role.handle}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                "grid w-full grid-cols-[28px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-hover",
                index === activeIndex ? "bg-sel" : "bg-transparent",
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                selectRole(role.handle);
              }}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-sunken text-xs font-semibold text-ava-fg">
                {role.avatar ?? (role.label.trim().charAt(0) || role.handle.charAt(0).toUpperCase())}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{role.label}</span>
                <span className="block truncate text-xs text-sub">{role.description}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          "relative overflow-hidden rounded-[18px] border border-line-strong bg-input shadow-overlay",
          dragActive && "border-accent ring-2 ring-accent/20",
        )}
        onDragEnter={(event) => {
          if (!disabled && event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setDragActive(true);
          }
        }}
        onDragOver={(event) => {
          if (!disabled && event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (!disabled && event.dataTransfer.files.length > 0) {
            onFilesAdded?.(Array.from(event.dataTransfer.files));
          }
        }}
      >
        {context ? <div className="border-b border-line bg-sunken px-3.5 py-2.5">{context}</div> : null}
        <StructuredAttachmentList
          attachments={attachments}
          mode="draft"
          className="border-b border-line px-3.5 py-3"
          onRemove={onAttachmentRemove}
          onRetry={onAttachmentRetry}
        />
        <div className="relative min-h-[76px]">
          <textarea
            ref={inputRef}
            value={value}
            rows={2}
            disabled={disabled}
            placeholder={placeholder}
            aria-label="消息内容"
            aria-autocomplete="list"
            aria-expanded={panelOpen}
            aria-controls={panelOpen ? listboxId : undefined}
            className="block min-h-[76px] w-full resize-none bg-transparent px-4 py-3.5 pr-24 text-sm leading-6 text-ink outline-none placeholder:text-hint disabled:cursor-not-allowed"
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
            onPaste={(event) => {
              const imageFiles = Array.from(event.clipboardData.items)
                .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
                .flatMap((item) => {
                  const file = item.getAsFile();
                  return file === null ? [] : [file];
                });
              if (!disabled && imageFiles.length > 0) {
                event.preventDefault();
                onFilesAdded?.(imageFiles);
              }
            }}
            onKeyUp={(event) => updateCaretFromInput(event.currentTarget)}
            onSelect={(event) => updateCaretFromInput(event.currentTarget)}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            tabIndex={-1}
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (files.length > 0) onFilesAdded?.(files);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute bottom-3 right-12 h-8 w-8 rounded-full p-0"
            disabled={disabled}
            aria-label="添加附件"
            title="添加附件"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            className="absolute bottom-3 right-3 h-8 w-8 rounded-full p-0"
            disabled={!canSubmit}
            aria-label={submitLabel}
            onClick={() => onSubmit?.(value, readyAttachmentIds)}
          >
            <ArrowUp className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </div>
      </div>
      {statusText ? <p className="mt-1.5 px-2 text-xs text-hint">{statusText}</p> : null}
    </div>
  );
}

function matchingRoles(roles: readonly RoleCompletion[], query: string): readonly RoleCompletion[] {
  if (query.length === 0) {
    return roles;
  }

  return roles.filter((role) => role.handle.startsWith(query));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  return left.start < right.end && right.start < left.end;
}

function hasBoundaryBefore(text: string, atIndex: number): boolean {
  if (atIndex === 0) {
    return true;
  }
  return /[\s([{，。！？、；：]/u.test(text[atIndex - 1] ?? "");
}

function hasBoundaryAfter(text: string, endIndex: number): boolean {
  if (endIndex >= text.length) {
    return true;
  }
  return /[\s)\]}，。！？、；：]/u.test(text[endIndex] ?? "");
}
