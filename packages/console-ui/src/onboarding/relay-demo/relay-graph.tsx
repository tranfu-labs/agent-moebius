import { cn } from "@/lib/utils";
import type {
  OperatorAgentTeamMember,
  OperatorAgentTeamRelayBeat,
} from "@/console/agent-teams-page";

export const RELAY_STAGE_COLUMNS = "minmax(96px, 0.42fr) minmax(0, 1fr)";

export function RelayRoleColumns({
  activeSpeakerSlug,
  members,
}: {
  activeSpeakerSlug: string | null;
  members: readonly OperatorAgentTeamMember[];
}): JSX.Element {
  return (
    <div
      className="grid min-w-0 gap-1"
      style={{ gridTemplateColumns: `repeat(${String(members.length)}, minmax(0, 1fr))` }}
      aria-label="接力角色位置"
    >
      {members.map((member) => (
        <span
          className={cn(
            "relative min-w-0 border-b-2 px-0.5 pb-1.5 text-center text-[10px] font-semibold",
            member.slug === activeSpeakerSlug
              ? "border-ink text-ink"
              : "border-transparent text-hint",
          )}
          key={member.slug}
          data-active={member.slug === activeSpeakerSlug ? "true" : "false"}
        >
          <span className="block truncate max-sm:hidden">{member.displayName || member.slug}</span>
          <span className="hidden max-sm:block" aria-hidden="true">
            {(member.displayName || member.slug).slice(0, 1)}
          </span>
        </span>
      ))}
    </div>
  );
}

export function RelayGraph({
  activeIndex,
  beats,
  members,
  reducedMotion,
  visibleCount,
}: {
  activeIndex: number;
  beats: readonly OperatorAgentTeamRelayBeat[];
  members: readonly OperatorAgentTeamMember[];
  reducedMotion: boolean;
  visibleCount: number;
}): JSX.Element {
  const memberIndex = new Map(members.map((member, index) => [member.slug, index]));
  return (
    <>
      {beats.map((beat, index) => {
        const speakerIndex = memberIndex.get(beat.speakerSlug);
        if (speakerIndex === undefined) {
          throw new Error(`Relay speaker is not a current team member: ${beat.speakerSlug}`);
        }
        const previousSpeakerIndex = index === 0
          ? null
          : memberIndex.get(beats[index - 1]!.speakerSlug);
        if (index > 0 && previousSpeakerIndex === undefined) {
          throw new Error(`Relay speaker is not a current team member: ${beats[index - 1]!.speakerSlug}`);
        }
        const visible = index < visibleCount;
        const current = index === activeIndex;
        const x = memberPosition(speakerIndex, members.length);
        const previousX = previousSpeakerIndex === null || previousSpeakerIndex === undefined
          ? x
          : memberPosition(previousSpeakerIndex, members.length);

        return (
          <div
            className={cn(
              "relative min-h-[88px] border-b border-line transition-opacity last:border-b-0",
              visible ? "opacity-100" : "opacity-0",
            )}
            style={{ gridColumn: 1, gridRow: index + 1 }}
            data-testid="relay-node-row"
            data-relay-row={index}
            data-grid-row={index + 1}
            data-visible={visible ? "true" : "false"}
            key={`graph-${String(index)}`}
            aria-hidden="true"
          >
            {index > 0 ? (
              <svg
                className="absolute left-0 top-[-50%] h-full w-full overflow-visible"
                viewBox="0 0 100 1"
                preserveAspectRatio="none"
              >
                <path
                  className={cn(
                    "fill-none stroke-line-strong [vector-effect:non-scaling-stroke]",
                    current && "stroke-sub",
                  )}
                  d={`M ${String(previousX)} 0 C ${String(previousX)} 0.45 ${String(x)} 0.55 ${String(x)} 1`}
                  pathLength={1}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  data-testid="relay-connector"
                  data-y1={index - 1}
                  data-y2={index}
                />
              </svg>
            ) : null}
            <span
              className={cn(
                "absolute top-1/2 z-[1] h-3 w-3 rounded-full border-2 border-card",
                current ? "bg-ink" : visible ? "bg-sub" : "bg-hint",
              )}
              style={{ left: `calc(${String(x)}% - 6px)`, marginTop: "-6px" }}
              data-testid="relay-node"
            >
              {current ? (
                <i
                  className={cn(
                    "absolute inset-[-6px] rounded-full border border-sub",
                    !reducedMotion && "animate-breathe",
                  )}
                />
              ) : null}
            </span>
          </div>
        );
      })}
    </>
  );
}

function memberPosition(index: number, memberCount: number): number {
  return ((index + 0.5) / memberCount) * 100;
}
