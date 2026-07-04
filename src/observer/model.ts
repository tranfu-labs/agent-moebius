import { makeRepoKey, type RepositoryRef } from "../issue-source.js";
import type {
  ObserverAgentContextState,
  ObserverDiagnostic,
  ObserverIntakeIssueState,
  ObserverRoleThreadState,
  ObserverRunManifestRecord,
  ObserverRunManifestStage,
  ObserverStateSnapshot,
} from "./read-state.js";

export interface ObserverModel {
  generatedAt: string;
  configUsable: boolean;
  diagnostics: ObserverDiagnostic[];
  repositories: ObserverRepositoryView[];
}

export interface ObserverRepositoryView {
  owner: string;
  repo: string;
  key: string;
  issues: ObserverIssueView[];
  hasRecords: boolean;
}

export interface ObserverIssueView {
  owner: string;
  repo: string;
  number: number;
  key: string;
  sources: string[];
  latestRunStage: ObserverRunManifestStage | null;
  intake: ObserverIntakeIssueState | null;
  roleThreads: Array<{ role: string; state: ObserverRoleThreadState }>;
  agentContexts: Array<{ role: string; state: ObserverAgentContextState }>;
  runs: ObserverRunManifestRecord[];
}

interface IssueAccumulator {
  owner: string;
  repo: string;
  number: number;
  key: string;
  sources: Set<string>;
  intake: ObserverIntakeIssueState | null;
  roleThreads: Map<string, ObserverRoleThreadState>;
  agentContexts: Map<string, ObserverAgentContextState>;
  runs: ObserverRunManifestRecord[];
}

export function buildObserverModel(snapshot: ObserverStateSnapshot, now = new Date()): ObserverModel {
  const repositoryMaps = new Map<string, Map<string, IssueAccumulator>>();
  for (const repository of snapshot.watchRepositories) {
    repositoryMaps.set(makeRepoKey(repository), new Map());
  }

  const addIssue = (repository: RepositoryRef & { number: number }, source: string): IssueAccumulator | null => {
    const repoKey = makeRepoKey(repository);
    const repoIssues = repositoryMaps.get(repoKey);
    if (repoIssues === undefined) {
      return null;
    }

    const issueKey = `${repoKey}#${repository.number}`;
    const existing = repoIssues.get(issueKey);
    if (existing !== undefined) {
      existing.sources.add(source);
      return existing;
    }

    const issue: IssueAccumulator = {
      owner: repository.owner,
      repo: repository.repo,
      number: repository.number,
      key: issueKey,
      sources: new Set([source]),
      intake: null,
      roleThreads: new Map(),
      agentContexts: new Map(),
      runs: [],
    };
    repoIssues.set(issueKey, issue);
    return issue;
  };

  for (const issue of Object.values(snapshot.intakeState.issues)) {
    const view = addIssue({ owner: issue.owner, repo: issue.repo, number: issue.issueNumber }, "intake");
    if (view !== null) {
      view.intake = issue;
    }
  }

  for (const [issueKey, roles] of Object.entries(snapshot.roleThreads)) {
    const parsed = parseIssueKey(issueKey);
    if (parsed === null) {
      continue;
    }

    const view = addIssue(parsed, "role threads");
    if (view !== null) {
      for (const [role, state] of Object.entries(roles)) {
        view.roleThreads.set(role, state);
      }
    }
  }

  for (const [issueKey, roles] of Object.entries(snapshot.agentContexts)) {
    const parsed = parseIssueKey(issueKey);
    if (parsed === null) {
      continue;
    }

    const view = addIssue(parsed, "agent contexts");
    if (view !== null) {
      for (const [role, state] of Object.entries(roles)) {
        view.agentContexts.set(role, state);
      }
    }
  }

  for (const run of snapshot.runManifests) {
    const view = addIssue({ owner: run.issue.owner, repo: run.issue.repo, number: run.issue.number }, "run manifests");
    if (view !== null) {
      view.runs.push(run);
    }
  }

  const repositories = snapshot.watchRepositories.map((repository) => {
    const key = makeRepoKey(repository);
    const issues = Array.from(repositoryMaps.get(key)?.values() ?? [])
      .map(toIssueView)
      .sort((left, right) => left.number - right.number);

    return {
      owner: repository.owner,
      repo: repository.repo,
      key,
      issues,
      hasRecords: issues.length > 0,
    };
  });

  return {
    generatedAt: now.toISOString(),
    configUsable: snapshot.configUsable,
    diagnostics: snapshot.diagnostics,
    repositories,
  };
}

export function parseIssueKey(issueKey: string): (RepositoryRef & { number: number }) | null {
  const match = /^([^/]+)\/([^#]+)#([1-9]\d*)$/.exec(issueKey);
  if (match === null) {
    return null;
  }

  return {
    owner: match[1] ?? "",
    repo: match[2] ?? "",
    number: Number(match[3]),
  };
}

function toIssueView(issue: IssueAccumulator): ObserverIssueView {
  const runs = [...issue.runs].sort(compareRunsDesc);
  return {
    owner: issue.owner,
    repo: issue.repo,
    number: issue.number,
    key: issue.key,
    sources: Array.from(issue.sources).sort(),
    latestRunStage: runs[0]?.stage ?? null,
    intake: issue.intake,
    roleThreads: Array.from(issue.roleThreads.entries())
      .map(([role, state]) => ({ role, state }))
      .sort((left, right) => left.role.localeCompare(right.role)),
    agentContexts: Array.from(issue.agentContexts.entries())
      .map(([role, state]) => ({ role, state }))
      .sort((left, right) => left.role.localeCompare(right.role)),
    runs,
  };
}

function compareRunsDesc(left: ObserverRunManifestRecord, right: ObserverRunManifestRecord): number {
  return right.completedAt.localeCompare(left.completedAt);
}
