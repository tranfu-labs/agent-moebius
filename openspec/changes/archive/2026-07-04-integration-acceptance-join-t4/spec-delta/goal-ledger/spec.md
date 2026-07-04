# goal-ledger Delta

## Added Rules
- MUST allow a task to record bounded child acceptance facts with reviewer role, per-statement pass/fail results, source issue/comment identity, timestamp, and note.
- MUST upsert child acceptance facts by a stable source/fact key so replaying the same acceptance comment does not change the semantic child pass digest.
- MUST evaluate integration acceptance join from the current active phase projection only.
- MUST enumerate only ledger child refs visible to the current active phase owner.
- MUST return waiting until every in-scope child ref has a latest passed acceptance fact.
- MUST fail closed for no active phase, missing target-level acceptance statements, missing child refs, multiple active phases, or cross-repository child refs.
- MUST derive the target-level acceptance digest from active phase acceptance statements only.
- MUST record bounded integration acceptance events on the phase with requested/passed/failed/blocked status and provenance.
- MUST NOT call GitHub, Codex, shell, file system, observer, worktree, or issue lifecycle APIs from goal-ledger logic.

## Added Scenarios
### Scenario T4.1: child acceptance fact replay is stable
Given a task child issue has a formal acceptance pass comment
When the same comment is recorded twice
Then the task has one acceptance fact for that source key
And the join digest does not change on replay

### Scenario T4.2: join waits for all in-scope children
Given a current active phase owner has two ledger child refs
And only one child has a latest passed acceptance fact
When integration join evaluation runs
Then the result is waiting and lists the missing child

### Scenario T4.3: join ready uses goal-level active phase acceptance
Given every visible child ref has a latest passed acceptance fact
When integration join evaluation runs
Then the result is ready with child pass digest, target acceptance digest, and hidden integration key

### Scenario T4.4: integration events are idempotent
Given a phase has an integration acceptance requested event
When the same join key and status are recorded again
Then the event is upserted rather than duplicated
