import { FileText, Square } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { sanitizeMachineText } from "@/console/machine-text";
import { MarkdownMessage } from "@/console/markdown-message";

export type RunBlockStepStatus = "completed" | "running" | "pending";

export interface RunBlockStep {
  id?: string;
  title: string;
  status: RunBlockStepStatus;
  summary?: string | null;
  rawOutput?: string | null;
}

export interface RunBlockProps {
  role: string;
  elapsedTime?: string | null;
  summary?: string | null;
  rawOutput?: string | null;
  steps?: RunBlockStep[] | null;
  liveMarkdown?: string | null;
  onOpenExternalLink?: (url: string) => void;
  onOpenOutput?: (rawOutput: string | null) => void;
  onInterrupt?: () => void;
  interruptLabel?: string;
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

export function RunBlock({
  role,
  elapsedTime: _elapsedTime,
  summary,
  rawOutput,
  steps,
  liveMarkdown,
  onOpenExternalLink,
  onOpenOutput,
  onInterrupt,
  interruptLabel,
  className,
}: RunBlockProps): JSX.Element {
  const roleLabel = localizeRole(role);
  const usableSteps = steps?.length ? steps : null;
  const liveContent = nonBlank(liveMarkdown);
  const fallbackSummary = sanitizeMachineText(nonBlank(summary) ?? "正在推进这一步…", "正在推进这一步…");

  return (
    <div className={cn("max-w-[680px] border-y border-line py-3", className)}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">{roleLabel}</span>
        {onOpenOutput ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onOpenOutput(nonBlank(rawOutput))}
          >
            <FileText className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            完整输出
          </Button>
        ) : null}
        {onInterrupt ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={onOpenOutput ? undefined : "ml-auto"}
            onClick={onInterrupt}
            aria-label={interruptLabel ?? `停下${roleLabel}`}
            title={interruptLabel ?? `停下${roleLabel}`}
          >
            <Square className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            停下
          </Button>
        ) : null}
      </div>

      {usableSteps ? (
        <div className="mt-3 space-y-2.5">
          {usableSteps.map((step, index) => (
            <RunStepItem key={step.id ?? `${step.title}-${index}`} step={step} index={index} />
          ))}
        </div>
      ) : (
        <div className="mt-3 max-w-full overflow-x-auto text-sm text-sub" data-testid="run-live-output">
          <MarkdownMessage
            content={liveContent === null
              ? fallbackSummary
              : sanitizeMachineText(liveContent, "正在推进这一步…")}
            density="live"
            mode={liveContent === null ? "static" : "streaming"}
            onOpenExternalLink={onOpenExternalLink}
          />
        </div>
      )}
    </div>
  );
}

function RunStepItem({ step }: { step: RunBlockStep; index: number }): JSX.Element {
  const summary = nonBlank(step.summary);

  return (
    <div className="border-l border-line pl-3 text-sm text-ink">
      <span>{sanitizeMachineText(step.title)}</span>
      {summary ? <span className="mt-0.5 block text-xs leading-5 text-sub">{sanitizeMachineText(summary)}</span> : null}
    </div>
  );
}

function localizeRole(role: string): string {
  return roleLabels[role] ?? "协作者";
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
