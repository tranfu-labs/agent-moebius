import { makeIssueSource, makeRepoKey, type IssueSource, type RepositoryRef } from "./issue-source.js";

export type IntakeIssueMode = "idle" | "active";

export interface IssueSummary extends RepositoryRef {
  issueNumber: number;
  updatedAt: string;
}

export interface IntakeRepositoryState {
  lastIdleScanAt: string;
}

export interface IntakeIssueState extends RepositoryRef {
  issueNumber: number;
  updatedAt: string;
  mode: IntakeIssueMode;
  activeNoChangeCount: number;
  nextPollAt: string | null;
}

export interface GitHubResponseIntakeState {
  repositories: Record<string, IntakeRepositoryState>;
  issues: Record<string, IntakeIssueState>;
}

export type IssueProcessingOutcome = "triggered-success" | "no-trigger" | "failed" | "issue-not-found";

export interface IntakeTimingOptions {
  idleRepositoryScanIntervalMs: number;
  activeIssuePollIntervalMs: number;
  activeIssueNoChangeLimit: number;
}

export interface RepositoryScanResult {
  state: GitHubResponseIntakeState;
  changedIssues: IssueSummary[];
  baselineIssueCount: number;
}

export interface ActiveIssueLimitResult {
  state: GitHubResponseIntakeState;
  demotedIssueKeys: string[];
}

export const EMPTY_GITHUB_RESPONSE_INTAKE_STATE: GitHubResponseIntakeState = {
  repositories: {},
  issues: {},
};

export function getDueRepositories(input: {
  repositories: readonly RepositoryRef[];
  state: GitHubResponseIntakeState;
  now: Date;
  idleRepositoryScanIntervalMs: number;
}): RepositoryRef[] {
  return input.repositories.filter((repository) => {
    const state = input.state.repositories[makeRepoKey(repository)];
    if (state === undefined) {
      return true;
    }

    return input.now.getTime() - Date.parse(state.lastIdleScanAt) >= input.idleRepositoryScanIntervalMs;
  });
}

export function getDueActiveIssueSources(input: {
  state: GitHubResponseIntakeState;
  now: Date;
}): IssueSource[] {
  return Object.entries(input.state.issues)
    .filter(([, issue]) => issue.mode === "active" && isDue(issue.nextPollAt, input.now))
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([, issue]) => makeIssueSource(issue));
}

export function resolveRepositoryScan(input: {
  state: GitHubResponseIntakeState;
  repository: RepositoryRef;
  summaries: IssueSummary[];
  scannedAt: Date;
}): RepositoryScanResult {
  const repoKey = makeRepoKey(input.repository);
  const isFirstScan = input.state.repositories[repoKey] === undefined;
  let nextState = {
    ...input.state,
    repositories: {
      ...input.state.repositories,
      [repoKey]: {
        lastIdleScanAt: input.scannedAt.toISOString(),
      },
    },
    issues: {
      ...input.state.issues,
    },
  };

  if (isFirstScan) {
    for (const summary of input.summaries) {
      const issueKey = makeIssueSource(summary).issueKey;
      nextState.issues[issueKey] = {
        owner: summary.owner,
        repo: summary.repo,
        issueNumber: summary.issueNumber,
        updatedAt: summary.updatedAt,
        mode: "idle",
        activeNoChangeCount: 0,
        nextPollAt: null,
      };
    }

    return {
      state: nextState,
      changedIssues: [],
      baselineIssueCount: input.summaries.length,
    };
  }

  return {
    state: nextState,
    changedIssues: input.summaries.filter((summary) => {
      const issueState = nextState.issues[makeIssueSource(summary).issueKey];
      return issueState === undefined || issueState.updatedAt !== summary.updatedAt;
    }),
    baselineIssueCount: 0,
  };
}

export function recordIssueProcessingOutcome(input: {
  state: GitHubResponseIntakeState;
  summary: IssueSummary;
  outcome: IssueProcessingOutcome;
  processedAt: Date;
  activeIssuePollIntervalMs: number;
}): GitHubResponseIntakeState {
  const source = makeIssueSource(input.summary);
  if (input.outcome === "failed") {
    return input.state;
  }

  if (input.outcome === "issue-not-found") {
    const { [source.issueKey]: _removed, ...issues } = input.state.issues;
    return {
      ...input.state,
      issues,
    };
  }

  const previousMode = input.state.issues[source.issueKey]?.mode ?? "idle";
  const isActive = input.outcome === "triggered-success" || previousMode === "active";
  return {
    ...input.state,
    issues: {
      ...input.state.issues,
      [source.issueKey]: {
        owner: input.summary.owner,
        repo: input.summary.repo,
        issueNumber: input.summary.issueNumber,
        updatedAt: input.summary.updatedAt,
        mode: isActive ? "active" : "idle",
        activeNoChangeCount: 0,
        nextPollAt: isActive ? addMilliseconds(input.processedAt, input.activeIssuePollIntervalMs).toISOString() : null,
      },
    },
  };
}

export function recordActiveIssueUnchanged(input: {
  state: GitHubResponseIntakeState;
  source: IssueSource;
  checkedAt: Date;
  activeIssuePollIntervalMs: number;
  activeIssueNoChangeLimit: number;
}): GitHubResponseIntakeState {
  const issueState = input.state.issues[input.source.issueKey];
  if (issueState === undefined || issueState.mode !== "active") {
    return input.state;
  }

  const activeNoChangeCount = issueState.activeNoChangeCount + 1;
  const shouldDemote = activeNoChangeCount >= input.activeIssueNoChangeLimit;

  return {
    ...input.state,
    issues: {
      ...input.state.issues,
      [input.source.issueKey]: {
        ...issueState,
        mode: shouldDemote ? "idle" : "active",
        activeNoChangeCount,
        nextPollAt: shouldDemote
          ? null
          : addMilliseconds(input.checkedAt, input.activeIssuePollIntervalMs).toISOString(),
      },
    },
  };
}

export function enforceActiveIssueLimit(input: {
  state: GitHubResponseIntakeState;
  maxActiveIssues: number;
}): ActiveIssueLimitResult {
  const activeIssues = Object.entries(input.state.issues)
    .filter(([, issue]) => issue.mode === "active")
    .sort(([leftKey, left], [rightKey, right]) => {
      const timeDiff = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      return timeDiff === 0 ? leftKey.localeCompare(rightKey) : timeDiff;
    });

  if (activeIssues.length <= input.maxActiveIssues) {
    return {
      state: input.state,
      demotedIssueKeys: [],
    };
  }

  const keepIssueKeys = new Set(activeIssues.slice(0, input.maxActiveIssues).map(([issueKey]) => issueKey));
  const demotedIssueKeys: string[] = [];
  const issues = { ...input.state.issues };

  for (const [issueKey, issue] of activeIssues) {
    if (keepIssueKeys.has(issueKey)) {
      continue;
    }

    demotedIssueKeys.push(issueKey);
    issues[issueKey] = {
      ...issue,
      mode: "idle",
      nextPollAt: null,
    };
  }

  return {
    state: {
      ...input.state,
      issues,
    },
    demotedIssueKeys,
  };
}

function isDue(nextPollAt: string | null, now: Date): boolean {
  return nextPollAt === null || Date.parse(nextPollAt) <= now.getTime();
}

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}
