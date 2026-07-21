import { cva, type VariantProps } from "class-variance-authority";
import { Circle, CircleCheck, CircleDashed, CircleX, Clock } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        idle: "border-[var(--status-neutral-line)] text-hint",
        running:
          "border-[var(--status-run-line)] bg-[var(--status-run-bg)] text-[var(--status-run-fg)]",
        waiting:
          "border-[var(--status-violet-line)] bg-[var(--status-violet-bg)] text-[var(--status-violet-fg)]",
        pending:
          "border-[var(--status-info-line)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
        completed: "border-transparent bg-[var(--status-neutral-bg)] text-sub",
        displayed: "border-transparent bg-[var(--status-neutral-bg)] text-sub",
        failed:
          "border-[var(--status-danger-line)] bg-[var(--status-danger-bg)] text-danger",
        stuck:
          "border-[var(--status-danger-line)] bg-[var(--status-danger-bg)] text-danger",
        interrupted: "border-[var(--status-neutral-line)] text-sub",
        pass: "border-[var(--status-pass-line)] bg-[var(--status-pass-bg)] text-pass"
      }
    },
    defaultVariants: {
      variant: "idle"
    }
  }
);

function HalfPieIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
      <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 6 L6 1.4 A4.6 4.6 0 0 1 6 10.6 Z" fill="currentColor" />
    </svg>
  );
}

const badgeIcons: Record<NonNullable<BadgeProps["variant"]>, () => JSX.Element> = {
  idle: () => <CircleDashed className="h-3 w-3" strokeWidth={2} />,
  running: HalfPieIcon,
  waiting: () => <Circle className="h-3 w-3" strokeWidth={2} />,
  pending: () => <Clock className="h-3 w-3" strokeWidth={2} />,
  completed: () => <Circle className="h-3 w-3 fill-current" strokeWidth={0} />,
  displayed: () => <Circle className="h-3 w-3 fill-current" strokeWidth={0} />,
  failed: () => <CircleX className="h-3 w-3" strokeWidth={2} />,
  stuck: () => <CircleX className="h-3 w-3" strokeWidth={2} />,
  interrupted: () => <CircleDashed className="h-3 w-3" strokeWidth={2} />,
  pass: () => <CircleCheck className="h-3 w-3" strokeWidth={2} />
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant = "idle", children, ...props }: BadgeProps): JSX.Element {
  const Icon = badgeIcons[variant ?? "idle"];
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      <Icon />
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
