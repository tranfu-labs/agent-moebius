import { cva, type VariantProps } from "class-variance-authority";
import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        failed:
          "border-[var(--status-danger-line)] bg-[var(--status-danger-bg)] text-danger",
        stuck:
          "border-[var(--status-danger-line)] bg-[var(--status-danger-bg)] text-danger",
        interrupted: "border-[var(--status-neutral-line)] text-sub",
        pass: "border-[var(--status-pass-line)] bg-[var(--status-pass-bg)] text-pass"
      }
    },
    defaultVariants: {
      variant: "interrupted"
    }
  }
);

const badgeIcons: Record<NonNullable<BadgeProps["variant"]>, () => JSX.Element> = {
  failed: () => <CircleX className="h-3 w-3" strokeWidth={2} />,
  stuck: () => <CircleX className="h-3 w-3" strokeWidth={2} />,
  interrupted: () => <CircleDashed className="h-3 w-3" strokeWidth={2} />,
  pass: () => <CircleCheck className="h-3 w-3" strokeWidth={2} />
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant = "interrupted", children, ...props }: BadgeProps): JSX.Element {
  const Icon = badgeIcons[variant ?? "interrupted"];
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      <Icon />
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
