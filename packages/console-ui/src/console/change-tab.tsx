import { RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  FileDiffView,
  WorkspaceFileTree,
  workspaceLocationCopy,
  type WorkspaceFileChange,
  type WorkspaceFileContent,
} from "@/console/file-diff-view";

export type WorkspaceDiffData =
  | {
      available: true;
      fileCount: number;
      files: WorkspaceFileChange[];
      reason: null;
      workspaceMode: "direct" | "worktree";
    }
  | {
      available: false;
      fileCount: null;
      files: [];
      reason:
        | "missing-baseline"
        | "not-git-repository"
        | "workspace-unavailable"
        | "baseline-unavailable"
        | "no-session";
      workspaceMode: "direct" | "worktree";
    };

export interface ChangeTabProps {
  sessionId: string;
  workspaceMode: "direct" | "worktree";
  conversationStarted: boolean;
  isWorking: boolean;
  loadDiff(sessionId: string): Promise<WorkspaceDiffData>;
  loadFile(sessionId: string, filePath: string): Promise<WorkspaceFileContent>;
}

interface PendingRefresh {
  diff: WorkspaceDiffData;
  content: WorkspaceFileContent | null;
}

export function ChangeTab({
  sessionId,
  workspaceMode,
  conversationStarted,
  isWorking,
  loadDiff,
  loadFile,
}: ChangeTabProps): JSX.Element {
  const [diff, setDiff] = useState<WorkspaceDiffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<WorkspaceFileContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentScrollTop, setContentScrollTop] = useState(0);
  const [pendingRefresh, setPendingRefresh] = useState<PendingRefresh | null>(null);
  const requestGenerationRef = useRef(0);
  const previousWorkingRef = useRef(isWorking);
  const location = workspaceLocationCopy(workspaceMode);

  const applyDiff = useCallback((nextDiff: WorkspaceDiffData, nextContent: WorkspaceFileContent | null = null) => {
    setDiff(nextDiff);
    setPendingRefresh(null);
    setSelectedPath((current) => {
      if (!nextDiff.available || nextDiff.files.length === 0) {
        return null;
      }
      return current !== null && nextDiff.files.some((file) => file.path === current)
        ? current
        : nextDiff.files[0]?.path ?? null;
    });
    if (nextContent !== null) {
      setContent(nextContent);
    }
  }, []);

  const refresh = useCallback(async (initial: boolean) => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    if (initial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const nextDiff = await loadDiff(sessionId);
      const nextContent = !initial && selectedPath !== null
        ? await loadFile(sessionId, selectedPath)
        : null;
      if (requestGenerationRef.current !== generation) {
        return;
      }
      if (!initial && diff !== null && hasRefreshChange(diff, nextDiff, content, nextContent)) {
        setPendingRefresh({ diff: nextDiff, content: nextContent });
      } else {
        applyDiff(nextDiff, nextContent);
      }
    } catch {
      if (requestGenerationRef.current === generation) {
        applyDiff({
          available: false,
          fileCount: null,
          files: [],
          reason: "workspace-unavailable",
          workspaceMode,
        });
      }
    } finally {
      if (requestGenerationRef.current === generation) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [applyDiff, content, diff, loadDiff, loadFile, selectedPath, sessionId, workspaceMode]);

  useEffect(() => {
    setDiff(null);
    setSelectedPath(null);
    setContent(null);
    setPendingRefresh(null);
    setContentScrollTop(0);
    void refresh(true);
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [sessionId]);

  useEffect(() => {
    if (previousWorkingRef.current && !isWorking && diff !== null) {
      void refresh(false);
    }
    previousWorkingRef.current = isWorking;
  }, [diff, isWorking, refresh]);

  useEffect(() => {
    if (selectedPath === null) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    void loadFile(sessionId, selectedPath).then((nextContent) => {
      if (!cancelled) {
        setContent(nextContent);
      }
    }).catch(() => {
      if (!cancelled) {
        setContent(null);
      }
    }).finally(() => {
      if (!cancelled) {
        setContentLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadFile, selectedPath, sessionId]);

  if (!conversationStarted) {
    return <ChangeStateMessage>这段对话还没有开始，团队尚未工作。</ChangeStateMessage>;
  }
  if (loading && diff === null) {
    return <ChangeStateMessage>正在读取这段对话期间的项目改动…</ChangeStateMessage>;
  }
  if (diff === null || !diff.available) {
    return (
      <ChangeStateMessage>
        <p>{diffUnavailableCopy(diff?.reason ?? "workspace-unavailable")}</p>
        <button
          type="button"
          className="mt-3 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-hover"
          onClick={() => void refresh(true)}
        >
          重试
        </button>
      </ChangeStateMessage>
    );
  }
  if (diff.files.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ChangeHeader
          isWorking={isWorking}
          locationLabel={location.label}
          consequence={location.consequence}
          refreshing={refreshing}
          onRefresh={() => void refresh(false)}
        />
        <ChangeStateMessage>这段对话期间，项目文件没有发生变化。</ChangeStateMessage>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="change-tab">
      <ChangeHeader
        isWorking={isWorking}
        locationLabel={location.label}
        consequence={location.consequence}
        refreshing={refreshing}
        onRefresh={() => void refresh(false)}
      />
      {pendingRefresh !== null ? (
        <button
          type="button"
          className="shrink-0 border-b border-line bg-sel px-3 py-2 text-left text-xs font-medium text-accent hover:bg-hover"
          onClick={() => applyDiff(pendingRefresh.diff, pendingRefresh.content)}
        >
          有新改动，点击后查看
        </button>
      ) : null}
      <WorkspaceFileTree
        files={diff.files}
        selectedPath={selectedPath}
        onSelect={(filePath) => {
          setSelectedPath(filePath);
          setContentScrollTop(0);
        }}
        className="min-h-28 max-h-[42%] shrink-0 border-b border-line py-1"
      />
      <FileDiffView
        path={selectedPath}
        content={content}
        loading={contentLoading}
        scrollTop={contentScrollTop}
        onScrollTopChange={setContentScrollTop}
      />
    </div>
  );
}

function ChangeHeader({
  isWorking,
  locationLabel,
  consequence,
  refreshing,
  onRefresh,
}: {
  isWorking: boolean;
  locationLabel: string;
  consequence: string | null;
  refreshing: boolean;
  onRefresh(): void;
}): JSX.Element {
  return (
    <div className="shrink-0 border-b border-line px-3 py-3 text-xs leading-5 text-sub">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">
            这段对话期间，项目发生了这些改动（{locationLabel}）。
          </p>
          {consequence !== null ? <p className="mt-1">{consequence}</p> : null}
          {isWorking ? <p className="mt-1">团队正在工作，这份列表截至上一轮结束。</p> : null}
        </div>
        {isWorking ? (
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 font-medium text-ink hover:bg-hover disabled:opacity-50"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            {refreshing ? "刷新中" : "刷新"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function hasRefreshChange(
  currentDiff: WorkspaceDiffData,
  nextDiff: WorkspaceDiffData,
  currentContent: WorkspaceFileContent | null,
  nextContent: WorkspaceFileContent | null,
): boolean {
  return JSON.stringify(currentDiff) !== JSON.stringify(nextDiff)
    || JSON.stringify(currentContent) !== JSON.stringify(nextContent);
}

function diffUnavailableCopy(reason: NonNullable<Extract<WorkspaceDiffData, { available: false }>["reason"]>): string {
  const copy: Record<typeof reason, string> = {
    "missing-baseline": "这段对话没有可用的开始基线，当前无法读取累计改动。",
    "not-git-repository": "这个项目文件夹不是 git 仓库，无法可靠读取改动。",
    "workspace-unavailable": "当前工作空间不可用，暂时无法读取改动。",
    "baseline-unavailable": "这段对话开始时的项目状态已不可用，当前无法读取累计改动。",
    "no-session": "当前没有可读取改动的对话。",
  };
  return copy[reason];
}

function ChangeStateMessage({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="grid h-full min-h-0 place-items-center p-6 text-center text-sm leading-6 text-sub">
      <div>{children}</div>
    </div>
  );
}
