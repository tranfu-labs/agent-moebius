# local-console delta：local-console-t5-child-session-orchestration

## MODIFIED Requirements

### Requirement: 边界
The local-console domain MUST continue to avoid modifying `conversation`, `triggers`, agent mention parsing, stage parsing, CEO guardrail, goal-ledger business rules, or GitHub issue runner semantics to satisfy local-console behavior.

The local-console domain MUST allow the T5 child session orchestration equivalent described by this change: local child session creation, `sessions.parent_session_id` persistence, and sidebar parent-child rendering.

The local-console domain MUST NOT implement other T5-only local equivalents as part of this change, including CEO no-mention fallback, full acceptance pre-pass, dead-letter parity, artifact publishing, or worktree diff return.

The local-console domain MUST NOT implement the T6 GitHub/local mutually exclusive startup flag or cross-mode data migration as part of this change.

#### Scenario: Child session orchestration no longer conflicts with local-console boundary
Given this change is archived
When `openspec/specs/local-console/spec.md` is inspected
Then it allows local child session orchestration for T5
And it does not retain a MUST NOT that forbids child session orchestration
And the remaining T5-only capabilities outside this change remain forbidden.

## ADDED Requirements

### Requirement: Local child session persistence
The local console MUST persist parent-child session relationships in `.state/local-console.sqlite` using `sessions.parent_session_id` or an equivalent column on the existing `sessions` table.

The local console MUST return each session's parent session id through local session summaries and local console state APIs.

The local console MUST keep child sessions in the same project as their parent session.

The local console MUST NOT create a child session under a different project than its persisted parent session.

The local console MUST preserve existing root sessions with no parent reference when migrating older SQLite databases.

The local console MUST bound local child session creation through the existing local store timeout path so a locked database, slow worker, or hung worker cannot permanently occupy the parent session drain.

#### Scenario: Child session stores parent reference
Given a local parent session exists
When local child session creation runs for a CEO-orchestrated task
Then a child session row is inserted or recovered
And the child session row stores the parent session id
And listing sessions returns the child with that parent session id.

#### Scenario: Project mismatch does not create cross-project child
Given a local parent session is persisted under project A
When local child session creation is called with project B
Then the command fails closed or uses the persisted project A
And no child session is created under project B
And the parent session project is not silently rewritten.

#### Scenario: Hung child creation releases parent session
Given local child session creation never returns or exceeds the local store timeout
When the runtime handles the orchestration attempt
Then the parent session run is recorded as visible failed or stuck
And orchestration success is not saved
And the parent session can accept a later local message.

### Requirement: Local CEO child session orchestration
The local console MUST map local CEO child task descriptors to local child sessions instead of GitHub child issues.

The local console MUST create child sessions through the existing local console SQLite store, not through GitHub APIs or a second persistence file.

The local console MUST derive a stable local orchestration key from parent session id, workflow id, and ledger task id before creating a child session.

The local console MUST recover an existing child session by ledger reference or hidden orchestration key before creating a new child session.

The local console MUST fail closed when a hidden orchestration key maps to multiple child sessions in the same parent scope.

The local console MUST write the child session creation and the initial child handoff message in one SQLite transaction.

The local console MUST write a visible parent-session progress record after child sessions are created or recovered.

The local console MUST NOT delete already-created child sessions as compensation after a later orchestration failure.

#### Scenario: Multi-child goal creates local child sessions
Given a local parent session receives a CEO orchestration result with multiple child task descriptors
When the local child session executor runs
Then one local child session is created or recovered for each descriptor
And each child session contains an initial handoff message
And the parent session receives a visible progress record referencing the child sessions.

#### Scenario: Retry does not duplicate child session
Given a previous local child session was created with a hidden orchestration key
And the orchestration success state was not saved
When the same descriptor is retried
Then the existing child session is recovered
And no duplicate child session or duplicate initial handoff message is inserted.

#### Scenario: Hidden key collision fails closed
Given two existing child sessions under the same parent contain the same hidden orchestration key
When local child session recovery retries that key
Then recovery fails closed with a visible error
And neither child session is selected as a successful recovery.
