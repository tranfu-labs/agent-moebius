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
      {parentTitle ? <ParentCrumb parentTitle={parentTitle} onOpenParent={onOpenParent} /> : null}
      <h1 className={cn("truncate text-[15px] font-semibold leading-6", parentTitle ? "mt-0.5" : "")}>{taskLabel}</h1>

      <dl className="mt-2 flex min-w-0 flex-wrap items-center gap-7" aria-label="会话属性">
        <Property label="状态" value={<StatusMark status={status} />} text={statusLabel[status]} />
        <Property
          label="通过"
          value={<CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />}
          text={String(progress.passed)}
        />
        <Property label="运行中" value={<RunningDot />} text={String(progress.running)} />
        <Property
          label="等你"
          value={<Hand className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />}
          text={String(progress.waiting)}
        />
      </dl>
    </header>
  );
}

function Property({ label, value, text }: { label: string; value: JSX.Element; text: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-hint">{label}</dt>
      <dd className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
        <span className="flex items-center text-sub">{value}</span>
        <span className="tnum">{text}</span>
      </dd>
    </div>
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
      <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
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

function StatusMark({ status }: { status: SessionContextStatus }): JSX.Element {
  if (status === "running") {
    return <RunningDot />;
  }

  if (status === "waiting") {
    return <Hand className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />;
  }

  if (status === "completed") {
    return <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />;
  }

  return <MessageSquareText className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />;
}

function RunningDot(): JSX.Element {
  return (
    <span className="flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
      <span className="h-1.5 w-1.5 rounded-full bg-accent animate-breathe" />
    </span>
  );
}
