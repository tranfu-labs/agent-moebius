import { ChevronLeft } from "lucide-react";

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

export function SessionContextHeader({
  parentTitle,
  taskLabel,
  status: _status,
  progress: _progress,
  onOpenParent,
  className
}: SessionContextHeaderProps): JSX.Element {
  return (
    <header className={cn("rounded-lg border border-line bg-card px-3 py-2.5 text-ink", className)}>
      {parentTitle ? <ParentCrumb parentTitle={parentTitle} onOpenParent={onOpenParent} /> : null}
      <h1 className={cn("truncate text-[15px] font-semibold leading-6", parentTitle ? "mt-0.5" : "")}>{taskLabel}</h1>
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
