import type { DriverPool } from "./driver-pool.js";
import {
  enforceActiveIssueLimit,
  recordActiveIssueUnchanged,
  recordIssueProcessingOutcome,
  type GitHubResponseIntakeState,
  type IssueProcessingOutcome,
  type IssueSummary,
} from "./github-response-intake.js";
import { makeIssueSource, type IssueSource, type RepositoryRef } from "./issue-source.js";
import { log } from "./log.js";
import type { StatePersister } from "./state-persister.js";

export type IssueProcessingJob =
  | {
      kind: "changed";
      summary: IssueSummary;
    }
  | {
      kind: "active";
      source: IssueSource;
      previousUpdatedAt: string;
      previousActiveNoChangeCount: number;
    };

export type IssueProcessingJobResult =
  | {
      kind: "processed";
      summary: IssueSummary;
      outcome: IssueProcessingOutcome;
    }
  | {
      kind: "active-unchanged";
      source: IssueSource;
    };

export interface IssueDispatcherTiming {
  activeIssuePollIntervalMs: number;
  activeIssueNoChangeLimit: number;
}

export interface IssueDispatcherPolicy {
  repositories: readonly RepositoryRef[];
  maxActiveIssues: number;
}

export interface IssueDispatcher {
  dispatch(job: IssueProcessingJob): boolean;
  busyIssueKeys(): ReadonlySet<string>;
  idle(): Promise<void>;
}

export function issueKeyForJob(job: IssueProcessingJob): string {
  return job.kind === "active" ? job.source.issueKey : makeIssueSource(job.summary).issueKey;
}

export function foldIssueProcessingJobResult(input: {
  state: GitHubResponseIntakeState;
  result: IssueProcessingJobResult;
  now: Date;
  timing: IssueDispatcherTiming;
}): GitHubResponseIntakeState {
  if (input.result.kind === "active-unchanged") {
    return recordActiveIssueUnchanged({
      state: input.state,
      source: input.result.source,
      checkedAt: input.now,
      activeIssuePollIntervalMs: input.timing.activeIssuePollIntervalMs,
      activeIssueNoChangeLimit: input.timing.activeIssueNoChangeLimit,
    });
  }

  return recordIssueProcessingOutcome({
    state: input.state,
    summary: input.result.summary,
    outcome: input.result.outcome,
    processedAt: input.now,
    activeIssuePollIntervalMs: input.timing.activeIssuePollIntervalMs,
    activeIssueNoChangeLimit: input.timing.activeIssueNoChangeLimit,
  });
}

export function createIssueDispatcher(options: {
  driverPool: DriverPool;
  persister: StatePersister;
  runJob: (job: IssueProcessingJob) => Promise<IssueProcessingJobResult>;
  timing: IssueDispatcherTiming;
  policy: IssueDispatcherPolicy;
  now?: () => Date;
}): IssueDispatcher {
  const busy = new Set<string>();
  const inFlight = new Set<Promise<void>>();
  const now = options.now ?? (() => new Date());

  const foldResult = (result: IssueProcessingJobResult): void => {
    options.persister.update((state) => {
      const folded = foldIssueProcessingJobResult({
        state,
        result,
        now: now(),
        timing: options.timing,
      });
      const limited = enforceActiveIssueLimit({
        repositories: options.policy.repositories,
        state: folded,
        maxActiveIssues: options.policy.maxActiveIssues,
        excludedIssueKeys: busy,
      });
      for (const issueKey of limited.demotedIssueKeys) {
        log({
          event: "active-issue-demoted",
          reason: "active-limit",
          issueKey,
          maxActiveIssues: options.policy.maxActiveIssues,
        });
      }
      return limited.state;
    });
  };

  return {
    dispatch: (job) => {
      const issueKey = issueKeyForJob(job);
      if (busy.has(issueKey)) {
        log({ event: "skip-inflight", issueKey });
        return false;
      }

      busy.add(issueKey);
      const execution = options.driverPool
        .run(() => options.runJob(job))
        .then(
          (result) => {
            busy.delete(issueKey);
            foldResult(result);
          },
          (error) => {
            busy.delete(issueKey);
            log({ event: "issue-job-error", issueKey, error: formatError(error) });
          },
        )
        .finally(() => {
          inFlight.delete(execution);
        });
      inFlight.add(execution);
      return true;
    },
    busyIssueKeys: () => busy,
    idle: async () => {
      while (inFlight.size > 0) {
        await Promise.all([...inFlight]);
      }
    },
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
