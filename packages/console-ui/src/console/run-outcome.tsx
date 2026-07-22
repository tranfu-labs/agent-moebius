import { AlertTriangle, Ban, CirclePause, Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";

export type RunOutcomeStatus = "run-not-started" | "run-stuck" | "user-stopped" | "retry-exhausted";

export interface RunOutcomeProps {
  status: RunOutcomeStatus;
  role?: string | null;
  rawReason?: string | null;
  rawOutput?: string | null;
  defaultOpen?: boolean;
  onOpenDiagnostics?: () => void;
  onRetry?: () => void;
  className?: string;
}

const outcomeLabels: Record<RunOutcomeStatus, string> = {
  "retry-exhausted": "这一步反复没跑起来，已经不再重试",
  "run-not-started": "这一步没跑起来",
  "user-stopped": "你让这一步停下了",
  "run-stuck": "这一步卡住了",
};

const outcomeDescriptions: Record<RunOutcomeStatus, string> = {
  "retry-exhausted": "你可以说点什么，或换一个成员接手。",
  "run-not-started": "你可以重试，或直接说话、换一个成员接手。",
  "user-stopped": "已经产生的文件改动会保留；你可以继续说话，开启新的一轮。",
  "run-stuck": "你可以重试，或直接说话、换一个成员接手。",
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
  onOpenDiagnostics: _onOpenDiagnostics,
  onRetry,
  className,
}: RunOutcomeProps): JSX.Element {
  const roleLabel = role ? localizeRole(role) : null;

  return (
    <div className={cn("grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3", className)}>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-sunken text-sub" aria-hidden="true">
        <OutcomeIcon status={status} />
      </span>
      <span className="min-w-0">
        <span className={cn("text-sm font-semibold", status === "user-stopped" ? "text-ink" : "text-danger")}>
          {outcomeLabels[status]}
        </span>
        {roleLabel ? <span className="ml-2 text-xs text-sub">{roleLabel}</span> : null}
        <span className="mt-1 block text-sm leading-6 text-sub">{outcomeDescriptions[status]}</span>
      </span>
      {status === "run-not-started" || status === "run-stuck" ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  );
}

function OutcomeIcon({ status }: { status: RunOutcomeStatus }): JSX.Element {
  if (status === "run-not-started") {
    return <AlertTriangle className="h-4 w-4 text-danger" strokeWidth={1.5} />;
  }
  if (status === "run-stuck") {
    return <Clock3 className="h-4 w-4 text-danger" strokeWidth={1.5} />;
  }
  if (status === "user-stopped") {
    return <CirclePause className="h-4 w-4 text-sub" strokeWidth={1.5} />;
  }
  return <Ban className="h-4 w-4 text-danger" strokeWidth={1.5} />;
}

function localizeRole(role: string): string {
  return roleLabels[role] ?? "协作者";
}
