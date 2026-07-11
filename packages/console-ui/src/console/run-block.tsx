import { Check, Circle, Loader2, Square } from "lucide-react";
import { useState, type KeyboardEvent, type MouseEvent } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";

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
  rawOutput,
  steps,
  onInterrupt,
  className,
}: RunBlockProps): JSX.Element {
  const roleLabel = localizeRole(role);
  const elapsed = nonBlank(elapsedTime) ?? "耗时未知";
  const usableSteps = steps?.length ? steps : null;
  const fallbackSummary = nonBlank(summary) ?? "正在运行，等待进展";
  const runRawOutput = nonBlank(rawOutput);

  const handleInterruptKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onInterrupt();
    }
  };

  return (
    <Card className={cn("max-w-[680px] rounded-lg p-3", className)}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">{roleLabel}</span>
        <span className="text-xs text-sub tnum">{elapsed}</span>
        <Button
          type="button"
          variant="danger"
          size="sm"
          className="ml-auto"
          aria-label={`中断${roleLabel}运行`}
          onClick={onInterrupt}
          onKeyDown={handleInterruptKeyDown}
        >
          <Square className="h-3.5 w-3.5" aria-hidden="true" />
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
          {runRawOutput ? <RawDisclosure label="查看原始输出" rawText={runRawOutput} /> : null}
        </div>
      )}
    </Card>
  );
}

function RunStepItem({ step, index }: { step: RunBlockStep; index: number }): JSX.Element {
  const rawText = nonBlank(step.rawOutput);
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
      {rawText ? <RawDisclosure className="ml-6" label={`查看第 ${index + 1} 步原始输出`} rawText={rawText} /> : null}
    </div>
  );
}

function StepStatusIcon({ status }: { status: RunBlockStepStatus }): JSX.Element {
  if (status === "completed") {
    return <Check className="h-4 w-4 text-sub" />;
  }
  if (status === "running") {
    return <Loader2 className="h-4 w-4 animate-spin text-sub" />;
  }
  return <Circle className="h-3.5 w-3.5 text-hint" />;
}

function RawDisclosure({ label, rawText, className }: { label: string; rawText: string; className?: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const toggle = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    setOpen((value) => !value);
  };

  return (
    <details className={cn("mt-2", className)} open={open}>
      <summary
        className="cursor-pointer list-none rounded-sm text-xs text-hint outline-none hover:text-sub focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
        aria-expanded={open}
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            toggle(event);
          }
        }}
      >
        {open ? "收起原始输出" : label}
      </summary>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-sunken p-3 font-mono text-xs leading-5 text-ink">
        {rawText}
      </pre>
    </details>
  );
}

function localizeRole(role: string): string {
  return roleLabels[role] ?? "协作者";
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
