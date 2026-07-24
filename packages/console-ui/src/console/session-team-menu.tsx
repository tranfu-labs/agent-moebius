import { AlertTriangle, ChevronDown, Diamond } from "lucide-react";

import type { OperatorAgentTeam } from "@/console/agent-teams-page";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

export function SessionTeamMenu({
  team,
  pendingTeam,
  missingTeamId,
  health,
  teams,
  disabled,
  onSelectTeam,
}: {
  team?: OperatorAgentTeam;
  pendingTeam?: OperatorAgentTeam;
  missingTeamId?: string | null;
  health?: "usable" | "deleted" | "needs-repair" | null;
  teams: readonly OperatorAgentTeam[];
  disabled?: boolean;
  onSelectTeam?: (team: OperatorAgentTeam) => void;
}): JSX.Element | null {
  const displayedTeam = pendingTeam ?? team;
  if (displayedTeam === undefined && missingTeamId == null) {
    return null;
  }
  const teamLabel = displayedTeam?.name?.trim() || missingTeamId || "未命名团队";
  const needsAttention = pendingTeam === undefined && (health === "deleted" || health === "needs-repair" || team?.status === "needs-repair");
  const stateLabel = health === "deleted" ? "已删除" : "需要修复";
  const accessibleLabel = needsAttention
    ? `Agent 团队：${teamLabel}，${stateLabel}，点击切换`
    : `Agent 团队：${teamLabel}，点击切换`;
  const choices = teams.filter((candidate) => candidate.canCreateConversation);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            needsAttention
              ? "border-danger text-danger"
              : "border-line text-ink hover:bg-hover",
          )}
          aria-label={accessibleLabel}
          title={accessibleLabel}
          disabled={disabled}
        >
          {needsAttention ? (
            <AlertTriangle className="h-[13px] w-[13px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Diamond className="h-[13px] w-[13px] shrink-0 text-sub" strokeWidth={1.5} aria-hidden="true" />
          )}
          <span className="truncate">{teamLabel}</span>
          {needsAttention ? <span className="whitespace-nowrap font-medium">{stateLabel}</span> : null}
          <ChevronDown className="h-[11px] w-[11px] shrink-0 text-hint" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-72">
        {choices.map((candidate) => (
          <DropdownMenuCheckboxItem
            key={candidate.teamKey}
            checked={candidate.teamKey === displayedTeam?.teamKey}
            onSelect={() => {
              if (candidate.teamKey !== displayedTeam?.teamKey) {
                onSelectTeam?.(candidate);
              }
            }}
          >
            {candidate.name?.trim() || "未命名团队"}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs leading-5 text-sub">
          这段对话用的是开始时载入的那份团队内容，之后在 Agent 团队页的修改不影响它。
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
