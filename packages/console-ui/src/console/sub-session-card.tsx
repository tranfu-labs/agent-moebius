import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type SubSessionStatus =
  | "running"
  | "waiting"
  | "finished"
  | "not-started"
  | "stuck"
  | "stopped"
  | "retry-exhausted"
  | "unavailable";

export interface SubSessionCardItem {
  sessionId: string;
  title: string;
  memberName: string;
  status: SubSessionStatus;
  statusLabel: string;
}

export function SubSessionCard({
  items,
  openedSessionId,
  onOpen,
  className,
}: {
  items: readonly SubSessionCardItem[];
  openedSessionId?: string | null;
  onOpen?: (sessionId: string) => void;
  className?: string;
}): JSX.Element {
  return (
    <section
      className={cn("overflow-hidden rounded-xl border border-line bg-card", className)}
      aria-label="子任务"
      data-testid="sub-session-card"
    >
      {items.map((item) => {
        const opened = item.sessionId === openedSessionId;
        return (
          <button
            key={item.sessionId}
            type="button"
            className={cn(
              "grid min-h-11 w-full grid-cols-[minmax(0,1fr)_minmax(5rem,auto)_minmax(6rem,auto)] items-center gap-3 border-b border-line px-3 text-left text-sm last:border-b-0 hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent",
              opened && "bg-sel",
            )}
            aria-label={`${item.title}，负责成员：${item.memberName}，状态：${item.statusLabel}`}
            aria-pressed={opened}
            data-session-id={item.sessionId}
            data-status={item.status}
            data-testid="sub-session-card-row"
            onClick={() => onOpen?.(item.sessionId)}
          >
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
              <ChevronRight
                className={cn("h-3.5 w-3.5 shrink-0 text-sub", opened && "rotate-90 text-accent")}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="truncate" title={item.title}>{item.title}</span>
            </span>
            <span className="truncate text-sub" title={item.memberName}>{item.memberName}</span>
            <span className={cn("truncate text-right", statusTextClass(item.status))}>{item.statusLabel}</span>
          </button>
        );
      })}
    </section>
  );
}

function statusTextClass(status: SubSessionStatus): string {
  if (status === "not-started" || status === "stuck" || status === "retry-exhausted" || status === "unavailable") {
    return "text-danger";
  }
  if (status === "running") return "text-warning";
  return "text-sub";
}
