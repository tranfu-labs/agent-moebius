import { MessageSquarePlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/ui/card";
import { RoleComposer } from "./role-composer";

export interface ConversationEmptyStateProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  className?: string;
}

export function ConversationEmptyState({
  value,
  onValueChange,
  onSubmit,
  className
}: ConversationEmptyStateProps): JSX.Element {
  return (
    <Card className={cn("mx-auto flex max-w-[560px] flex-col items-stretch gap-4 p-5", className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-sunken text-sub">
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-6 text-ink">开始一个新会话</h2>
          <p className="mt-1 text-sm leading-6 text-sub">描述你的目标，@ 一个角色开始</p>
        </div>
      </div>

      <RoleComposer
        value={value}
        onValueChange={onValueChange}
        onSubmit={onSubmit}
        placeholder="描述你的目标，@ 一个角色开始…"
        statusText="发消息会开启一次会话"
      />
    </Card>
  );
}
