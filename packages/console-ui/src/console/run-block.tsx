import { Check, Circle, Loader2, Square } from "lucide-react";
import type { KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";

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
  onInterrupt(): void;
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

const stepStatusLabels: Record<RunBlockStepStatus, string> = {
  completed: "已完成",
  pending: "未开始",
  running: "进行中",
};

export function RunBlock({
  role,
  elapsedTime,
  summary,
  rawOutput: _rawOutput,
  steps,
  onInterrupt,
  className,
}: RunBlockProps): JSX.Element {
  const roleLabel = localizeRole(role);
  const elapsed = nonBlank(elapsedTime) ?? "耗时未知";
  const usableSteps = steps?.length ? steps : null;
  const fallbackSummary = nonBlank(summary) ?? "正在运行，等待进展";

  const handleInterruptKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onInterrupt();
    }
  };

  return (
    <div className={cn("max-w-[680px] border-y border-line py-3", className)}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">{roleLabel}</span>
        <span className="text-xs text-sub tnum">{elapsed}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          aria-label={`中断${roleLabel}运行`}
          onClick={onInterrupt}
          onKeyDown={handleInterruptKeyDown}
        >
          <Square className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          中断
        </Button>
      </div>

      {usableSteps ? (
        <div className="mt-3 space-y-2.5">
          {usableSteps.map((step, index) => (
            <RunStepItem key={step.id ?? `${step.title}-${index}`} step={step} index={index} />
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-sub">
          <div>{fallbackSummary}</div>
        </div>
      )}
    </div>
  );
}

function RunStepItem({ step, index }: { step: RunBlockStep; index: number }): JSX.Element {
  const summary = nonBlank(step.summary);

  return (
    <div>
      <div className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2 text-sm">
        <span className="mt-0.5 flex h-4 w-4 items-center justify-center" aria-hidden="true">
          <StepStatusIcon status={step.status} />
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={cn(step.status === "running" ? "font-semibold text-ink" : "text-sub")}>
              {index + 1}. {step.title}
            </span>
            <span className="text-xs text-hint">{stepStatusLabels[step.status]}</span>
          </span>
          {summary ? <span className="mt-0.5 block text-xs leading-5 text-sub">{summary}</span> : null}
        </span>
      </div>
    </div>
  );
}

function StepStatusIcon({ status }: { status: RunBlockStepStatus }): JSX.Element {
  if (status === "completed") {
    return <Check className="h-4 w-4 text-sub" strokeWidth={1.5} />;
  }
  if (status === "running") {
    return <Loader2 className="h-4 w-4 animate-spin text-sub" strokeWidth={1.5} />;
  }
  return <Circle className="h-3.5 w-3.5 text-hint" strokeWidth={1.5} />;
}

function localizeRole(role: string): string {
  return roleLabels[role] ?? "协作者";
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
