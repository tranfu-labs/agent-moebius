import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-6 items-center gap-1.5 text-xs font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        idle: "text-hint",
        running: "text-accent",
        waiting: "text-sub",
        pending: "text-sub",
        completed: "text-sub",
        displayed: "text-sub",
        failed: "text-danger",
        stuck: "text-danger",
        interrupted: "text-sub"
      }
    },
    defaultVariants: {
      variant: "idle"
    }
  }
);

const badgeDotVariants: Record<NonNullable<BadgeProps["variant"]>, string> = {
  idle: "border-[1.5px] border-hint",
  running: "bg-accent",
  waiting: "border-[1.5px] border-hint",
  pending: "border-[1.5px] border-hint",
  completed: "bg-hint",
  displayed: "bg-hint",
  failed: "bg-danger",
  stuck: "bg-danger",
  interrupted: "border-[1.5px] border-hint"
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant = "idle", children, ...props }: BadgeProps): JSX.Element {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", badgeDotVariants[variant ?? "idle"])} aria-hidden="true" />
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
