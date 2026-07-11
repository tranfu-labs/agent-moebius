import { CheckCircle2, ChevronLeft, Hand, MessageSquareText } from "lucide-react";

import { cn } from "@/lib/utils";

export type SessionContextStatus = "waiting" | "running" | "idle" | "completed";

export interface SessionContextProgress {
  passed: number;
  running: number;
  waiting: number;
}

export interface SessionContextHeaderProps {
  parentTitle?: string;
  taskLabel: string;
  status: SessionContextStatus;
  progress: SessionContextProgress;
  onOpenParent?: () => void;
  className?: string;
}

const statusLabel: Record<SessionContextStatus, string> = {
  waiting: "等你",
  running: "执行中",
  idle: "静止",
  completed: "已完成"
};

export function SessionContextHeader({
  parentTitle,
  taskLabel,
  status,
  progress,
  onOpenParent,
  className
}: SessionContextHeaderProps): JSX.Element {
  return (
    <header className={cn("rounded-lg border border-line bg-card px-3 py-2.5 text-ink", className)}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {parentTitle ? <ParentCrumb parentTitle={parentTitle} onOpenParent={onOpenParent} /> : null}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate text-sm font-semibold leading-5">{taskLabel}</h1>
            <span className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-line bg-card px-2 text-xs font-medium text-sub">
              <StatusMark status={status} />
              {statusLabel[status]}
            </span>
          </div>
        </div>

        <dl className="flex shrink-0 items-center gap-2 text-xs text-sub" aria-label="进展摘要">
          <ProgressItem icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />} label="通过" value={progress.passed} />
          <ProgressItem icon={<RunningDot />} label="运行中" value={progress.running} />
          <ProgressItem icon={<Hand className="h-3.5 w-3.5" aria-hidden="true" />} label="等你" value={progress.waiting} />
        </dl>
      </div>
    </header>
  );
}

function ParentCrumb({
  parentTitle,
  onOpenParent
}: {
  parentTitle: string;
  onOpenParent?: () => void;
}): JSX.Element {
  const content = (
    <>
      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="truncate">属于：{parentTitle}</span>
    </>
  );

  if (onOpenParent) {
    return (
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-1 rounded-md text-xs text-sub hover:text-ink"
        onClick={onOpenParent}
      >
        {content}
      </button>
    );
  }

  return <div className="inline-flex max-w-full items-center gap-1 text-xs text-sub">{content}</div>;
}

function ProgressItem({ icon, label, value }: { icon: JSX.Element; label: string; value: number }): JSX.Element {
  return (
    <div className="inline-flex items-center gap-1 rounded-sm border border-line bg-card px-2 py-1">
      {icon}
      <dt className="sr-only">{label}</dt>
      <dd className="tnum">
        {value} {label}
      </dd>
    </div>
  );
}

function StatusMark({ status }: { status: SessionContextStatus }): JSX.Element {
  if (status === "running") {
    return <RunningDot />;
  }

  if (status === "waiting") {
    return <Hand className="h-3.5 w-3.5" aria-hidden="true" />;
  }

  if (status === "completed") {
    return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  }

  return <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />;
}

function RunningDot(): JSX.Element {
  return (
    <span className="flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
      <span className="h-1.5 w-1.5 rounded-full bg-sub animate-breathe" />
    </span>
  );
}
