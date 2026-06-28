# github-issue-runner spec delta

## 新增
- MUST treat a configured target issue that cannot be resolved by GitHub as a recoverable skip for the current polling cycle.
- MUST log `event: "skip"` with `reason: "issue-not-found"` and `issueKey` when the configured issue number does not resolve.
- MUST NOT call Codex, post a GitHub comment, or update local state when the target issue is not found.
- MUST continue treating non-not-found GitHub CLI failures as cycle errors.
