# local-console spec delta：local-console-t7-fact-source-migration

## MODIFIED Requirements

### Requirement: Domain positioning and boundary
The `local-console` domain MUST own the default local operator console data channel and the auxiliary observer diagnostics/presentation facts.

The observer MUST remain an independent read-only process and MUST NOT become part of the local session state machine.

The migration MUST NOT modify GitHub issue timeline normalization, mention triggers, CEO guardrail, issue intake scheduling, GitHub comment publication, reaction targets, artifact publication, issue media, issue worktrees, or driver-pool semantics.

#### Scenario: Fact ownership changes without runtime drift
Given this migration is implemented
When `git diff --name-only` is inspected
Then the changed implementation files are limited to OpenSpec, wireframe, and documentation fact sources
And no `src/` runtime file is changed.

## ADDED Requirements

### Requirement: Auxiliary read-only observer
The local-console domain MUST provide `pnpm observer` as an auxiliary local read-only diagnostic entry.

The observer MUST read config, goal ledger, GitHub response intake, role thread, agent context, and run manifest state without calling GitHub, Codex, release upload, artifact publishers, runner write endpoints, or state save helpers.

The observer MUST keep watched config, `.state`, run manifest, artifact, release, worktree, and runner state files unchanged across start, requests, refreshes, artifact inspection, and shutdown.

The observer MUST aggregate watched issue/run facts, show artifact links or unpublished paths, distinguish missing/empty/malformed state, skip malformed JSONL records without losing valid records, and remain independent from runner lifecycle.

#### Scenario: Read-only diagnostics preserve valid local facts
Given local state contains watched issue/run records, artifact links, malformed JSONL lines, and missing state files
When the observer page renders
Then valid issue/run/artifact facts remain visible
And malformed or missing inputs are shown as distinct diagnostics
And no external command, publisher, write endpoint, or state mutation is invoked.

#### Scenario: Observer process failure does not affect runner
Given observer server is running
When the observer process is killed and a runner heartbeat follows
Then runner heartbeat and issue processing continue without importing or depending on observer modules.

### Requirement: Ledger-first observer presentation
The observer MUST render a goal -> milestone -> task tree when `.state/goal-ledger.json` is valid, filter primary goals by watched repository references, retain non-watched refs inside included goals as muted facts, render owner phase summaries without inferring replacement active phases, and show task readiness, acceptance, issue refs, integration events, and explicit run evidence.

The observer MUST expose human gate facts without operation capability, MUST use only explicit `TaskRecord.runManifestRefs` as task evidence, MUST place unreferenced runs under `Unlinked local runs`, and MUST never reveal full issue/comment bodies, full run manifest JSON, hidden keys, tokens, or secrets.

Malformed, missing, invalid, or timed-out ledger reads MUST affect only the ledger tree; legacy issue/run diagnostics MUST remain available.

#### Scenario: Ledger-first diagnostics render watched goal tree
Given a valid ledger contains a goal related to a watched repository
When the observer page renders
Then the primary view shows goal -> milestone -> task hierarchy, owner phases, gate facts, task details, and explicit run evidence
And unreferenced runs remain diagnostic rather than task evidence.

#### Scenario: Ledger failure preserves legacy diagnostics
Given the ledger is malformed or its read times out
And existing intake/run manifest state is valid
When the observer page renders
Then the ledger area shows a bounded failure diagnostic
And legacy issue/run records remain visible
And fake `gh` and `codex` invocation logs remain empty.

## 验收约束
- `pnpm vitest run tests/observer.test.ts` MUST pass under the `local-console` fact source.
- `pnpm test` MUST pass without GitHub runner semantic changes.
