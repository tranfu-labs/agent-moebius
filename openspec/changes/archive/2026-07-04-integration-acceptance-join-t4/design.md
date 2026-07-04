# Design

## Ledger Model
`TaskRecord.acceptanceFacts` stores child issue acceptance facts. A fact is keyed by source issue, source comment/message identity, and per-statement result digest, so replaying the same formal acceptance comment upserts the same fact instead of changing the join digest.

`PhaseRecord.integrationAcceptance` stores current active phase join events: `requested`, `passed`, `failed`, and `blocked`. Events store only bounded facts: reviewer role, status, parent issue, child pass digest, target acceptance digest, source comment identity, failed statement ids, repair task ids, timestamp, and note.

## Join Evaluation
The join evaluator is pure `goal-ledger` logic. It projects only the current active phase for the owner, enumerates only ledger child refs visible in that active phase, ignores unledgered historical issues, fails closed for cross-repo child refs, and uses active phase acceptance statements as the target-level checklist.

## Runner Pre-Pass
Before normal mention trigger resolution, runner checks whether the latest comment is from a real acceptance role. If it is child-level acceptance, runner records the fact first. Passed facts may evaluate join and post a parent integration acceptance request; failed facts continue to normal mention handling so a valid repair handoff is not lost.

If it is parent-level integration acceptance, runner records the event first. Passed integration acceptance does not run Codex. Failed integration acceptance creates or recovers repair child issues by hidden orchestration key and records repair provenance.

## Idempotency
Parent integration requests contain a hidden integration key derived from parent issue, phase id, child pass digest, and target acceptance digest. Repeated polling checks parent issue comments for that key before posting. Repair child issues use existing hidden orchestration key lookup and ledger child refs before creation.

## Failure Handling
Ledger writes, parent fetch/post, hidden-key lookup, and repair child creation are bounded. Failures before a visible result return failed so intake `updatedAt` is not advanced. Parent ref missing or target acceptance missing fail closed with a visible explanation on the nearest available issue path.
