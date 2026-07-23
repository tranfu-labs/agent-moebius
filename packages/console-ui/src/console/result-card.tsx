import { Files } from "lucide-react";

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
      className={cn("mt-4 flex items-center gap-3 rounded-[14px] border border-line bg-card px-4 py-3", className)}
      aria-label="对话结果"
      data-testid="conversation-result-card"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-sub" aria-hidden="true">
        <Files className="h-4 w-4" strokeWidth={1.5} />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-6 text-ink">{summary}</p>
      <Button type="button" variant="outline" size="sm" onClick={onOpen}>
        查看
      </Button>
    </section>
  );
}
