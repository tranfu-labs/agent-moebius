import {
  getDueRepositories,
  resolveRepositoryScan,
  type GitHubResponseIntakeState,
  type IssueSummary,
} from "./github-response-intake.js";
import type { listOpenIssueSummaries } from "./github.js";
import { makeRepoKey, type RepositoryRef } from "./issue-source.js";
import { log } from "./log.js";

export interface IntakeScanConfig {
  idleRepositoryScanIntervalMs: number;
  issueDiscoveryLimit: number;
}

export async function runIntakeScan(input: {
  repositories: readonly RepositoryRef[];
  getState: () => GitHubResponseIntakeState;
  applyState: (
    mutate: (state: GitHubResponseIntakeState) => GitHubResponseIntakeState,
  ) => GitHubResponseIntakeState;
  now: Date;
  listOpenIssueSummaries: typeof listOpenIssueSummaries;
  config: IntakeScanConfig;
}): Promise<IssueSummary[]> {
  const changedIssues: IssueSummary[] = [];
  const dueRepositories = getDueRepositories({
    repositories: input.repositories,
    state: input.getState(),
    now: input.now,
    idleRepositoryScanIntervalMs: input.config.idleRepositoryScanIntervalMs,
  });

  for (const repository of dueRepositories) {
    const repoKey = makeRepoKey(repository);

    let summaries: IssueSummary[];
    try {
      summaries = (await input.listOpenIssueSummaries(repository, input.config.issueDiscoveryLimit)).map(
        (summary) => ({
          owner: repository.owner,
          repo: repository.repo,
          issueNumber: summary.issueNumber,
          updatedAt: summary.updatedAt,
        }),
      );
    } catch (error) {
      log({ event: "repo-scan-failed", repoKey, error: formatError(error) });
      continue;
    }

    let repoChangedIssues: IssueSummary[] = [];
    let baselineIssueCount = 0;
    input.applyState((state) => {
      const scan = resolveRepositoryScan({
        state,
        repository,
        summaries,
        scannedAt: input.now,
      });
      repoChangedIssues = scan.changedIssues;
      baselineIssueCount = scan.baselineIssueCount;
      return scan.state;
    });

    log({
      event: "repo-scanned",
      repoKey,
      baselineIssueCount,
      changedIssueCount: repoChangedIssues.length,
      issueDiscoveryLimit: input.config.issueDiscoveryLimit,
    });
    changedIssues.push(...repoChangedIssues);
  }

  return changedIssues;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
