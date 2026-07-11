# console-ui delta：desktop-console-t65-integration-closeout

说明：本文件保留为项目级 `spec-delta/` 路径；OpenSpec CLI 可验证版本同步写在 `openspec/changes/desktop-console-t65-integration-closeout/specs/console-ui/spec.md`。两者语义保持一致。

## ADDED Requirements

### Requirement: Composite components are integrated into the real operator console

The console-ui package root MUST export the message, run, outcome, sidebar, role composer, empty-state, and session-context composite components delivered by the two prerequisite changes.

The real `OperatorConsole` MUST compose all seven composite capabilities rather than retaining separate hand-written equivalents for the default desktop view.

The integration MUST preserve project opening, session creation, project and session selection, workspace toggling, message sending, run interruption, and diagnostics actions.

#### Scenario: The desktop page uses every delivered composite capability

Given both prerequisite component changes have merged
When the real desktop operator console renders fixed acceptance data
Then the sidebar, session context, agent message, active run, terminal outcome, empty state, and protocol-safe role composer are rendered through the delivered composite components
And the existing desktop actions remain operable.

### Requirement: API-shaped data is adapted without changing backend semantics

The operator console MUST map its existing project, session, message, and active-run props to presentation component models through deterministic presentation-only adapters.

The adapters MUST NOT import runner, local-console runtime, SQLite, Codex, or GitHub implementation modules.

The integration MUST NOT infer completed sessions from idle sessions and MUST NOT fabricate run steps when the active-run snapshot does not contain step data.

#### Scenario: Missing presentation facts degrade truthfully

Given a real session is idle without an explicit completion fact and an active run has no step data
When the operator console renders
Then the session is not labeled completed
And the run block shows its one-line human summary without invented steps.

### Requirement: Machine evidence is progressively disclosed

The default visible operator-console surface MUST use Chinese role, status, workspace, and error summaries.

The default visible surface and the complete default accessibility tree MUST NOT expose `worktree`, `direct`, `cwd`, `runDir`, `dead-letter`, `handoff`, or the English author labels `user`, `agent`, and `system`.

Raw message bodies, errors, output, paths, workspace modes, and protocol metadata MUST remain available in collapsed details that the user can explicitly open.

#### Scenario: The visible-copy gate passes without deleting evidence

Given the real desktop renderer shows agent, system, run, workspace, and terminal-outcome fixtures with raw machine evidence
When all raw-information details remain closed
Then a visible-text snapshot and a complete body accessibility snapshot have zero matches for the forbidden machine terms and English author labels
When the user opens the corresponding details
Then the original machine evidence is visible unchanged.

#### Scenario: Non-control accessible names cannot bypass the gate

Given a non-control accessible node has a machine term in its accessible name while visible text remains clean
When the accessibility gate runs
Then the body accessibility snapshot reports the matching node
And the acceptance workflow fails.

#### Scenario: Raw fields remain isolated and auditable

Given raw body, error, cwd, run directory, workspace mode, dead-letter reason, and handoff fields each contain a unique run-scoped sentinel
When every raw-information detail remains closed
Then none of the seven sentinels is visible or present in the default accessibility tree
When exactly one corresponding detail is opened
Then only its matching sentinel becomes visible unchanged
And the other six sentinels remain unavailable.

### Requirement: T6.5 behaviors have reproducible browser evidence

The integration MUST provide a fixed-data browser acceptance workflow for roadmap T6.5 scenarios (a) through (f).

The workflow MUST produce separate screenshots for agent progressive disclosure, the active run block, terminal outcomes, sidebar ordering and completed collapse, role completion, and the integrated Storybook operator console.

The workflow MUST also produce a visible-copy snapshot, a complete accessibility snapshot, and structured evidence that records interaction assertions and artifact paths.

The workflow MUST delete prior T6.5 final artifacts before the run, stage all new outputs under a unique run identifier, and publish final artifacts only after every assertion succeeds.

The workflow MUST compute a canonical tested-source manifest that records the base Git HEAD and the sorted delivery implementation, test, script, and OpenSpec files under test, including tracked changes and untracked files, with each file's path, mode, byte size, and SHA-256 digest.

The final structured evidence MUST record the run identifier, start and finish times, branch, base Git HEAD, tested-source digest, command results, and the byte size, modification time, and SHA-256 digest of every payload artifact.

The final structured evidence MUST NOT include the evidence JSON itself or its sidecar in the payload artifact digest list; a separate evidence sidecar MUST record the final evidence JSON SHA-256 digest.

#### Scenario: A reviewer can audit every T6.5 interaction

Given the desktop static renderer and fake local console data are available
When the T6.5 acceptance workflow runs
Then each roadmap scenario (a) through (f) has a screenshot and machine-readable assertion result
And each payload artifact is tied to the current run identifier and digest
And the workflow does not invoke a real Codex run.

#### Scenario: A failed rerun cannot reuse stale evidence

Given prior final artifacts exist and the current run is configured to fail an interaction assertion
When the current acceptance workflow starts
Then it removes the prior T6.5 final artifacts
And it exits non-zero without publishing a final evidence JSON
And a later successful run publishes only files whose identifiers, times, tested-source digest, payload digests, and evidence sidecar match that later run.

#### Scenario: Tested-source drift invalidates evidence

Given an acceptance workflow has succeeded
When a delivered implementation, test, script, or OpenSpec file changes before closeout
Then recomputing the tested-source manifest no longer matches the evidence digest
And closeout fails until acceptance is rerun.

### Requirement: Acceptance execution is bounded and cleans up resources

Every spawned verification command, fake or static server lifecycle operation, browser navigation, locator wait, scenario, and resource-close operation MUST have an explicit timeout.

On timeout or failure, the acceptance workflow MUST terminate the entire spawned process tree, close already-created pages, browsers, and servers in `finally`, remove run-scoped temporary directories, and exit non-zero.

On POSIX platforms, process-tree termination MUST use an owned process group with graceful termination followed by forced termination. On Windows, it MUST use a bounded `taskkill /PID <pid> /T /F`. Platforms where tree termination cannot be guaranteed MUST fail before starting acceptance rather than falling back to direct-child-only cleanup.

A failed or timed-out acceptance workflow MUST NOT publish final evidence or allow roadmap, commit, or PR closeout.

#### Scenario: A hanging child or browser wait fails closed

Given a Storybook child process or browser locator wait never completes
When the configured timeout expires
Then the workflow terminates the hanging operation and cleans up all previously created resources within bounded close time
And it exits non-zero without publishing final evidence or invoking closeout.

#### Scenario: A stubborn grandchild cannot survive cleanup

Given a spawned verification child creates a grandchild that ignores graceful termination and holds a known port or file handle
When the configured timeout expires
Then the workflow terminates the whole process tree
And a second acceptance run can immediately reuse the same resource successfully.
