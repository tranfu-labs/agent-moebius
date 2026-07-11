# github-issue-runner spec delta：local-console-t7-fact-source-migration

## REMOVED Requirements

### Requirement: Observer read-only diagnostics and presentation
The `github-issue-runner` domain no longer owns the auxiliary observer requirements for the `pnpm observer` entry, read-only local state aggregation, whitelist issue/run presentation, artifact links/previews, malformed state diagnostics, zero-write boundary, or fake `gh` / `codex` zero-invocation checks.

Those facts move to the `local-console` domain. GitHub response intake, comment publication, reactions, artifact publishing, media handling, issue worktrees, interruption, and driver-pool behavior remain owned by `github-issue-runner`.

#### Scenario: Observer presentation facts leave the runner domain
Given the fact-source migration is archived
When `openspec/specs/github-issue-runner/spec.md` is inspected
Then it does not contain the observer entry, read-only diagnostics, ledger UI requirements, observer scenarios, or observer-specific validation command
And it still contains the GitHub runner core behavior and dependency boundaries.

### Requirement: T7 Observer ledger UI
The `github-issue-runner` domain no longer owns goal -> milestone -> task rendering, watched repository filtering, owner phase summaries, gate visibility, explicit run evidence, roundtable badges, ledger fallback, or legacy issue/run presentation.

These presentation facts move unchanged to the `local-console` domain; this migration does not change observer runtime behavior.

#### Scenario: T7 presentation is owned by local-console
Given the fact-source migration is archived
When the current OpenSpec specs are inspected
Then `local-console` contains the observer ledger-first requirements and scenarios
And `github-issue-runner` contains no `T7 Observer` presentation section.
