import { Braces } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ConversationEmptyStateProps {
  projectName: string;
  className?: string;
}

export function ConversationEmptyState({ projectName, className }: ConversationEmptyStateProps): JSX.Element {
  return (
    <div className={cn("grid min-h-full place-items-center pb-12 text-center", className)}>
      <div>
        <span className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-line-strong text-hint">
          <Braces className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h1 className="font-display text-[26px] font-medium leading-9 tracking-[-0.025em] text-ink">
          想在 <span className="font-semibold">{projectName}</span> 中完成什么？
        </h1>
      </div>
    </div>
  );
}
