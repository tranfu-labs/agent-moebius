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
  teams,
  disabled,
  onSelectTeam,
}: {
  team?: OperatorAgentTeam;
  pendingTeam?: OperatorAgentTeam;
  teams: readonly OperatorAgentTeam[];
  disabled?: boolean;
  onSelectTeam?: (team: OperatorAgentTeam) => void;
}): JSX.Element | null {
  const displayedTeam = pendingTeam ?? team;
  if (displayedTeam === undefined) {
    return null;
  }
  const teamLabel = displayedTeam.name?.trim() || "未命名团队";
  const needsRepair = team?.status === "needs-repair" && pendingTeam === undefined;
  const accessibleLabel = needsRepair
    ? `Agent 团队：${teamLabel}，需要修复，点击切换`
    : `Agent 团队：${teamLabel}，点击切换`;
  const choices = teams.filter((candidate) => candidate.canCreateConversation);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-hover hover:text-ink",
            needsRepair ? "bg-danger/10 text-danger" : "text-sub",
          )}
          aria-label={accessibleLabel}
          title={accessibleLabel}
          disabled={disabled}
        >
          {needsRepair ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Diamond className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          )}
          <span className="truncate">{teamLabel}</span>
          {needsRepair ? <span className="whitespace-nowrap font-medium">需要修复</span> : null}
          <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-72">
        {choices.map((candidate) => (
          <DropdownMenuCheckboxItem
            key={candidate.teamKey}
            checked={candidate.teamKey === displayedTeam.teamKey}
            onSelect={() => {
              if (candidate.teamKey !== displayedTeam.teamKey) {
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
