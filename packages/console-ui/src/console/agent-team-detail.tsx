import { AlertTriangle, Check, ChevronDown, ChevronLeft, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  AgentMarkdownMentionEditor,
  CopyableAgentSlug,
} from "@/console/agent-markdown-mention-editor";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";

export interface AgentTeamDetailMember {
  slug: string;
  displayName: string;
  description: string;
}

export interface AgentTeamDetailTeam {
  teamKey: string;
  ownership: "system" | "user";
  name: string | null;
  description: string | null;
  primaryAgentSlug: string | null;
  memberOrder: string[];
  members: AgentTeamDetailMember[];
}

export interface AgentTeamMemberEditorState {
  memberSlug: string;
  loadStatus: "idle" | "loading" | "ready" | "failed";
  loadError: string | null;
  draftMarkdown: string;
  isDirty: boolean;
  saveStatus: "idle" | "saving" | "failed";
  saveError: string | null;
  displayName: string;
  description: string;
}

export interface AgentTeamSaveAllFailureView {
  memberSlug: string;
  reason: string;
}

export interface AgentTeamDetailState {
  teamKey: string;
  selectedMemberSlug: string | null;
  memberEditors: Record<string, AgentTeamMemberEditorState | undefined>;
  saveAllFailures: AgentTeamSaveAllFailureView[];
  primaryAgentChangeStatus?: "idle" | "saving" | "saved" | "failed";
  primaryAgentChangeError?: string | null;
}

export interface AgentTeamDetailProps {
  team: AgentTeamDetailTeam;
  state: AgentTeamDetailState;
  readOnly?: boolean;
  teamActions?: ReactNode;
  memberSelectorActions?: ReactNode;
  memberActions?: ReactNode;
  onAddMember?(): void | Promise<void>;
  onChangePrimaryAgent?(memberSlug: string): void | Promise<void>;
  onSelectMember(memberSlug: string): void;
  onChangeMember(memberSlug: string, agentMarkdown: string): void;
  onSaveMember(memberSlug: string): void | Promise<void>;
  onRetryLoad(memberSlug: string): void;
  onDiscardMember(memberSlug: string): void;
  onDiscardAll(): void;
  onSaveAll(): Promise<{ failures: AgentTeamSaveAllFailureView[] }>;
  onLeave(): void;
}

