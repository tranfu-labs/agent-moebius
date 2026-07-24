import { CircleCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";

export interface ResultCardProps {
  fileCount: number;
  onOpen(): void;
  className?: string;
}

export interface ResultCardVisibilityFacts {
  diffAvailable: boolean;
  isRunning: boolean;
  lastMessageMentionsAgent: boolean;
  hasCompletedStep: boolean;
  hasPendingWork: boolean;
}

export function shouldShowResultCard(facts: ResultCardVisibilityFacts): boolean {
  return facts.diffAvailable
    && !facts.isRunning
    && !facts.lastMessageMentionsAgent
    && facts.hasCompletedStep
    && !facts.hasPendingWork;
}

export function ResultCard({ fileCount, onOpen, className }: ResultCardProps): JSX.Element {
  const summary = fileCount === 0
    ? "这段对话期间没有文件发生改动。"
    : `这段对话期间有 ${String(fileCount)} 个文件发生改动。`;

  return (
    <section
      className={cn("mt-4 flex max-w-[420px] items-center gap-2.5 rounded-[10px] border border-line bg-card px-3.5 py-2.5", className)}
      aria-label="对话结果"
      data-testid="conversation-result-card"
    >
      <CircleCheck className="h-[15px] w-[15px] shrink-0 text-pass" strokeWidth={1.5} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[13px] leading-5 text-ink">{summary}</p>
      <Button type="button" variant="outline" size="sm" onClick={onOpen}>
        查看
      </Button>
    </section>
  );
}
