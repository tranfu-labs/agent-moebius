import type { RightSidebarTabsState } from "@/console/right-sidebar-tabs";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type OperatorProcessOutputAvailability = "available" | "empty" | "unavailable";

export interface OperatorProcessOutputAttempt {
  runId: string;
  attempt: number;
  startedAt: string;
  status: "running" | "settled";
  stdout: string | null;
  stderr: string | null;
  fallback: string | null;
  availability: OperatorProcessOutputAvailability;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export interface OperatorProcessOutput {
  sessionId: string;
  requestedRunId: string;
  role: string | null;
  status: "running" | "settled";
  attempts: OperatorProcessOutputAttempt[];
}

export type OperatorProcessOutputState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; output: OperatorProcessOutput };

export interface ProcessTabProps {
  title: string;
  state: OperatorProcessOutputState;
  className?: string;
}

export function ProcessTab({ title, state, className }: ProcessTabProps): JSX.Element {
  return (
    <section
      className={cn("min-h-full select-text px-5 py-5 text-sm text-ink", className)}
      aria-label={`${title}的过程输出`}
      data-testid="process-tab"
    >
      <header className="border-b border-line pb-4">
        <h2 className="truncate text-sm font-semibold text-ink" title={title}>
          {title} · 这一步的完整输出
        </h2>
        <p className="mt-1 text-xs text-sub">
          {state.status === "ready" && state.output.status === "running" ? "正在追加原始输出" : "只读原始记录"}
        </p>
      </header>

      {state.status === "idle" || state.status === "loading" ? (
        <ProcessNotice>正在读取这一步的原始输出…</ProcessNotice>
      ) : state.status === "error" ? (
        <ProcessNotice>原始输出暂时无法读取：{state.message}</ProcessNotice>
      ) : state.output.attempts.length === 0 ? (
        <ProcessNotice>这一步没有产生输出。</ProcessNotice>
      ) : (
        <div className="divide-y divide-line">
          {state.output.attempts.map((attempt) => (
            <ProcessAttempt key={attempt.runId} attempt={attempt} />
          ))}
        </div>
      )}
    </section>
  );
}

export function resolveOperatorMemberName(
  role: string | null,
  unknownLabel = "团队成员",
): string {
  const labels: Record<string, string> = {
    ceo: "CEO",
    dev: "开发",
    "dev-manager": "技术负责人",
    "hermes-user": "用户代表",
    "product-manager": "产品",
    qa: "测试",
    secretary: "秘书",
  };
  return role === null ? unknownLabel : labels[role] ?? unknownLabel;
}

export function nextProcessTabTitle(state: RightSidebarTabsState, role: string | null): string {
  const memberName = resolveOperatorMemberName(role, "成员未知");
  const count = state.tabs.filter((tab) =>
    tab.type === "run-output"
    && (tab.title === memberName || tab.title.startsWith(`${memberName} `))
  ).length;
  return count === 0 ? memberName : `${memberName} ${String(count + 1)}`;
}

function ProcessAttempt({ attempt }: { attempt: OperatorProcessOutputAttempt }): JSX.Element {
  const hasRawOutput = nonEmpty(attempt.stdout) !== null || nonEmpty(attempt.stderr) !== null;
  return (
    <article className="py-5 first:pt-4 last:pb-0" aria-label={`第 ${String(attempt.attempt)} 次执行`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-ink">第 {attempt.attempt} 次执行</h3>
        {attempt.status === "running" ? (
          <span className="text-xs text-sub">正在执行</span>
        ) : null}
      </div>

      {attempt.stdoutTruncated || attempt.stderrTruncated ? (
        <p className="mb-3 rounded-md border border-line bg-card px-3 py-2 text-xs text-sub" role="note">
          此处已截断，只显示留存的末尾内容。
        </p>
      ) : null}

      {hasRawOutput ? (
        <div className="grid gap-4">
          <RawOutput label="标准输出" value={attempt.stdout} />
          <RawOutput label="错误输出" value={attempt.stderr} />
        </div>
      ) : attempt.availability === "unavailable" ? (
        <div className="grid gap-3">
          <p className="text-xs text-sub">原始输出已不可用，以下为会话中保留的记录。</p>
          <RawOutput label="保留记录" value={attempt.fallback} emptyText="没有可显示的保留记录。" />
        </div>
      ) : (
        <p className="text-xs text-sub">这一步没有产生输出。</p>
      )}
    </article>
  );
}

function RawOutput({
  label,
  value,
  emptyText,
}: {
  label: string;
  value: string | null;
  emptyText?: string;
}): JSX.Element | null {
  const text = nonEmpty(value);
  if (text === null && emptyText === undefined) {
    return null;
  }
  return (
    <div className="min-w-0">
      <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-sub">{label}</h4>
      <pre className="scroll-thin max-w-full select-text overflow-x-auto whitespace-pre rounded-md bg-card px-3 py-2 font-mono text-xs leading-5 text-ink">
        {text ?? emptyText}
      </pre>
    </div>
  );
}

function ProcessNotice({ children }: { children: ReactNode }): JSX.Element {
  return <p className="py-8 text-center text-sm text-sub">{children}</p>;
}

function nonEmpty(value: string | null): string | null {
  return value !== null && value.length > 0 ? value : null;
}
