import { AlertTriangle, Ban, CirclePause, Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";

export type RunOutcomeStatus = "failed" | "stuck" | "interrupted" | "dead-letter";

export interface RunOutcomeProps {
  status: RunOutcomeStatus;
  role?: string | null;
  rawReason?: string | null;
  rawOutput?: string | null;
  defaultOpen?: boolean;
  onOpenDiagnostics?: () => void;
  className?: string;
}

const outcomeLabels: Record<RunOutcomeStatus, string> = {
  "dead-letter": "多次尝试仍失败，已停止自动重试",
  failed: "运行失败",
  interrupted: "运行已中断",
  stuck: "运行长时间无响应",
};

const outcomeDescriptions: Record<RunOutcomeStatus, string> = {
  "dead-letter": "自动重试已经停止，可查看日志后决定下一步。",
  failed: "本轮没有完成，可查看日志后重新尝试。",
  interrupted: "本轮已停止，当前会话仍然保留。",
  stuck: "长时间没有新输出，本轮已停止。",
};

const roleLabels: Record<string, string> = {
  ceo: "CEO",
  dev: "开发",
  "dev-manager": "技术负责人",
  "hermes-user": "用户代表",
  "product-manager": "产品",
  qa: "测试",
  secretary: "秘书",
  user: "你",
};

export function RunOutcome({
  status,
  role,
  rawReason: _rawReason,
  rawOutput: _rawOutput,
  defaultOpen: _defaultOpen,
  onOpenDiagnostics,
  className,
}: RunOutcomeProps): JSX.Element {
  const roleLabel = role ? localizeRole(role) : null;

  return (
    <div className={cn("grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3", className)}>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-sunken text-sub" aria-hidden="true">
        <OutcomeIcon status={status} />
      </span>
      <span className="min-w-0">
        <span className={cn("text-sm font-semibold", status === "interrupted" ? "text-ink" : "text-danger")}>
          {outcomeLabels[status]}
        </span>
        {roleLabel ? <span className="ml-2 text-xs text-sub">{roleLabel}</span> : null}
        <span className="mt-1 block text-sm leading-6 text-sub">{outcomeDescriptions[status]}</span>
      </span>
      {onOpenDiagnostics && status !== "interrupted" ? (
        <Button type="button" variant="outline" size="sm" onClick={onOpenDiagnostics}>
          查看日志
        </Button>
      ) : null}
    </div>
  );
}

function OutcomeIcon({ status }: { status: RunOutcomeStatus }): JSX.Element {
  if (status === "failed") {
    return <AlertTriangle className="h-4 w-4 text-danger" />;
  }
  if (status === "stuck") {
    return <Clock3 className="h-4 w-4 text-danger" />;
  }
  if (status === "interrupted") {
    return <CirclePause className="h-4 w-4 text-sub" />;
  }
  return <Ban className="h-4 w-4 text-danger" />;
}

function localizeRole(role: string): string {
  return roleLabels[role] ?? "协作者";
}
