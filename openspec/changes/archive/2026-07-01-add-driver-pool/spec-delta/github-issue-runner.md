# github-issue-runner spec delta

## ADDED Requirements

### Driver pool isolation

- MUST execute issue processing jobs through an independent driver pool abstraction when work may call the local Codex driver.
- MUST NOT set a default Codex driver concurrency limit in runner business scheduling logic.
- MUST allow a positive integer `maxConcurrent` to limit running driver pool jobs; queued jobs MUST start when running jobs complete.
- MUST allow runner tests to inject fake or instrumented driver pools without invoking local Codex.
- MUST keep the driver pool independent from GitHub issue domain types, trigger rules, prompt construction, Codex arguments, and intake state.

### Deterministic runner folding

- MUST keep tick-level overlap prevention while driver pool jobs are running.
- MUST dedupe issue processing jobs by `issueKey` within the same processing phase.
- MUST fold driver job results back into `.state/github-response-intake.json` in deterministic job order after jobs complete.

### Concurrent state writes

- MUST save role thread state by issue + role entry merge under a state-file-scoped serial lock.
- MUST save agent pre-script context by issue + role entry merge under a state-file-scoped serial lock.

### Codex run directories

- MUST generate a unique local Codex run directory for every driver run in the same runner process.
- MUST include a process-local sequence suffix in run directories so identical timestamps and message counts do not collide.

## ADDED Scenarios

### Scenario: default driver pool starts jobs without an extra limit

Given three pending driver jobs
And no `maxConcurrent` is configured
When the jobs are submitted to the driver pool
Then all three jobs may start before any one finishes

### Scenario: explicit driver pool limit queues jobs

Given three pending driver jobs
And `maxConcurrent = 2`
When the jobs are submitted to the driver pool
Then at most two jobs run at the same time
And the queued job starts after a running job finishes

### Scenario: runner folds concurrent job outcomes deterministically

Given one repository scan returns two changed issues
When runner submits both issue processing jobs to an injected driver pool
Then both jobs may run concurrently
And runner saves intake state only after folding their outcomes in job order

### Scenario: role thread entry merge preserves concurrent results

Given two Codex jobs for different issue + role entries finish concurrently
When both save role thread state
Then both entries are present in `.state/role-threads.json`

### Scenario: agent context entry merge preserves concurrent pre-script contexts

Given two dev pre-scripts for different issues prepare contexts concurrently
When both save agent context state
Then both entries are present in `.state/agent-contexts.json`

### Scenario: run directories are unique for same timestamp and count

Given two Codex runs start in the same process
And both have the same message count and timestamp interval
When runner creates run directories
Then the two directory paths are different
