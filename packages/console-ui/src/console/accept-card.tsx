import { ExternalLink, Hand } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";

export type AcceptanceDecision = "pass" | "fail" | "pending";

export interface AcceptanceItem {
  id: string;
  statement: string;
  decision: AcceptanceDecision;
  evidence?: string;
  artifactLabel?: string;
}

export interface AcceptCardProps {
  reviewerLabel: string;
  summary: string;
  selfTestSummary: string;
  selfTestHref?: string;
  items: AcceptanceItem[];
  notePlaceholder?: string;
  className?: string;
}

export function acceptanceConclusion(items: AcceptanceItem[]): "pass" | "fail" | "pending" {
  if (items.length === 0 || items.some((item) => item.decision === "pending")) {
    return "pending";
  }

  return items.every((item) => item.decision === "pass") ? "pass" : "fail";
}

export function formatAcceptanceProtocol(items: AcceptanceItem[], note?: string): string {
  const undecided = items.find((item) => item.decision === "pending");
  if (undecided) {
    throw new Error(`Cannot format acceptance protocol with pending item: ${undecided.id}`);
  }

  const lines = items.map((item, index) => {
    const verdict = item.decision === "pass" ? "通过" : "不通过";
    const basis = note?.trim() || item.evidence?.trim() || "已按验收语句走查";
    return `${index + 1}. ${verdict} — ${basis}`;
  });

  lines.push(`验收结论：${acceptanceConclusion(items) === "pass" ? "通过" : "不通过"}`);
  return lines.join("\n");
}

export function AcceptCard({
  reviewerLabel,
  summary,
  selfTestSummary,
  selfTestHref,
  items,
  notePlaceholder = "写下你判定的依据，方便回溯",
  className
}: AcceptCardProps): JSX.Element {
  return (
    <Card className={cn("max-w-[680px] p-4", className)}>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <Hand className="h-4 w-4 text-sub" strokeWidth={1.5} aria-hidden="true" />
        <span>轮到你了 · 「{reviewerLabel}」请你验收</span>
      </div>

      <div className="space-y-1 text-sm">
        <p>
          <span className="font-semibold text-ink">改了什么</span>
          <span className="text-ink"> · {summary}</span>
        </p>
        <p>
          <span className="font-semibold text-ink">已自测</span>
          <span className="text-ink"> · {selfTestSummary}</span>
          {selfTestHref ? (
            <a className="ml-1 inline-flex items-center gap-1 text-accent" href={selfTestHref}>
              点开看记录 <ExternalLink className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
            </a>
          ) : null}
        </p>
      </div>

      <div className="my-2.5 text-xs font-semibold text-sub">按验收语句逐条走查：</div>

      <div className="space-y-2.5">
        {items.map((item, index) => (
          <AcceptanceRow key={item.id} item={item} index={index} />
        ))}
      </div>

      <label className="mt-4 block text-xs text-sub" htmlFor="acceptance-note">
        依据（选填）
      </label>
      <Input id="acceptance-note" className="mt-1" placeholder={notePlaceholder} />

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        <Button>提交验收结果</Button>
        <Button variant="outline">先不验，回复别的</Button>
      </div>
    </Card>
  );
}

function AcceptanceRow({ item, index }: { item: AcceptanceItem; index: number }): JSX.Element {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="w-3 text-sm font-semibold text-sub">{index + 1}</span>
        <span className="min-w-0 flex-1 text-sm text-ink">{item.statement}</span>
        <DecisionSegment decision={item.decision} />
      </div>
      <div className="ml-6 mt-1 flex flex-wrap items-center gap-1.5 text-xs text-sub">
        {item.artifactLabel ? (
          <>
            <a className="text-accent" href="#">
              打开
            </a>
            <span>产物「{item.artifactLabel}」</span>
            <span>·</span>
          </>
        ) : null}
        {item.evidence ? <span>{item.evidence}</span> : <span className="text-hint">暂无可挂证据 · 请你自己判断走查</span>}
      </div>
    </div>
  );
}

function DecisionSegment({ decision }: { decision: AcceptanceDecision }): JSX.Element {
  return (
    <span className="flex shrink-0 items-center gap-3" aria-label="验收裁决">
      <span
        className={cn(
          "inline-flex h-7 items-center gap-1.5 text-xs",
          decision === "pass" ? "font-medium text-pass" : "text-sub"
        )}
      >
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            decision === "pass" ? "bg-pass" : "border-[1.5px] border-hint"
          )}
          aria-hidden="true"
        />
        通过
      </span>
      <span
        className={cn(
          "inline-flex h-7 items-center gap-1.5 text-xs",
          decision === "fail" ? "font-medium text-danger" : "text-sub"
        )}
      >
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            decision === "fail" ? "bg-danger" : "border-[1.5px] border-hint"
          )}
          aria-hidden="true"
        />
        不通过
      </span>
    </span>
  );
}
