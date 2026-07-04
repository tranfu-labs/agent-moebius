# goal-ledger spec delta：goal-intake-t8

## 业务规则变更
- MUST support a bounded goal-intake proposal write path for runner-controlled CEO `goal_intake.propose` outputs.
- MUST keep goal-intake ledger construction in pure helpers; goal-ledger MUST NOT call GitHub, Codex, shell commands, or the file system.
- MUST derive a stable goal-intake proposal key from parent issue source and CEO supplied proposal id; the key MUST NOT include title, description, assumptions, or other free text.
- MUST allow `goal_intake.propose` to write a pending bundle containing one goal, 2-5 coarse milestones, one phase-one pending phase, and 3-7 phase-one pending tasks.
- MUST require each phase-one pending task to carry 1-3 acceptance statements before it can be confirmed.
- MUST keep the proposed goal and tasks in `pending` status before user confirmation; pending tasks MUST NOT be treated as current active phase work.
- MUST keep phase one in `pending` status before user confirmation; active phase context projection MUST NOT expose it until confirmation activates it.
- MUST record source issue refs and bounded provenance for goal-intake proposal writes, including source issue, message index, optional comment id, captured timestamp, and bounded proposal key note.
- MUST NOT store full issue body/comment text in goal-intake ledger provenance or issue reference notes.
- MUST treat a repeated `goal_intake.propose` with the same proposal key and same structured content as idempotent.
- MUST fail closed and leave state unchanged when a repeated `goal_intake.propose` uses the same proposal key with conflicting goal, milestone, phase, task, quality baseline, dependency, or acceptance statement content.
- MUST support `goal_intake.confirm` as an explicit transition that marks the proposed goal and phase-one tasks `ready`, clears missing fields, and activates phase one through the existing phase switch semantics.
- MUST make repeated confirmation of the same already-active phase deterministic and idempotent.
- MUST keep repeated confirmation idempotent even when downstream GitHub spawn side effects are incomplete; a second confirmation MUST NOT create another active phase for the same owner.
- MUST fail closed when confirmation references a missing proposal key, a non-pending proposal, an incomplete task, an invalid quality baseline, or a phase missing current context fields.
- MUST keep child issue creation outside goal-ledger; confirmation prepares ready/active ledger state only, while runner / GitHub adapter remain responsible for spawn side effects and child refs.
- MUST allow existing T3 child-ref write rules to record child issue references for tasks created by goal-intake confirmation.

## 场景

### 场景 T8.GL1：propose 写 pending bundle
Given CEO `goal_intake.propose` contains one goal, 2 coarse milestones, one phase-one phase, and 3 phase-one tasks
When the pure goal-intake proposal helper applies it
Then the ledger contains the goal in `pending` status
And the phase-one tasks are in `pending` status
And the phase-one phase is in `pending` status
And no active phase projection exposes those tasks yet

### 场景 T8.GL2：proposal key 幂等
Given the ledger already contains a pending goal-intake proposal with key `k1`
When the same structured proposal is applied again with key `k1`
Then the returned state is unchanged except for bounded provenance append where applicable
And no duplicate goal, milestone, task, or phase is created

### 场景 T8.GL3：proposal key 冲突 fail closed
Given the ledger already contains a pending goal-intake proposal with key `k1`
When a different structured proposal is applied with key `k1`
Then the operation fails with a deterministic validation error
And the ledger state is unchanged

### 场景 T8.GL4：confirm 激活阶段一
Given the ledger contains a complete pending goal-intake proposal
When `goal_intake.confirm` is applied for that proposal key
Then the goal is marked `ready`
And all phase-one tasks are marked `ready`
And phase one is marked `active`
And active phase projection returns phase one objective, quality baseline, acceptance statements, dependencies, and owner identity

### 场景 T8.GL5：重复 confirm no-op
Given `goal_intake.confirm` already activated phase one for proposal key `k1`
When the same confirmation is applied again
Then phase one remains the only active phase
And its original `startedAt` is preserved
And no duplicate task or phase is created

### 场景 T8.GL5a：child ref 不完整不影响 confirm 幂等
Given `goal_intake.confirm` already activated phase one for proposal key `k1`
And downstream spawn did not finish writing all task child refs
When the same confirmation is applied again
Then phase one remains the only active phase
And no duplicate phase is created
And missing child refs remain the runner spawn executor's responsibility

### 场景 T8.GL6：goal-ledger 不执行外部输入
Given a goal title contains shell metacharacters from an issue comment
When goal-intake proposal or confirmation helpers validate and write the ledger
Then no shell, GitHub, Codex, or file-system operation is invoked by goal-ledger
And the title is stored only as ledger data after shape validation
