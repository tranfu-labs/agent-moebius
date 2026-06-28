export interface RepositoryRef {
  owner: string;
  repo: string;
}

export interface IssueSource extends RepositoryRef {
  issueNumber: number;
  issueKey: string;
  cloneUrl: string;
}

export function makeRepoKey(repository: RepositoryRef): string {
  return `${repository.owner}/${repository.repo}`;
}

export function makeIssueKey(input: RepositoryRef & { issueNumber: number }): string {
  return `${makeRepoKey(input)}#${input.issueNumber}`;
}

export function makeCloneUrl(repository: RepositoryRef): string {
  return `https://github.com/${repository.owner}/${repository.repo}.git`;
}

export function makeIssueSource(input: RepositoryRef & { issueNumber: number }): IssueSource {
  return {
    owner: input.owner,
    repo: input.repo,
    issueNumber: input.issueNumber,
    issueKey: makeIssueKey(input),
    cloneUrl: makeCloneUrl(input),
  };
}
