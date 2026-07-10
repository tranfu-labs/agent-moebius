import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-6 items-center rounded-sm border px-2 text-xs font-medium leading-none transition-colors whitespace-nowrap",
  {
    variants: {
      variant: {
        idle: "border-line bg-card text-sub",
        running: "border-accent bg-card text-accent",
        waiting: "border-line-strong bg-sel text-ink",
        pending: "border-line-strong bg-sel text-ink",
        completed: "border-line bg-card text-ink",
        displayed: "border-line bg-card text-sub",
        failed: "border-danger bg-card text-danger",
        stuck: "border-danger bg-card text-danger",
        interrupted: "border-line-strong bg-card text-sub"
      }
    },
    defaultVariants: {
      variant: "idle"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
