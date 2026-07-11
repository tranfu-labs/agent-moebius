# local-console Specification Delta

## ADDED Requirements

### Requirement: Local and GitHub runtime isolation

The local-console domain MUST keep GitHub runner semantics untouched while allowing local equivalents for CEO routing, child sessions, acceptance pre-pass, dead-letter recovery, local role threads, local evidence, worktree diff return, and the terminal startup selection that makes local mode the default.

The local-console domain MUST NOT modify GitHub issue timeline normalization, mention trigger rules, GitHub CEO orchestration, issue intake scheduling, GitHub comment publication, reaction targets, release artifact publication, issue media handling, issue worktree behavior, observer behavior, or GitHub driver pool semantics.

The local-console domain MUST NOT migrate local console session data into GitHub mode, mirror local session data into GitHub runner state, or share runtime writes between local mode and GitHub mode.

The GitHub-mode one-time extraction of existing GitHub runner state from a previously shared SQLite file is owned by the GitHub issue runner startup path and MUST NOT include local console session tables.

#### Scenario: Local startup selection does not change GitHub runner semantics

- **Given** terminal startup selection makes local mode the default
- **When** local-console behavior is implemented
- **Then** GitHub issue timeline normalization, mention trigger rules, issue intake scheduling, GitHub comment publication, reaction targets, release artifact publication, issue media handling, issue worktree behavior, observer behavior, and GitHub driver pool semantics remain governed by their existing GitHub runner specifications

### Requirement: Local default startup

The default terminal `pnpm start` command without `--github-mode` MUST start local console / local mode.

The default local mode startup path MUST use the local console SQLite data chain and MUST NOT start GitHub issue scanning.

The default local mode startup path MUST NOT read GitHub issue bodies, GitHub comments, or GitHub issue lists.

The default local mode startup path MUST NOT require GitHub authentication as a precondition for starting the local console server.

The default local mode startup path MUST start successfully in a clean environment with no configured repositories and no GitHub authentication.

Local mode runtime data MUST remain in the local console SQLite data chain and MUST NOT be mirrored into GitHub response intake, role-thread, agent-context, or goal-ledger state as part of terminal startup selection.

Local mode and GitHub mode MAY use the same data root, but they MUST NOT use the same runtime store tables or state channel for local session messages and GitHub issue runner state.

#### Scenario: Default start enters local mode

- **Given** the user runs `pnpm start` without `--github-mode`
- **When** startup mode is resolved
- **Then** the local console server starts
- **And** GitHub issue scanning does not start
- **And** GitHub issue read adapters are not called

#### Scenario: Clean environment starts local mode without GitHub authentication

- **Given** no repository is configured
- **And** GitHub authentication is unavailable
- **When** the user runs `pnpm start` without `--github-mode`
- **Then** the local console server starts without error
- **And** no GitHub heartbeat is created
- **And** no GitHub issue adapter is called

#### Scenario: Local and GitHub state remain separate

- **Given** local mode writes a representative local session message
- **And** GitHub mode writes a representative GitHub intake or role-thread state entry
- **When** the two state stores are inspected
- **Then** the local session message is visible only through the local SQLite data chain
- **And** the GitHub intake or role-thread state entry is visible only through the GitHub mode state channel
- **And** neither startup mode mirrors the representative data into the other mode
