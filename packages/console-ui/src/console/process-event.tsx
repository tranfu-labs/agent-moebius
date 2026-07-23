import {
  AlertTriangle,
  FilePenLine,
  Terminal,
  Wrench,
} from "lucide-react";

import { MarkdownMessage } from "@/console/markdown-message";
import { cn } from "@/lib/utils";

export interface OperatorProcessPublicAttachment {
  kind: "image" | "file";
  displayName: string;
  mediaType: string;
  byteSize: number;
}

export type OperatorProcessTimelineEvent =
  | {
      key: string;
      kind: "attempt-header";
      runId: string;
      attempt: number;
      startedAt: string;
      status: "running" | "settled";
    }
  | {
      key: string;
      kind: "execution-header";
      runId: string;
      attempt: number;
    }
  | {
      key: string;
      kind: "public-message";
      messageId: number;
      speaker: "user" | "agent";
      role: string | null;
      markdown: string;
      attachments: OperatorProcessPublicAttachment[];
      timestamp: string;
    }
  | {
      key: string;
      kind: "agent-markdown";
      timestamp: string | null;
      markdown: string;
    }
  | {
      key: string;
      kind: "command";
      timestamp: string | null;
      phase: "started" | "completed";
      command: string;
      output: string | null;
      exitCode: number | null;
    }
  | {
      key: string;
      kind: "tool";
      timestamp: string | null;
      phase: "started" | "completed";
      name: string;
      input: string | null;
      output: string | null;
      status: string | null;
    }
  | {
      key: string;
      kind: "file";
      timestamp: string | null;
      action: string;
      path: string | null;
      detail: string | null;
    }
  | {
      key: string;
      kind: "error";
      timestamp: string | null;
      message: string;
      detail: string | null;
    }
  | {
      key: string;
      kind: "unsupported";
      timestamp: string | null;
      eventType: string;
    };

export interface ProcessEventProps {
  event: OperatorProcessTimelineEvent;
  memberName: string;
  onOpenExternalLink?: (url: string) => void;
}

export function ProcessEvent({
  event,
  memberName,
  onOpenExternalLink,
}: ProcessEventProps): JSX.Element {
  switch (event.kind) {
    case "attempt-header":
      return (
        <div className="border-t border-line pb-2 pt-5 first:border-t-0 first:pt-2">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-ink">
            <span>第 {event.attempt} 次执行 · 本轮输入</span>
            {event.status === "running" ? <span className="font-normal text-sub">正在执行</span> : null}
          </div>
        </div>
      );
    case "execution-header":
      return (
        <div className="border-t border-line pb-2 pt-4 text-xs font-semibold text-ink">
          本轮执行过程
        </div>
      );
    case "public-message":
      return (
        <article className="py-2" aria-label={event.speaker === "user" ? "你" : roleLabel(event.role)}>
          <p className="mb-1 text-xs font-medium text-sub">
            {event.speaker === "user" ? "你" : roleLabel(event.role)}
          </p>
          <MarkdownMessage
            content={event.markdown}
            mode="static"
            onOpenExternalLink={onOpenExternalLink}
          />
          {event.attachments.length > 0 ? (
            <ul className="mt-2 grid gap-1 text-xs text-sub">
              {event.attachments.map((attachment, index) => (
                <li key={`${attachment.displayName}:${String(index)}`}>
                  {attachment.kind === "image" ? "图片" : "文件"} · {attachment.displayName}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      );
    case "agent-markdown":
      return (
        <article className="py-2" aria-label={memberName}>
          <p className="mb-1 text-xs font-medium text-sub">{memberName}</p>
          <MarkdownMessage
            content={event.markdown}
            mode="static"
            onOpenExternalLink={onOpenExternalLink}
          />
        </article>
      );
    case "command":
      return (
        <ProcessAction
          icon={<Terminal className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
          label={event.phase === "started" ? "运行命令" : "命令结果"}
          detail={event.command}
          output={event.output}
          tone={event.exitCode !== null && event.exitCode !== 0 ? "danger" : "neutral"}
        />
      );
    case "tool":
      return (
        <ProcessAction
          icon={<Wrench className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
          label={event.phase === "started" ? "工具调用" : "工具结果"}
          detail={event.name}
          input={event.input}
          output={event.output}
          tone={event.status === "failed" ? "danger" : "neutral"}
        />
      );
    case "file":
      return (
        <ProcessAction
          icon={<FilePenLine className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
          label={event.action}
          detail={event.path}
          output={event.detail}
          tone="neutral"
        />
      );
    case "error":
      return (
        <ProcessAction
          icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
          label={event.message}
          detail={null}
          output={event.detail}
          tone="danger"
        />
      );
    case "unsupported":
      return (
        <div className="my-2 rounded-lg border border-line bg-card px-3 py-2 text-xs text-sub" role="note">
          暂不支持的过程事件 · <span className="font-mono">{event.eventType}</span>
        </div>
      );
  }
}

function ProcessAction({
  icon,
  label,
  detail,
  input,
  output,
  tone,
}: {
  icon: JSX.Element;
  label: string;
  detail: string | null;
  input?: string | null;
  output: string | null;
  tone: "neutral" | "danger";
}): JSX.Element {
  return (
    <article
      className={cn(
        "my-2 overflow-hidden rounded-lg border bg-card",
        tone === "danger" ? "border-danger/30" : "border-line",
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs font-medium text-sub">
        {icon}
        <span>{label}</span>
      </header>
      {detail !== null ? (
        <pre className="scroll-thin overflow-x-auto whitespace-pre px-3 py-2 font-mono text-xs leading-5 text-ink">
          {stripTerminalControls(detail)}
        </pre>
      ) : null}
      {input !== undefined && input !== null ? (
        <ReadonlyBlock label="输入" value={input} />
      ) : null}
      {output !== null ? <ReadonlyBlock label="输出" value={output} /> : null}
    </article>
  );
}

function ReadonlyBlock({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="border-t border-line px-3 py-2">
      <p className="mb-1 text-[11px] font-medium text-sub">{label}</p>
      <pre className="scroll-thin max-h-80 overflow-auto whitespace-pre font-mono text-xs leading-5 text-ink">
        {stripTerminalControls(value)}
      </pre>
    </div>
  );
}

function roleLabel(role: string | null): string {
  const labels: Record<string, string> = {
    ceo: "CEO",
    dev: "开发",
    "dev-manager": "技术负责人",
    "hermes-user": "用户代表",
    "product-manager": "产品",
    qa: "测试",
    secretary: "秘书",
  };
  return role === null ? "团队成员" : labels[role] ?? role;
}

function stripTerminalControls(value: string): string {
  return value
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "");
}
