# github-issue-runner Delta

## Added Rules
- MUST run an acceptance pre-pass before normal mention trigger handling.
- MUST recognize child task pass only from a real acceptance role comment that covers every formal child acceptance statement and states overall pass.
- MUST NOT treat `code-verified`, issue close, or ledger child refs alone as acceptance pass.
- MUST write child acceptance provenance to the ledger before consuming any handoff mention in the same comment.
- MUST post one parent issue integration acceptance request after all current active phase ledger child refs pass.
- MUST use active phase projection acceptance statements as the parent target-level acceptance checklist.
- MUST fail closed and request ledger facts when target-level acceptance statements are missing.
- MUST route parent integration acceptance failure into repair child issues, not direct parent issue implementation.
- MUST rejoin the same parent goal after repair child issues pass.
- MUST dedupe parent integration requests by hidden integration key.
- MUST dedupe repair child creation by hidden orchestration key and recover existing issues before creating.
- MUST bound ledger IO, parent issue fetch/post, hidden key lookup, and child issue creation.
- MUST return failed and not advance intake `updatedAt` when required ledger save or parent request publish fails before a visible result.
- MUST leave a visible current-issue or dead-letter trail when a child ref exists but parent issue ref cannot be resolved.
- MUST NOT add worktree provisioning, observer writes, fixed ledger phases, GitHub lifecycle sync, cross-repo joins, or T6 round-table topology.

## Added Scenarios
### Scenario T4.5: all children passed triggers parent request
Given every current active phase ledger child issue has passed acceptance facts
When the last child pass is recorded
Then the parent issue receives one integration acceptance request with the target-level acceptance checklist

### Scenario T4.6: partial children do not trigger
Given at least one current active phase ledger child has no passed acceptance fact
When another child pass is recorded
Then no parent integration acceptance request is posted

### Scenario T4.7: parent request post failure does not advance
Given all children pass
And posting the parent integration acceptance request fails
When processing completes
Then the issue processing outcome is failed and the requested event is not recorded

### Scenario T4.8: acceptance failure with handoff mention is recorded first
Given a child or parent acceptance failure comment contains a legal handoff mention
When processing begins
Then the failed acceptance provenance is recorded before mention trigger handling can run

### Scenario T4.9: parent integration failure creates repair child
Given a parent integration acceptance comment fails one or more target-level statements
When the runner processes the comment
Then a repair child issue is created or recovered with failed statements as acceptance statements

### Scenario T4.10: bounded hidden key lookup failure
Given repair hidden key lookup never settles
When the lookup deadline is reached
Then processing exits visibly without creating duplicate repair issues

### Scenario T4.11: parent ref missing fails closed visibly
Given a ledger child ref is locatable but no parent issue ref is resolvable
When child pass processing reaches join
Then the current child issue receives a fail-closed explanation or the existing dead-letter path records it

### Scenario T4.12: scope boundaries remain unchanged
Given T4 is implemented
When tests inspect runner and ledger behavior
Then worktree provisioning, observer writes, fixed phase names, issue lifecycle sync, cross-repo join, and round-table topology are not introduced
