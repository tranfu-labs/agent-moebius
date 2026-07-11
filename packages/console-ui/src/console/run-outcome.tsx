import { AlertTriangle, Ban, CirclePause, Clock3 } from "lucide-react";
import { useState, type KeyboardEvent, type MouseEvent } from "react";

import { cn } from "@/lib/utils";
import { Card } from "@/ui/card";

export type RunOutcomeStatus = "failed" | "stuck" | "interrupted" | "dead-letter";

export interface RunOutcomeProps {
  status: RunOutcomeStatus;
  role?: string | null;
  rawReason?: string | null;
  rawOutput?: string | null;
  defaultOpen?: boolean;
  className?: string;
}

const outcomeLabels: Record<RunOutcomeStatus, string> = {
  "dead-letter": "多次尝试仍失败，已停止自动重试",
  failed: "运行失败",
  interrupted: "运行已中断",
  stuck: "运行长时间无响应",
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
  rawReason,
  rawOutput,
  defaultOpen = false,
  className,
}: RunOutcomeProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const reason = nonBlank(rawReason);
  const output = nonBlank(rawOutput);
  const hasDetails = Boolean(reason || output);
  const roleLabel = role ? localizeRole(role) : null;
  const toggle = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    setOpen((value) => !value);
  };

  return (
    <Card className={cn("max-w-[680px] rounded-lg p-3", className)}>
      <details open={open}>
        <summary
          className={cn(
            "grid list-none grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden",
            hasDetails ? "cursor-pointer hover:bg-hover" : "cursor-default",
          )}
          aria-expanded={open}
          tabIndex={hasDetails ? 0 : -1}
          onClick={(event) => {
            if (hasDetails) {
              toggle(event);
            }
          }}
          onKeyDown={(event) => {
            if (hasDetails && (event.key === "Enter" || event.key === " ")) {
              toggle(event);
            }
          }}
        >
          <span className="mt-0.5 flex h-4 w-4 items-center justify-center text-sub" aria-hidden="true">
            <OutcomeIcon status={status} />
          </span>
          <span className="min-w-0">
            <span className="text-sm font-semibold text-ink">{outcomeLabels[status]}</span>
            {roleLabel ? <span className="ml-2 text-xs text-sub">{roleLabel}</span> : null}
          </span>
          {hasDetails ? (
            <span className="whitespace-nowrap text-xs text-hint">{open ? "收起详情" : "查看详情"}</span>
          ) : null}
        </summary>

        {hasDetails ? (
          <div className="ml-6 mt-2 space-y-2">
            {reason ? <MachineText label="机器原因" text={reason} /> : null}
            {output ? <MachineText label="原始输出" text={output} /> : null}
          </div>
        ) : null}
      </details>
    </Card>
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

function MachineText({ label, text }: { label: string; text: string }): JSX.Element {
  return (
    <div>
      <div className="mb-1 text-xs text-hint">{label}</div>
      <pre
        className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-sunken p-3 font-mono text-xs leading-5 text-ink"
        aria-label={label}
      >
        {text}
      </pre>
    </div>
  );
}

function localizeRole(role: string): string {
  return roleLabels[role] ?? "协作者";
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
