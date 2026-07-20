import { AlertTriangle, LoaderCircle, Plus } from "lucide-react";
import { useRef, useState } from "react";

import {
  AgentTeamDetail,
  type AgentTeamDetailState,
  type AgentTeamSaveAllFailureView,
} from "@/console/agent-team-detail";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";

export interface OperatorAgentTeamMember {
  slug: string;
  displayName: string;
  description: string;
}

export interface OperatorAgentTeam {
  teamKey: string;
  id: string;
  ownership: "system" | "user";
  name: string | null;
  description: string | null;
  primaryAgentSlug: string | null;
  memberOrder: string[];
  members: OperatorAgentTeamMember[];
  status: "usable" | "unfinished-draft" | "needs-repair";
  canCreateConversation: boolean;
}

export type OperatorAgentTeamsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-error" }
  | { status: "ready"; teams: OperatorAgentTeam[] };

export interface AgentTeamInformationInput {
  name: string;
  description: string;
}

export function AgentTeamsPage({
  state,
  selectedTeamKey,
  selectedMemberSlug,
  detailState,
  useStackedRows,
  onRetry,
  onCreateTeam,
  onOpenTeam,
  onCloseTeam,
  onSelectMember,
  onChangePrimaryAgent,
  onAddMember,
  onUpdateTeamInformation,
  onChangeMember,
  onSaveMember,
  onRetryMember,
  onDiscardMember,
  onDiscardAll,
  onSaveAll,
  onDuplicateBuiltInTeam,
  onBack,
}: {
  state: OperatorAgentTeamsState;
  selectedTeamKey?: string | null;
  selectedMemberSlug?: string | null;
  detailState?: AgentTeamDetailState | null;
  useStackedRows: boolean;
  onRetry?: () => void;
  onCreateTeam?: (information: AgentTeamInformationInput) => Promise<OperatorAgentTeam>;
  onOpenTeam?: (teamKey: string) => void;
  onCloseTeam?: () => void;
  onSelectMember?: (teamKey: string, memberSlug: string) => void;
  onChangePrimaryAgent?: (teamKey: string, memberSlug: string) => void | Promise<void>;
  onAddMember?: (teamKey: string) => void | Promise<void>;
  onUpdateTeamInformation?: (teamKey: string, information: AgentTeamInformationInput) => void | Promise<void>;
  onChangeMember?: (teamKey: string, memberSlug: string, agentMarkdown: string) => void;
  onSaveMember?: (teamKey: string, memberSlug: string) => void | Promise<void>;
  onRetryMember?: (teamKey: string, memberSlug: string) => void;
  onDiscardMember?: (teamKey: string, memberSlug: string) => void;
  onDiscardAll?: (teamKey: string) => void;
  onSaveAll?: (teamKey: string) => Promise<{ failures: AgentTeamSaveAllFailureView[] }>;
  onDuplicateBuiltInTeam?: (teamKey: string) => Promise<string>;
  onBack: () => void;
}): JSX.Element {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const listScrollTopRef = useRef(0);
  const [openedTeamKey, setOpenedTeamKey] = useState<string | null>(null);
  const [duplicatingTeamKey, setDuplicatingTeamKey] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingTeamInformation, setEditingTeamInformation] = useState<OperatorAgentTeam | null>(null);
  const openedTeam = state.status === "ready"
    ? state.teams.find((team) => team.teamKey === openedTeamKey)
    : undefined;
  const openedDetailState = detailState !== undefined
    && detailState !== null
    && detailState.teamKey === openedTeam?.teamKey
    ? detailState
    : null;

  const openTeam = (teamKey: string) => {
    listScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? 0;
    setDuplicateError(null);
    onOpenTeam?.(teamKey);
    setOpenedTeamKey(teamKey);
    if (scrollContainerRef.current !== null) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  const returnToList = () => {
    onCloseTeam?.();
    setDuplicateError(null);
    setOpenedTeamKey(null);
    if (scrollContainerRef.current !== null) {
      scrollContainerRef.current.scrollTop = listScrollTopRef.current;
    }
  };

  const duplicateBuiltInTeam = async (team: OperatorAgentTeam) => {
    if (duplicatingTeamKey !== null || onDuplicateBuiltInTeam === undefined) {
      return;
    }
    setDuplicatingTeamKey(team.teamKey);
    setDuplicateError(null);
    try {
      const copiedTeamKey = await onDuplicateBuiltInTeam(team.teamKey);
      setOpenedTeamKey(copiedTeamKey);
    } catch (error) {
      setDuplicateError(error instanceof Error ? error.message : "暂时无法复制团队，请稍后重试。");
    } finally {
      setDuplicatingTeamKey(null);
    }
  };

  return (
    <section
      ref={scrollContainerRef}
      className="scroll-thin min-h-0 flex-1 overflow-auto px-4 pb-12 pt-16 sm:px-8"
      aria-labelledby={openedTeam === undefined ? "agent-teams-title" : undefined}
    >
      <div className="mx-auto max-w-[960px]">
        {openedTeam !== undefined ? (
          <div
            className="min-h-40"
            role="region"
            aria-label={`${teamName(openedTeam)}详情`}
            data-testid="agent-team-detail-view"
            data-team-key={openedTeam.teamKey}
          >
            {openedDetailState === null ? (
              <div className="flex min-h-40 items-center justify-center text-sm text-sub" role="status">
                正在读取团队详情…
              </div>
            ) : (
              <AgentTeamDetail
                team={openedTeam}
                state={openedDetailState}
                teamActions={openedTeam.ownership === "system" ? (
                  <div className="flex max-w-xs flex-col items-end gap-2">
                    <Button
                      type="button"
                      disabled={duplicatingTeamKey !== null || onDuplicateBuiltInTeam === undefined}
                      onClick={() => void duplicateBuiltInTeam(openedTeam)}
                    >
                      {duplicatingTeamKey === openedTeam.teamKey ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                      ) : null}
                      {duplicatingTeamKey === openedTeam.teamKey ? "正在复制…" : "复制并编辑"}
                    </Button>
                    {duplicateError !== null ? (
                      <p className="text-right text-sm leading-5 text-danger" role="alert">{duplicateError}</p>
                    ) : null}
                  </div>
                ) : onUpdateTeamInformation !== undefined ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingTeamInformation(openedTeam)}>
                    修改信息
                  </Button>
                ) : undefined}
                onChangePrimaryAgent={onChangePrimaryAgent === undefined
                  ? undefined
                  : (memberSlug) => onChangePrimaryAgent(openedTeam.teamKey, memberSlug)}
                readOnly={openedTeam.ownership === "system"}
                onAddMember={openedTeam.ownership === "user" && onAddMember !== undefined
                  ? () => onAddMember(openedTeam.teamKey)
                  : undefined}
                onSelectMember={(memberSlug) => onSelectMember?.(openedTeam.teamKey, memberSlug)}
                onChangeMember={(memberSlug, agentMarkdown) => onChangeMember?.(openedTeam.teamKey, memberSlug, agentMarkdown)}
                onSaveMember={(memberSlug) => onSaveMember?.(openedTeam.teamKey, memberSlug)}
                onRetryLoad={(memberSlug) => onRetryMember?.(openedTeam.teamKey, memberSlug)}
                onDiscardMember={(memberSlug) => onDiscardMember?.(openedTeam.teamKey, memberSlug)}
                onDiscardAll={() => onDiscardAll?.(openedTeam.teamKey)}
                onSaveAll={() => onSaveAll?.(openedTeam.teamKey) ?? Promise.resolve({ failures: [] })}
                onLeave={returnToList}
              />
            )}
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-medium text-hint">应用管理</p>
                <h1 id="agent-teams-title" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
                  Agent 团队
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-sub">查看和管理负责不同任务的 Agent 团队</p>
              </div>
              {state.status === "ready" && onCreateTeam !== undefined ? (
                <Button type="button" className="mt-6 shrink-0" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  新建团队
                </Button>
              ) : null}
            </div>

            {state.status === "loading" ? <AgentTeamsLoading /> : null}
            {state.status === "error" ? (
              <AgentTeamsFailure
                title="暂时无法加载 Agent 团队"
                description="团队数据没有被清空，稍后重试即可。"
                onRetry={onRetry}
              />
            ) : null}
            {state.status === "configuration-error" ? (
              <AgentTeamsFailure
                title="应用配置异常"
                description="软件自带的 Agent 团队无法读取。请重试；如果问题持续，请打开诊断信息寻求帮助。"
                onRetry={onRetry}
              />
            ) : null}
            {state.status === "ready" ? (
              <div
                className="mt-8 min-h-40"
                aria-label="团队数据已载入"
                data-testid="agent-teams-data-container"
                data-team-count={state.teams.length}
                data-selected-team-key={selectedTeamKey ?? undefined}
                data-selected-member-slug={selectedMemberSlug ?? undefined}
              >
                <div className="divide-y divide-line border-y border-line" data-testid="agent-team-list">
                  {state.teams.map((team) => (
                    <AgentTeamRow
                      key={team.teamKey}
                      team={team}
                      useStackedLayout={useStackedRows}
                      onOpen={() => openTeam(team.teamKey)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <Button type="button" variant="outline" className="mt-6" onClick={onBack}>
              返回当前对话
            </Button>
          </>
        )}
      </div>

      {createDialogOpen && onCreateTeam !== undefined ? (
        <TeamInformationDialog
          title="新建团队"
          description="先填写团队的基本信息。创建后可以在团队详情中逐步添加 Agent。"
          confirmLabel="创建团队"
          initialValue={{ name: "", description: "" }}
          onCancel={() => setCreateDialogOpen(false)}
          onConfirm={async (information) => {
            const team = await onCreateTeam(information);
            setCreateDialogOpen(false);
            listScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? 0;
            setOpenedTeamKey(team.teamKey);
            if (scrollContainerRef.current !== null) {
              scrollContainerRef.current.scrollTop = 0;
            }
          }}
        />
      ) : null}

      {editingTeamInformation !== null && onUpdateTeamInformation !== undefined ? (
        <TeamInformationDialog
          title="修改团队信息"
          description="这里只修改团队名称和一句话描述，不会改变成员或主 Agent。"
          confirmLabel="保存"
          initialValue={{
            name: editingTeamInformation.name ?? "",
            description: editingTeamInformation.description ?? "",
          }}
          onCancel={() => setEditingTeamInformation(null)}
          onConfirm={async (information) => {
            await onUpdateTeamInformation(editingTeamInformation.teamKey, information);
            setEditingTeamInformation(null);
          }}
        />
      ) : null}
    </section>
  );
}

function TeamInformationDialog({
  title,
  description,
  confirmLabel,
  initialValue,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  initialValue: AgentTeamInformationInput;
  onCancel: () => void;
  onConfirm: (information: AgentTeamInformationInput) => Promise<void>;
}): JSX.Element {
  const [name, setName] = useState(initialValue.name);
  const [teamDescription, setTeamDescription] = useState(initialValue.description);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = name.trim().length > 0 && teamDescription.trim().length > 0 && !pending;

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onConfirm({ name: name.trim(), description: teamDescription.trim() });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
      setPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onCancel();
        }
      }}
    >
      <form
        className="w-full max-w-md rounded-xl border border-line bg-card p-5 text-ink shadow-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-sub">{description}</p>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            团队名称
            <Input
              autoFocus
              value={name}
              disabled={pending}
              maxLength={80}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            一句话描述
            <Input
              value={teamDescription}
              disabled={pending}
              maxLength={160}
              onChange={(event) => setTeamDescription(event.currentTarget.value)}
            />
          </label>
        </div>
        {error !== null ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
            取消
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {pending ? "正在保存…" : confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}

function AgentTeamRow({
  team,
  useStackedLayout,
  onOpen,
}: {
  team: OperatorAgentTeam;
  useStackedLayout: boolean;
  onOpen: () => void;
}): JSX.Element {
  const orderedMembers = orderTeamMembers(team);
  const visibleMemberLimit = 3;
  const visibleMembers = orderedMembers.slice(0, visibleMemberLimit);
  const hiddenMemberCount = Math.max(0, orderedMembers.length - visibleMembers.length);
  const primaryAgent = orderedMembers.find((member) => member.slug === team.primaryAgentSlug);

  return (
    <button
      type="button"
      className={cn(
        "group grid w-full text-left transition-colors hover:bg-hover focus-visible:bg-hover",
        useStackedLayout
          ? "grid-cols-1"
          : "grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]",
      )}
      data-testid="agent-team-row"
      data-team-key={team.teamKey}
      data-layout={useStackedLayout ? "narrow" : "wide"}
      onClick={onOpen}
    >
      <span className="min-w-0 px-5 py-5">
        <span className="flex min-w-0 items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{teamName(team)}</span>
          <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {team.ownership === "system" ? <TeamStatusBadge kind="built-in" /> : null}
            {team.status === "unfinished-draft" ? <TeamStatusBadge kind="unfinished" /> : null}
            {team.status === "needs-repair" ? <TeamStatusBadge kind="needs-repair" /> : null}
          </span>
        </span>
        <span className="mt-2 block line-clamp-2 text-sm leading-5 text-sub">{teamDescription(team)}</span>
        <span className="mt-3 block text-xs text-hint">{teamMemberSummary(team, primaryAgent?.displayName)}</span>
      </span>

      <span
        className={cn(
          "flex min-w-0 items-center gap-2 px-5 py-5",
          useStackedLayout ? "border-t border-line pt-4" : "border-l border-line",
        )}
        data-testid="agent-team-members"
      >
        {visibleMembers.map((member) => {
          const isPrimary = member.slug === team.primaryAgentSlug;
          return (
            <span
              key={member.slug}
              className="inline-flex h-8 w-28 shrink-0 items-center rounded-md border border-line bg-canvas px-2.5 text-xs font-normal text-ink"
              title={member.displayName}
            >
              <span className="truncate">{member.displayName}</span>
              {isPrimary ? <span className="ml-1 whitespace-nowrap text-hint">· 主 Agent</span> : null}
            </span>
          );
        })}
        {hiddenMemberCount > 0 ? (
          <span
            className="inline-flex h-8 shrink-0 items-center rounded-md border border-line bg-canvas px-2.5 text-xs font-normal text-sub"
            aria-label={`还有 ${hiddenMemberCount} 名成员`}
          >
            ＋{hiddenMemberCount}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function TeamStatusBadge({ kind }: { kind: "built-in" | "unfinished" | "needs-repair" }): JSX.Element {
  const label = kind === "built-in" ? "内置" : kind === "unfinished" ? "未完成" : "需要修复";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-medium",
        kind === "needs-repair"
          ? "border-danger/35 bg-danger/10 text-danger"
          : kind === "unfinished"
            ? "border-line-strong bg-sunken text-sub"
            : "border-line bg-canvas text-sub",
      )}
    >
      {label}
    </span>
  );
}

function orderTeamMembers(team: OperatorAgentTeam): OperatorAgentTeamMember[] {
  const membersBySlug = new Map(team.members.map((member) => [member.slug, member]));
  const orderedSlugs = [
    ...(team.primaryAgentSlug === null ? [] : [team.primaryAgentSlug]),
    ...team.memberOrder,
    ...team.members.map((member) => member.slug),
  ];
  const seen = new Set<string>();
  const orderedMembers: OperatorAgentTeamMember[] = [];
  for (const slug of orderedSlugs) {
    const member = membersBySlug.get(slug);
    if (member !== undefined && !seen.has(slug)) {
      seen.add(slug);
      orderedMembers.push(member);
    }
  }
  return orderedMembers;
}

function teamName(team: OperatorAgentTeam): string {
  return team.name?.trim() || "未命名团队";
}

function teamDescription(team: OperatorAgentTeam): string {
  if (team.description?.trim()) {
    return team.description;
  }
  if (team.status === "unfinished-draft") {
    return "还没有可接收任务的 Agent。";
  }
  if (team.status === "needs-repair") {
    return "团队文件暂时无法完整读取。";
  }
  return "这支团队还没有填写用途说明。";
}

function teamMemberSummary(team: OperatorAgentTeam, primaryAgentName?: string): string {
  const countLabel = `${team.members.length} 名成员`;
  if (primaryAgentName !== undefined) {
    return `${countLabel} · 主 Agent：${primaryAgentName}`;
  }
  if (team.status === "unfinished-draft") {
    return `${countLabel} · 尚未设置主 Agent`;
  }
  return `${countLabel} · 主 Agent 暂不可用`;
}

function AgentTeamsLoading(): JSX.Element {
  return (
    <div className="mt-8 space-y-4" role="status" aria-label="Agent 团队正在加载">
      {[0, 1].map((index) => (
        <div
          key={index}
          className="grid min-h-28 animate-pulse grid-cols-[minmax(0,1fr)_minmax(180px,0.65fr)] overflow-hidden rounded-xl border border-line"
          data-testid="agent-team-loading-row"
        >
          <div className="space-y-3 border-r border-line p-5">
            <div className="h-4 w-32 rounded bg-hover" />
            <div className="h-3 w-48 max-w-full rounded bg-hover" />
            <div className="h-3 w-24 rounded bg-hover" />
          </div>
          <div className="flex items-center gap-2 p-5">
            <div className="h-9 w-16 rounded-md bg-hover" />
            <div className="h-9 w-16 rounded-md bg-hover" />
            <div className="h-9 w-16 rounded-md bg-hover" />
          </div>
        </div>
      ))}
      <span className="sr-only">正在读取团队信息…</span>
    </div>
  );
}

function AgentTeamsFailure({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}): JSX.Element {
  return (
    <div className="mt-8 rounded-xl border border-line bg-rail p-5" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" strokeWidth={1.5} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{title}</p>
          <p className="mt-1 text-sm leading-6 text-sub">{description}</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            重试
          </Button>
        </div>
      </div>
    </div>
  );
}
