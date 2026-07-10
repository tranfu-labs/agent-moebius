# local-console delta：local-console-t5-acceptance-loop

## MODIFIED Requirements

### Requirement: 边界
The local-console domain MUST keep GitHub runner semantics untouched while allowing this local acceptance-loop slice for T5 local equivalents.

The local-console domain MUST allow local acceptance-role walkthrough parsing, local acceptance fact recording, parent integration progress, repair routing, and visible format diagnostics in `.state/local-console.sqlite`.

The local-console domain MUST NOT modify GitHub issue timeline normalization, mention trigger rules, GitHub CEO orchestration, issue intake scheduling, GitHub comment publication, reaction targets, release artifact publication, issue media handling, issue worktree behavior, observer behavior, or GitHub driver pool semantics for this acceptance loop.

The local-console domain MUST NOT implement the M4 T6 mutually exclusive GitHub/local startup flag or cross-mode data migration in this acceptance-loop change.

The local-console domain MUST NOT use this acceptance-loop change to implement unrelated T5 local equivalents such as full CEO no-mention fallback, full child session orchestration, dead-letter parity, artifact publishing parity, or worktree diff return.

#### Scenario: Acceptance loop replaces the previous T5-only acceptance prohibition
Given the pre-T5 local-console spec prohibited T5-only full acceptance pre-pass
When this change is archived
Then the local-console spec permits the local acceptance-loop slice described by this change
And the local-console spec does not simultaneously forbid the same local acceptance pre-pass behavior
And GitHub issue runner behavior remains unchanged.

## ADDED Requirements

### Requirement: Local acceptance walkthrough parsing
The local console MUST parse acceptance-role walkthrough messages that use one line per formal acceptance statement plus one final overall conclusion line.

The local console MUST accept `qa`, `product-manager`, and `hermes-user` as local acceptance roles for this pre-pass.

The local console MUST require each walkthrough item to be numbered from 1 through the number of formal acceptance statements without gaps.

The local console MUST require each walkthrough item to state either pass or fail and include evidence text.

The local console MUST require the overall `验收结论：通过/不通过` line to match the per-statement results.

The local console MUST NOT infer a pass fact from a summary-only acceptance message that lacks parseable per-statement walkthrough lines.

The local console MUST preserve enough acceptance history to audit a failed walkthrough followed by a later passing recheck.

The local console MUST use the latest valid acceptance fact for routing decisions when the same acceptance role rechecks after repair.

#### Scenario: Acceptance role message records pass facts
Given a local child session has two formal acceptance statements
When `product-manager`, `hermes-user`, or `qa` writes two parseable walkthrough lines and `验收结论：通过`
Then the local console records a passed local acceptance fact
And the evidence records both statement-level results
And the local console can use that fact for parent integration progress.

#### Scenario: Acceptance role message records failed facts
Given a local child session has two formal acceptance statements
When an acceptance role writes one passed line, one failed line, and `验收结论：不通过`
Then the local console records a failed local acceptance fact
And the local console routes the task toward a repair handoff or repair child session.

### Requirement: Local acceptance pre-pass routing
The local console MUST run acceptance pre-pass before normal mention trigger handling.

The local console MUST write local acceptance facts before consuming any handoff mention in the same acceptance message.

The local console MUST create or update parent integration progress after all in-scope local child session acceptance facts pass.

The local console MUST route acceptance failure into a repair path instead of treating the original implementation as accepted.

The local console MUST keep acceptance facts, integration events, repair references, visible system messages, and cursor advancement within an atomic local SQLite boundary.

The local console MUST NOT advance the local processing cursor as successfully handled when visible acceptance side effects fail to write.

The local console MUST NOT consume a handoff mention from the same acceptance message when acceptance pre-pass fails before required visible side effects are written.

The local console MUST dedupe parent integration progress and repair routing by stable local keys across retries.

The local console MUST surface a visible blocked or error state when formal acceptance statements cannot be found for an acceptance-role message.

#### Scenario: Passed child acceptance requests parent integration
Given all active local child sessions for a parent task have passed acceptance facts
When the latest child acceptance pre-pass settles
Then the parent session receives one deduped integration progress or request event
And the triggering acceptance message is marked processed only after the visible parent event is written.

#### Scenario: Parent integration visible write failure is retryable
Given a local child acceptance fact is ready to trigger parent integration progress
And writing the visible parent progress fails
When local acceptance pre-pass settles
Then the triggering message cursor is not advanced
And any handoff mention in the same message is not consumed
And a completed parent integration request is not recorded
And a later retry creates only one deduped parent integration progress.

#### Scenario: Failed child acceptance creates repair path
Given a child session receives a parseable failed acceptance walkthrough
When local acceptance pre-pass settles
Then a failed acceptance fact is stored
And a stable repair handoff or repair child session is created or recovered
And the parent session can see the repair reference.

#### Scenario: Recheck after repair uses latest verdict
Given an acceptance role first writes a parseable failed walkthrough
And a repair path is created or recovered
When the same acceptance role later writes a parseable passing walkthrough for the same task
Then the latest passed fact drives parent rejoin or integration progress
And the previous failed repair remains visible as a system record, repair reference, or historical acceptance fact.

#### Scenario: Missing formal acceptance statements blocks acceptance
Given a local child session has no readable formal acceptance statements
When an acceptance role writes an acceptance walkthrough
Then the local console writes a visible blocked or error state
And no passed acceptance fact is recorded
And the local console does not invent an acceptance scope.

### Requirement: Local acceptance format diagnostics
The local console MUST produce a visible format reminder or error state when an acceptance-role message clearly attempts acceptance but cannot be parsed.

The local console MUST NOT save a passed acceptance fact for an unparseable walkthrough.

The local console MUST keep the original message retryable or visibly diagnosed when format handling fails.

The local console MUST ensure format reminders contain no legal agent mention and do not trigger an agent run by themselves.

#### Scenario: Summary-only acceptance is not silently accepted
Given a local child session has formal acceptance statements
When an acceptance role writes `验收结论：通过` without parseable numbered walkthrough lines
Then the local console writes a visible format reminder or error state
And no passed local acceptance fact is recorded
And the missing fact remains visible in local T5 facts or session status.

#### Scenario: Malformed walkthrough with handoff does not trigger handoff
Given a local child session has formal acceptance statements
When an acceptance role writes malformed walkthrough lines and also includes a legal handoff mention
Then the local console writes a visible format reminder or error state
And no passed local acceptance fact is recorded
And the handoff mention in that same message is not consumed by normal trigger handling.

#### Scenario: Acceptance store timeout releases drain
Given a local acceptance pre-pass SQLite command never settles
When the configured local store timeout is reached
Then the session drain is released
And the triggering message remains retryable or visibly diagnosed
And no successful acceptance fact is saved for that attempt.
