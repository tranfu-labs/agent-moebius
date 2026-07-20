import { ArrowRight, Check, ChevronRight, Circle, CheckCircle2, Code2, FileText } from "lucide-react";
import { useState, type KeyboardEvent, type MouseEvent } from "react";

import { cn } from "@/lib/utils";

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

const roleAvatars: Record<string, string> = {
  ceo: "C",
  dev: "开",
  "dev-manager": "技",
  "hermes-user": "用",
  "product-manager": "产",
  qa: "测",
  secretary: "秘",
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
  const resolvedStage = nonBlank(stage) ?? parsed.stage;
  const stageLabel = localizeStage(resolvedStage);
  const conclusionText = nonBlank(conclusion) ?? parsed.conclusion ?? "暂无结论摘要";
  const handoffText = nonBlank(handoff) ?? parsed.handoff ?? "暂无下一步";

  const toggle = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    setOpen((value) => !value);
  };

  return (
    <details className={cn("group border-t border-line text-sm text-sub", className)} open={open}>
      <summary
        className="grid cursor-pointer list-none grid-cols-[32px_minmax(0,1fr)] gap-x-3 rounded-md outline-none transition-colors hover:bg-hover [&::-webkit-details-marker]:hidden"
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
        <span className="relative mt-0.5 h-8 w-8" aria-hidden="true">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ava-bg text-xs font-medium text-ava-fg">
            {roleAvatars[role] ?? "协"}
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-[15px] w-[15px] items-center justify-center rounded-full border border-line bg-card text-sub">
            <StageBadgeIcon stage={resolvedStage} />
          </span>
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="font-medium text-ink">{roleLabel}</span>
            <span className="text-xs font-normal text-sub">{stageLabel}</span>
            <span className="ml-auto flex flex-none items-center gap-2">
              <StageStatusIcon stage={resolvedStage} />
              {timestamp ? <span className="text-xs text-hint tnum">{timestamp}</span> : null}
              <ChevronRight
                className={cn("h-4 w-4 text-hint transition-transform", open ? "rotate-90" : "")}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </span>
          </span>
          <span className="mt-1 block min-w-0 leading-6 text-ink">{conclusionText}</span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-sub">
            <ArrowRight className="h-3 w-3 flex-none text-hint" strokeWidth={1.5} aria-hidden="true" />
            <span className="min-w-0">{handoffText}</span>
          </span>
        </span>
      </summary>
      <pre className="ml-11 mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words border-l border-line pl-4 font-mono text-xs leading-5 text-ink">{rawMarkdown}</pre>
    </details>
  );
}

function StageBadgeIcon({ stage }: { stage: string | null }): JSX.Element {
  const className = "h-2.5 w-2.5";
  if (stage === "plan-written") {
    return <FileText className={className} strokeWidth={2} />;
  }
  if (stage === "code-verified") {
    return <Check className={className} strokeWidth={2} />;
  }
  return <Code2 className={className} strokeWidth={2} />;
}

function StageStatusIcon({ stage }: { stage: string | null }): JSX.Element {
  if (stage === "plan-written" || stage === "code-verified") {
    return <CheckCircle2 className="h-4 w-4 text-hint" strokeWidth={1.5} aria-hidden="true" />;
  }
  return <Circle className="h-4 w-4 text-hint" strokeWidth={1.5} aria-hidden="true" />;
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