export function AgentTeamDetail({
  team,
  state,
  readOnly = false,
  teamActions,
  memberSelectorActions,
  memberActions,
  onAddMember,
  onChangePrimaryAgent,
  onSelectMember,
  onChangeMember,
  onSaveMember,
  onRetryLoad,
  onDiscardMember,
  onDiscardAll,
  onSaveAll,
  onLeave,
}: AgentTeamDetailProps): JSX.Element {
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [addMemberStatus, setAddMemberStatus] = useState<"idle" | "adding" | "failed">("idle");
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const orderedMembers = useMemo(() => orderAgentTeamMembers(team), [team]);
  const selectedMember = orderedMembers.find((member) => member.slug === state.selectedMemberSlug) ?? null;
  const selectedEditor = selectedMember === null ? undefined : state.memberEditors[selectedMember.slug];
  const primaryMember = orderedMembers.find((member) => member.slug === team.primaryAgentSlug);
  const primaryAgentChangeStatus = state.primaryAgentChangeStatus ?? "idle";
  const primaryAgentChangeError = state.primaryAgentChangeError ?? null;
  const mentionMembers = useMemo(() => orderedMembers.map((member) => ({
    slug: member.slug,
    displayName: state.memberEditors[member.slug]?.displayName || member.displayName,
  })), [orderedMembers, state.memberEditors]);
  const hasDirtyMembers = Object.values(state.memberEditors).some((editor) => editor?.isDirty === true);
  const hasSavingMembers = Object.values(state.memberEditors).some((editor) => editor?.saveStatus === "saving");
  const canSaveCurrent = !readOnly
    && selectedEditor?.loadStatus === "ready"
    && selectedEditor.isDirty
    && selectedEditor.saveStatus !== "saving";
  const canAddMember = !readOnly && team.ownership === "user" && onAddMember !== undefined;

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (canSaveCurrent && selectedMember !== null) {
          void onSaveMember(selectedMember.slug);
        }
      }
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [canSaveCurrent, onSaveMember, selectedMember]);

  const requestLeave = () => {
    if (hasDirtyMembers) {
      setLeavePromptOpen(true);
      return;
    }
    onLeave();
  };

  const saveAllAndLeave = async () => {
    if (savingAll) {
      return;
    }
    setSavingAll(true);
    try {
      const result = await onSaveAll();
      setLeavePromptOpen(false);
      if (result.failures.length === 0) {
        onLeave();
      }
    } finally {
      setSavingAll(false);
    }
  };

  const addMember = async () => {
    if (!canAddMember || addMemberStatus === "adding") {
      return;
    }
    setAddMemberStatus("adding");
    setAddMemberError(null);
    try {
      await onAddMember();
      setAddMemberStatus("idle");
    } catch (error) {
      setAddMemberStatus("failed");
      setAddMemberError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="min-h-0" aria-labelledby="agent-team-detail-title" data-testid="agent-team-detail">
      <button
        type="button"
        className="mb-7 inline-flex h-7 items-center gap-1 rounded-md pr-2 text-sm text-sub hover:bg-hover hover:text-ink"
        onClick={requestLeave}
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        Agent 团队
      </button>

      <header className="border-b border-line pb-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 id="agent-team-detail-title" className="truncate text-2xl font-semibold tracking-[-0.02em] text-ink">
                {team.name?.trim() || "未命名团队"}
              </h1>
              <span className="shrink-0 rounded-sm border border-line px-1.5 py-0.5 text-[11px] font-medium text-sub">
                {team.ownership === "system" ? "内置团队" : "用户团队"}
              </span>
              {readOnly ? (
                <span className="shrink-0 rounded-sm bg-sunken px-1.5 py-0.5 text-[11px] font-medium text-hint">
                  只读
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-sub">
              {team.description?.trim() || "这支团队还没有填写用途说明。"}
            </p>
          </div>
          {teamActions}
        </div>

        {readOnly ? (
          <div className="mt-5 border-l-2 border-line-strong bg-sunken px-3 py-2.5 text-sm leading-6 text-sub" role="note">
            这是软件自带的只读团队。你可以查看全部内容；如需调整，请先复制一份独立团队。
          </div>
        ) : null}

        <div className="mt-6 flex min-h-8 flex-wrap items-center gap-3 text-sm">
          <span className="text-hint">主 Agent</span>
          {team.ownership === "user" ? (
            <div className="relative">
              <select
                className="h-8 min-w-40 appearance-none rounded-md border border-line bg-card py-1 pl-2.5 pr-8 text-sm text-ink transition-colors hover:bg-hover disabled:cursor-wait disabled:text-sub"
                aria-label="主 Agent"
                value={primaryMember?.slug ?? ""}
                disabled={
                  onChangePrimaryAgent === undefined
                  || primaryAgentChangeStatus === "saving"
                  || orderedMembers.length === 0
                }
                onChange={(event) => void onChangePrimaryAgent?.(event.currentTarget.value)}
              >
                {primaryMember === undefined ? <option value="" disabled>暂未设置</option> : null}
                {orderedMembers.map((member) => (
                  <option key={member.slug} value={member.slug}>
                    {member.displayName || `@${member.slug}`}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-hint"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </div>
          ) : (
            <span className="rounded-md border border-line bg-card px-2.5 py-1.5 text-ink">
              {primaryMember?.displayName || "暂未设置"}
            </span>
          )}
          <span className="min-h-5 text-xs text-sub" aria-live="polite">
            {primaryAgentChangeStatus === "saving" ? (
              <span className="inline-flex items-center" role="status">
                <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                正在保存…
              </span>
            ) : null}
            {primaryAgentChangeStatus === "saved" ? (
              <span className="inline-flex items-center" role="status">
                <Check className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                已保存
              </span>
            ) : null}
            {primaryAgentChangeStatus === "failed" ? (
              <span className="text-danger" role="alert">切换失败：{primaryAgentChangeError || "请重试"}</span>
            ) : null}
          </span>
        </div>
      </header>

      <div className="border-b border-line py-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-hint">团队成员</h2>
          <div className="flex items-center gap-2">
            {memberSelectorActions}
            {canAddMember && orderedMembers.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={addMemberStatus === "adding"}
                onClick={() => void addMember()}
              >
                {addMemberStatus === "adding" ? (
                  <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                )}
                {addMemberStatus === "adding" ? "正在添加" : "添加 Agent"}
              </Button>
            ) : null}
          </div>
        </div>
        <div
          className="scroll-thin flex min-w-0 flex-nowrap gap-2 overflow-x-auto pb-2"
          role="tablist"
          aria-label="团队成员"
          data-testid="agent-team-member-selector"
        >
          {orderedMembers.map((member) => {
            const selected = member.slug === selectedMember?.slug;
            const dirty = state.memberEditors[member.slug]?.isDirty === true;
            const primary = member.slug === team.primaryAgentSlug;
            return (
              <button
                key={member.slug}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="agent-team-member-editor"
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
                  selected
                    ? "border-line-strong bg-sel text-ink"
                    : "border-line bg-card text-sub hover:bg-hover hover:text-ink",
                )}
                onClick={() => onSelectMember(member.slug)}
              >
                <span>{member.displayName || `@${member.slug}`}</span>
                {primary ? <span className="text-xs text-hint">· 主 Agent</span> : null}
                {dirty ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" title="未保存" aria-label="未保存" />
                ) : null}
              </button>
            );
          })}
        </div>
        {addMemberStatus === "failed" && orderedMembers.length > 0 ? (
          <p className="mt-2 text-sm text-danger" role="alert">添加失败：{addMemberError || "请重试"}</p>
        ) : null}
      </div>

      <div className="pt-7" id="agent-team-member-editor" role="tabpanel">
        {state.saveAllFailures.length > 0 ? (
          <div className="mb-5 border border-danger/30 bg-danger/5 px-4 py-3" role="alert">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={1.5} aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-danger">以下成员未能保存，请检查后重试</p>
                <ul className="mt-1 space-y-1 text-sm text-sub">
                  {state.saveAllFailures.map((failure) => (
                    <li key={failure.memberSlug}>
                      {memberLabel(orderedMembers, failure.memberSlug)}：{failure.reason}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        {selectedMember === null ? (
          <div className="border-y border-line px-6 py-12 text-center">
            <p className="text-sm font-medium text-ink">还没有团队成员</p>
            <p className="mt-2 text-sm text-sub">添加第一个 Agent 来接收任务，成功后它会自动成为主 Agent。</p>
            {canAddMember ? (
              <Button
                type="button"
                className="mt-5"
                disabled={addMemberStatus === "adding"}
                onClick={() => void addMember()}
              >
                {addMemberStatus === "adding" ? (
                  <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                )}
                {addMemberStatus === "adding" ? "正在添加…" : "添加第一个 Agent"}
              </Button>
            ) : null}
            {addMemberStatus === "failed" ? (
              <p className="mt-3 text-sm text-danger" role="alert">添加失败：{addMemberError || "请重试"}</p>
            ) : null}
          </div>
        ) : selectedEditor?.loadStatus === "failed" ? (
          <div className="border-y border-line py-8" role="alert">
            <p className="text-sm font-medium text-danger">暂时无法读取 {selectedMember.displayName || `@${selectedMember.slug}`} 的 AGENT.md</p>
            <p className="mt-1 text-sm text-sub">{selectedEditor.loadError}</p>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => onRetryLoad(selectedMember.slug)}>
              重试
            </Button>
          </div>
        ) : selectedEditor?.loadStatus !== "ready" ? (
          <div className="flex min-h-48 items-center justify-center border-y border-line text-sm text-sub" role="status">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
            正在读取 AGENT.md…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-semibold tracking-[-0.01em] text-ink">
                    {selectedEditor.displayName || selectedMember.displayName || `@${selectedMember.slug}`}
                  </h2>
                  {selectedEditor.isDirty ? <span className="text-xs font-medium text-accent">未保存</span> : null}
                </div>
                <p className="mt-1 text-sm text-sub">
                  {selectedEditor.description || selectedMember.description || `@${selectedMember.slug}`}
                </p>
              </div>
              {memberActions}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <label htmlFor="agent-team-markdown-editor" className="text-xs font-semibold uppercase tracking-[0.08em] text-hint">
                AGENT.md
              </label>
              <div className="flex items-center gap-1 text-xs text-hint">
                {readOnly ? <span>只读 ·</span> : null}
                <CopyableAgentSlug slug={selectedMember.slug} />
              </div>
            </div>
            <AgentMarkdownMentionEditor
              id="agent-team-markdown-editor"
              value={selectedEditor.draftMarkdown}
              members={mentionMembers}
              label={`${selectedEditor.displayName || selectedMember.displayName || selectedMember.slug} AGENT.md`}
              readOnly={readOnly}
              disabled={selectedEditor.saveStatus === "saving"}
              onValueChange={(agentMarkdown) => onChangeMember(selectedMember.slug, agentMarkdown)}
            />

            {selectedEditor.saveStatus === "failed" ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-danger/30 bg-danger/5 px-3 py-2.5" role="alert">
                <span className="text-sm text-danger">保存失败：{selectedEditor.saveError}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void onSaveMember(selectedMember.slug)}>
                  重试
                </Button>
              </div>
            ) : null}

            {!readOnly ? (
              <div className="mt-4 flex items-center justify-end gap-2">
                {selectedEditor.saveStatus === "saving" ? (
                  <span className="mr-auto inline-flex items-center text-sm text-sub" role="status">
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                    正在保存…
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!selectedEditor.isDirty || selectedEditor.saveStatus === "saving"}
                  onClick={() => onDiscardMember(selectedMember.slug)}
                >
                  放弃修改
                </Button>
                <Button
                  type="button"
                  disabled={!canSaveCurrent}
                  onClick={() => void onSaveMember(selectedMember.slug)}
                >
                  {selectedEditor.saveStatus === "saving" ? "正在保存" : "保存"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {leavePromptOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-6" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !savingAll) {
            setLeavePromptOpen(false);
          }
        }}>
          <div className="w-full max-w-md border border-line bg-card p-5 text-ink shadow-overlay" role="dialog" aria-modal="true" aria-label="还有未保存的修改">
            <h2 className="text-base font-semibold">还有未保存的修改</h2>
            <p className="mt-2 text-sm leading-6 text-sub">可以继续编辑、放弃全部修改，或逐个保存后离开。</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={savingAll} onClick={() => setLeavePromptOpen(false)}>
                继续编辑
              </Button>
              <Button type="button" variant="outline" disabled={savingAll || hasSavingMembers} onClick={() => {
                onDiscardAll();
                setLeavePromptOpen(false);
                onLeave();
              }}>
                放弃全部
              </Button>
              <Button type="button" disabled={savingAll || hasSavingMembers} onClick={() => void saveAllAndLeave()}>
                {savingAll ? "正在逐个保存…" : hasSavingMembers ? "正在保存当前成员…" : "保存全部并离开"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function orderAgentTeamMembers(team: AgentTeamDetailTeam): AgentTeamDetailMember[] {
  const membersBySlug = new Map(team.members.map((member) => [member.slug, member]));
  const orderedSlugs = [
    ...(team.primaryAgentSlug === null ? [] : [team.primaryAgentSlug]),
    ...team.memberOrder,
    ...team.members.map((member) => member.slug),
  ];
  const seen = new Set<string>();
  const orderedMembers: AgentTeamDetailMember[] = [];
  for (const slug of orderedSlugs) {
    const member = membersBySlug.get(slug);
    if (member !== undefined && !seen.has(slug)) {
      seen.add(slug);
      orderedMembers.push(member);
    }
  }
  return orderedMembers;
}

function memberLabel(members: readonly AgentTeamDetailMember[], memberSlug: string): string {
  return members.find((member) => member.slug === memberSlug)?.displayName || `@${memberSlug}`;
}
