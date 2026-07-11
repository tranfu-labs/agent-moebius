import { ChevronRight } from "lucide-react";
import { useState, type KeyboardEvent, type MouseEvent } from "react";

import { cn } from "@/lib/utils";
import { Card } from "@/ui/card";

export type AgentStage = "in-progress" | "plan-written" | "code-verified";

export interface AgentMessageProps {
  role: string;
  rawMarkdown: string;
  stage?: AgentStage | string | null;
  conclusion?: string | null;
  handoff?: string | null;
  timestamp?: string | null;
  defaultOpen?: boolean;
  className?: string;
}

const roleLabels: Record<string, string> = {
  ceo: "CEO",
  dev: "开发",
  "dev-manager": "技术负责人",
  "hermes-user": "用户代表",
  "product-manager": "产品",
  qa: "测试",
  secretary: "秘书",
  user: "你",
};

const stageLabels: Record<AgentStage, string> = {
  "code-verified": "代码已验证",
  "in-progress": "进行中",
  "plan-written": "方案已写好",
};

export function AgentMessage({
  role,
  rawMarkdown,
  stage,
  conclusion,
  handoff,
  timestamp,
  defaultOpen = false,
  className,
}: AgentMessageProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const parsed = parseAgentMarkdown(rawMarkdown);
  const roleLabel = localizeRole(role);
  const stageLabel = localizeStage(nonBlank(stage) ?? parsed.stage);
  const conclusionText = nonBlank(conclusion) ?? parsed.conclusion ?? "暂无结论摘要";
  const handoffText = nonBlank(handoff) ?? parsed.handoff ?? "暂无下一步";

  const toggle = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    setOpen((value) => !value);
  };

  return (
    <details className={cn("group text-sm text-sub", className)} open={open}>
      <summary
        className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 gap-y-1 rounded-md px-1 py-1 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
        aria-expanded={open}
        aria-label={open ? `收起${roleLabel}原文` : `展开${roleLabel}原文`}
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            toggle(event);
          }
        }}
      >
        <ChevronRight
          className={cn("mt-0.5 h-4 w-4 text-hint transition-transform", open ? "rotate-90" : "")}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-semibold text-ink">{roleLabel}</span>
            <span className="text-hint">·</span>
            <span>{stageLabel}</span>
            {timestamp ? <span className="text-xs text-hint tnum">{timestamp}</span> : null}
          </span>
          <span className="mt-1 block min-w-0 text-ink">
            <span className="text-sub">结论：</span>
            <span>{conclusionText}</span>
          </span>
          <span className="mt-0.5 block min-w-0">{handoffText}</span>
        </span>
        <span className="self-start whitespace-nowrap pt-0.5 text-xs text-hint">{open ? "收起" : "点开全文"}</span>
      </summary>
      <Card className="ml-6 mt-2 rounded-lg bg-sunken p-3">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-ink">{rawMarkdown}</pre>
      </Card>
    </details>
  );
}

export function parseAgentMarkdown(rawMarkdown: string): {
  conclusion: string | null;
  stage: AgentStage | null;
  handoff: string | null;
} {
  return {
    conclusion: firstParagraph(extractSection(rawMarkdown, "结论")),
    stage: extractStage(rawMarkdown),
    handoff: extractHandoff(rawMarkdown),
  };
}

function extractSection(markdown: string, title: string): string | null {
  const lines = markdown.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start === -1) {
    return null;
  }

  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/u.test(line.trim())) {
      break;
    }
    body.push(line);
  }

  return body.join("\n");
}

function firstParagraph(section: string | null): string | null {
  if (!section) {
    return null;
  }

  for (const paragraph of section.split(/\n\s*\n/u)) {
    const text = paragraph.trim().replace(/\s+/gu, " ");
    if (text) {
      return text;
    }
  }

  return null;
}

function extractStage(markdown: string): AgentStage | null {
  const match = markdown.match(/<!--\s*agent-moebius:stage=(in-progress|plan-written|code-verified)\s*-->/u);
  return match ? (match[1] as AgentStage) : null;
}

function extractHandoff(markdown: string): string | null {
  const nextSection = extractSection(markdown, "下一步");
  if (!nextSection) {
    return null;
  }

  const line = nextSection
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .find((item) => item.startsWith("交棒：") || item.startsWith("等待真人："));

  if (!line) {
    return null;
  }

  if (line.startsWith("等待真人：")) {
    const text = line.slice("等待真人：".length).trim();
    return text ? `等你：${text}` : "等你";
  }

  const handoff = line.slice("交棒：".length).trim();
  const match = handoff.match(/^@([a-z-]+)\s*(.*)$/u);
  if (!match) {
    return `交棒：${handoff}`;
  }

  const target = localizeRole(match[1]);
  const rest = match[2].trim();
  return rest ? `交给「${target}」${rest}` : `交给「${target}」`;
}

function localizeRole(role: string): string {
  return roleLabels[role] ?? "协作者";
}

function localizeStage(stage: string | null): string {
  if (stage === "in-progress" || stage === "plan-written" || stage === "code-verified") {
    return stageLabels[stage];
  }

  return "阶段未知";
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
