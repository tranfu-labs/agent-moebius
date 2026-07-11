# desktop-shell delta：desktop-console-t65-integration-closeout

说明：本文件保留为项目级 `spec-delta/` 路径；OpenSpec CLI 可验证版本同步写在 `openspec/changes/desktop-console-t65-integration-closeout/specs/desktop-shell/spec.md`。两者语义保持一致。

## ADDED Requirements

### Requirement: The desktop renderer remains a thin real-data host

The desktop console renderer MUST continue to own local-console HTTP polling and user-action callbacks while the console-ui `OperatorConsole` owns presentation adaptation and composite layout.

The desktop renderer MUST NOT duplicate role localization, terminal-outcome localization, machine-term filtering, or raw-information disclosure rules.

This integration MUST NOT change runner, local-console server, runtime, store, SQLite schema, Codex, or GitHub behavior.

#### Scenario: Presentation integration does not alter runtime semantics

Given the desktop renderer receives the existing local-console state shape
When the integrated operator console is used to select a session, send a message, or interrupt a run
Then the renderer calls the same existing HTTP endpoints and callbacks
And no backend business rule or persisted state schema changes.

### Requirement: T6.5 closeout is evidence-gated

The roadmap T6.5 item MUST NOT be marked complete until the bounded fixed-data browser walkthrough, visible-text and complete-accessibility-tree zero-match gates, fresh-artifact validation, tested-source manifest validation, evidence sidecar validation, console-ui tests, desktop build, root typecheck, Storybook build, and strict OpenSpec validation all pass.

Before creating the closing commit, closeout MUST recompute the tested-source manifest and require it to match the evidence tested-source digest; after creating the commit, closeout MUST recompute the same file digests from the committed blobs and require the same match.

The closing Git commit and PR MUST each contain `Closes #142`, and the PR body MUST summarize the acceptance evidence and tested-source digest.

#### Scenario: Roadmap and PR reflect verified completion

Given every required verification has exited successfully
When the change is closed out
Then the roadmap marks T6.5 complete and references the generated evidence
And the pushed commit and PR contain the required close reference
And the PR body includes the evidence summary and tested-source digest.

#### Scenario: Closeout rejects evidence from a different worktree state

Given browser acceptance has succeeded and evidence exists
When a delivered implementation, test, script, or OpenSpec file changes before commit
Then closeout detects that the recomputed tested-source digest differs from the evidence
And it stops without marking roadmap complete, committing, pushing, or opening a PR.

### Requirement: PR closeout recovers ambiguous creation without duplication

PR closeout MUST query open pull requests by the exact current head branch before attempting creation.

If exactly one PR matches, closeout MUST reuse it; if none matches, closeout MAY create one; if more than one matches, closeout MUST fail closed.

Every PR query, create, and view operation MUST have an explicit timeout.

If creation times out or loses its response, closeout MUST NOT retry creation and MUST instead query the same head branch within a bounded recovery window.

The recovered or created PR MUST be read back and MUST uniquely match the current head commit and contain `Closes #142`, the current evidence run identifier, current commit SHA, tested-source digest, and the acceptance evidence summary.

#### Scenario: A server-side success with a lost response is recovered

Given the PR service creates the pull request but the create client times out before receiving the response
When closeout enters recovery
Then it queries by the exact current head branch without issuing another create
And it reuses the unique matching PR
And it verifies the head commit, tested-source digest, and required body evidence before reporting success.
