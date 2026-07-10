# local-console delta：local-console-t5-deadletter-recovery

## ADDED Requirements

### Requirement: Local failure budget and dead-letter recovery
The local console MUST keep a failure count and last failure reason for each local source message processing failure.

The local console MUST count failures by source session id and source message id, not by run id.

The local console MUST keep a failed source message retryable until the configured local failure retry limit is exhausted.

The local console MUST write exactly one visible local dead-letter system record when a source message exhausts the retry budget.

The local console MUST persist a matching `local_dead_letters` fact for the dead-lettered source message.

The local console MUST complete or otherwise terminally mark the dead-lettered source message so later polling does not replay the same source message.

The local console MUST NOT save a successful dead-letter outcome when the visible dead-letter system record cannot be written.

The local console MUST NOT advance the local processing cursor when the visible dead-letter system record cannot be written.

The local console MUST ensure visible dead-letter system records contain no legal agent mention and do not trigger another local agent run.

The local console MUST allow a later local message in the same session to continue processing after an earlier message has been dead-lettered.

The local console MUST apply the same retry budget to `recordAgentResponse` failures that happen before the agent response is durably committed.

The local console MUST NOT duplicate an agent response when `recordAgentResponse` fails before commit and the source message is retried until dead-letter.

The local console MUST migrate old SQLite databases or missing failure metadata to default failure metadata without losing pending or running message positions.

#### Scenario: Consecutive failures dead-letter once
Given a local source message repeatedly fails with the same non-timeout processing error
When the failure count reaches the local retry limit
Then the local timeline contains one visible dead-letter system record for that source message
And `local_dead_letters` contains one matching fact
And later polling does not write another dead-letter for the same source message
And the session can process a later local message.

#### Scenario: Agent response commit failure dead-letters without duplicate response
Given `recordAgentResponse` fails before commit for the same local source message until the retry budget is exhausted
When local processing settles
Then the local timeline contains one visible dead-letter system record for that source message
And `local_dead_letters` contains one matching fact
And no agent response is duplicated
And the session can process a later local message.

#### Scenario: Dead-letter visible write failure stays retryable
Given a local source message has exhausted the local retry budget
And writing the visible dead-letter system record fails
When local processing settles
Then the local processing cursor is not advanced
And no successful `local_dead_letters` fact is saved
And a later retry can attempt the visible dead-letter write again.

#### Scenario: Dead-letter reason cannot self-trigger
Given a local source message dead-letters with a reason that contains handoff-like text
When the visible dead-letter system record is written
Then the visible dead-letter system record contains no legal agent mention
And later local drain does not trigger an agent from the dead-letter system record.

### Requirement: Local stuck restart recovery
The local console MUST classify Codex idle timeout, max-duration timeout, and stale running repair as stuck rather than ordinary failed dead-letter.

The local console MUST release or recover the session cursor after stuck recording so the session is not permanently running.

The local console MUST NOT duplicate an agent response that was already persisted before process restart.

The local console MUST continue startup catch-up from the next unprocessed local trigger after restart.

The local console MUST allow a later local message to run after a timeout or stale running record.

The local console MUST preserve pending and running message recovery semantics when old SQLite databases lack failure metadata columns or rows.

#### Scenario: Restart catch-up does not duplicate completed response
Given a local session already contains a persisted agent response
And the process restarts before the next local trigger is claimed
When the local console server starts and runs catch-up
Then the persisted agent response is not written a second time
And the next unprocessed trigger can still be processed.

#### Scenario: Stale running releases session after restart
Given a local source message is left running across process restart
When local startup stale repair marks the run stuck
Then the local timeline shows a visible stuck record with reason and runDir when available
And the session no longer reports a running source message
And a later local message can be accepted and processed.

### Requirement: Local dead-letter acceptance evidence
The local T5 acceptance script MUST verify dead-letter recovery through the local runtime, not only by direct fact insertion.

The local T5 acceptance script MUST include a restart stuck recovery case that proves session cursor recovery and response deduplication.

The local T5 acceptance script MUST include runtime-backed cases for `recordAgentResponse` pre-commit dead-letter, legacy failure metadata migration, and dead-letter self-trigger prevention.

#### Scenario: Runtime-backed dead-letter acceptance
Given `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case dead-letter-recovery` is run
When the fake local runtime injects repeated non-timeout failures for one source message
Then the evidence output shows the retry limit, one visible dead-letter, one dead-letter fact, no repeated dead-letter on later polling, and successful processing of a later recovery message.

#### Scenario: Runtime-backed restart recovery acceptance
Given `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case restart-stuck-recovery` is run
When the fake local runtime restarts from SQLite fixtures containing completed and stale-running work
Then the evidence output shows completed agent responses are not duplicated
And stale/running session state is released or recovered
And remaining pending work can continue.

#### Scenario: Runtime-backed record response dead-letter acceptance
Given `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case record-response-dead-letter` is run
When the fake local store injects `recordAgentResponse` pre-commit failures until the retry budget is exhausted
Then the evidence output shows one visible dead-letter, one dead-letter fact, zero duplicated agent responses, and successful processing of a later message.

#### Scenario: Runtime-backed legacy metadata acceptance
Given `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case legacy-failure-metadata-recovery` is run
When the fake local runtime starts from SQLite without failure metadata
Then the evidence output shows default metadata is available, stale running is released or recorded stuck, and completed agent responses are not duplicated.

#### Scenario: Runtime-backed dead-letter no-mention acceptance
Given `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case dead-letter-no-mention` is run
When a dead-letter reason contains handoff-like text
Then the evidence output shows the visible dead-letter contains no legal agent mention
And no local agent run is triggered by that dead-letter.
