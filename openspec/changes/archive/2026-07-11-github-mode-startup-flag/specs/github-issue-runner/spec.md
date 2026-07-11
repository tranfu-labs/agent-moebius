# github-issue-runner Specification Delta

## ADDED Requirements

### Requirement: GitHub mode startup flag

The GitHub issue runner MUST start from the terminal `pnpm start -- --github-mode` command when the exact `--github-mode` flag is present.

The `--github-mode` flag MUST be the documented and stable flag name for pure GitHub runner mode.

The GitHub mode startup path MUST NOT start the local console server.

The GitHub mode startup path MUST keep existing GitHub runner behavior unchanged after startup selection: repository scanning, GitHub response intake, role threads, agent contexts, goal ledger state, GitHub comments, reactions, release artifact publication, issue media handling, issue worktree behavior, driver pool scheduling, `gh` timeout/retry, and Codex watchdog behavior continue to use their existing GitHub-mode adapters and state files.

The GitHub mode startup path MUST keep using GitHub-mode state channels for GitHub intake, role-thread, agent-context, and ledger state.

When GitHub runner state is split away from the current shared `.state/local-console.sqlite`, the GitHub mode startup path MUST perform a bounded one-time migration of existing GitHub runner state before starting any GitHub issue scan.

The migration MUST copy only GitHub runner state: GitHub response intake state, role-thread state, agent-context state, and goal-ledger state.

The migration MUST NOT copy local console session data, local session messages, local cursors, local route decisions, local acceptance facts, local integration events, local dead letters, or local workspace diff records.

If GitHub runner state migration fails, times out, or detects conflicting unmarked target state, GitHub mode startup MUST fail visibly before scanning GitHub issues.

On migration failure, GitHub mode startup MUST NOT silent rebaseline, MUST NOT advance intake cursors, and MUST NOT start local runtime.

After a successful migration, later GitHub mode startups MUST NOT re-import the same legacy source and MUST NOT overwrite newer GitHub-mode state with older legacy state.

The GitHub mode startup path MUST NOT write local console SQLite session messages, local cursors, local route decisions, local dead letters, or local workspace diff records.

The default terminal `pnpm start` command without `--github-mode` MUST NOT start GitHub issue scanning or read GitHub issues.

Unknown startup flags, typo flags such as `--githubmode`, non-exact flags such as `--github-mode=1`, or conflicting startup mode flags MUST fail closed before starting either local mode or GitHub mode.

#### Scenario: Explicit GitHub mode starts only GitHub runner

- **Given** the user runs `pnpm start -- --github-mode`
- **When** startup mode is resolved
- **Then** the runtime starts the GitHub issue runner heartbeat
- **And** the runtime does not start the local console server
- **And** the runtime does not create or write local console SQLite session messages

#### Scenario: Default start does not scan GitHub

- **Given** the user runs `pnpm start` without `--github-mode`
- **When** startup mode is resolved
- **Then** GitHub repository scanning is not started
- **And** GitHub issue view/list adapters are not called
- **And** GitHub response intake state is not loaded for a runner heartbeat

#### Scenario: Invalid startup flags start no runtime

- **Given** the user runs `pnpm start -- --githubmode`
- **When** startup mode is resolved
- **Then** startup fails with a visible error
- **And** no local console server starts
- **And** no GitHub runner heartbeat starts

#### Scenario: GitHub mode preserves existing runner liveness boundaries

- **Given** a configured watched repository and the `--github-mode` flag
- **When** the GitHub runner starts
- **Then** the first heartbeat, later heartbeats, issue dispatching, role-thread resume, GitHub CLI timeout/retry, Codex watchdog, reactions, artifact publication, and dead-letter behavior match the pre-flag GitHub runner path except that local console is not started

#### Scenario: Existing GitHub runner state is migrated before scanning

- **Given** `.state/local-console.sqlite` contains GitHub intake, role-thread, agent-context, and goal-ledger records
- **And** the same SQLite file contains local console session records
- **When** the user runs `pnpm start -- --github-mode` for the first time after the state split
- **Then** GitHub runner state is migrated or read into the GitHub-mode state channel before any GitHub issue scan starts
- **And** local console session records are not migrated into the GitHub-mode state channel
- **And** the local runtime is not started

#### Scenario: Migration failure fails before GitHub scan

- **Given** GitHub runner state migration fails or times out
- **When** the user runs `pnpm start -- --github-mode`
- **Then** startup fails with a visible error before GitHub issue list or view adapters are called
- **And** intake cursors are not advanced
- **And** local runtime is not started

#### Scenario: Migration is idempotent

- **Given** GitHub runner state has already been migrated into the GitHub-mode state channel
- **When** the user runs `pnpm start -- --github-mode` again
- **Then** startup does not re-import the same legacy source
- **And** startup does not overwrite newer GitHub-mode state with older legacy state
