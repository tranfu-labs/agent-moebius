import { cn } from "@/lib/utils";
import type {
  OperatorAgentTeamMember,
  OperatorAgentTeamRelayBeat,
} from "@/console/agent-teams-page";

export function RelayMessages({
  activeIndex,
  beats,
  members,
  visibleCount,
}: {
  activeIndex: number;
  beats: readonly OperatorAgentTeamRelayBeat[];
  members: readonly OperatorAgentTeamMember[];
  visibleCount: number;
}): JSX.Element {
  const membersBySlug = new Map(members.map((member) => [member.slug, member]));
  return (
    <>
      {beats.map((beat, index) => {
        const member = membersBySlug.get(beat.speakerSlug);
        if (member === undefined) {
          throw new Error(`Relay speaker is not a current team member: ${beat.speakerSlug}`);
        }
        const visible = index < visibleCount;
        const current = index === activeIndex;
        return (
          <article
            className={cn(
              "min-w-0 border-b border-line px-3 py-3 transition-[opacity,background-color] last:border-b-0",
              visible ? "opacity-100" : "opacity-0",
              current && "rounded-lg bg-sunken",
            )}
            style={{ gridColumn: 2, gridRow: index + 1 }}
            data-testid="relay-message-row"
            data-relay-row={index}
            data-grid-row={index + 1}
            data-visible={visible ? "true" : "false"}
            aria-hidden={!visible}
            key={`message-${String(index)}`}
          >
            <header className="flex min-w-0 items-center gap-2">
              <strong className="truncate text-xs font-semibold text-ink">
                {member.displayName || `@${member.slug}`}
              </strong>
              <span className="shrink-0 text-[10px] tabular-nums text-hint">
                第 {index + 1} 棒
              </span>
              {current ? (
                <span className="ml-auto shrink-0 rounded-full border border-[var(--status-run-line)] bg-[var(--status-run-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--status-run-fg)]">
                  {index === beats.length - 1 ? "收尾" : "处理中"}
                </span>
              ) : null}
            </header>
            <p className={cn("mt-1.5 text-xs leading-5", current ? "text-ink" : "text-sub")}>
              {beat.message}
            </p>
          </article>
        );
      })}
    </>
  );
}
