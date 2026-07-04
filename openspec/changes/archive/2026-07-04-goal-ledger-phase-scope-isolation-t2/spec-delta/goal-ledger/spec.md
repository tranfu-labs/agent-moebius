# goal-ledger spec delta

## 修改

- `PhaseRecord` MAY include current phase work-scope fields: a non-empty objective, acceptance statements, dependencies, typed artifact references, archive summary, and archive timestamp.
- Goal ledger state MUST keep ledger phases separate from agent execution stage markers such as `plan-written`, `code-verified`, and `in-progress`.
- Goal ledger behavior MUST NOT modify `src/stages.ts` or reuse execution stage marker semantics for ledger phase switching.

## 新增

- MUST provide a pure phase switch helper that operates only on `GoalLedgerState` and does not call GitHub, Codex, shell commands, or the file system.
- MUST preserve the T1 phase owner model: phase owners are goals, milestones, or tasks; T2 MUST NOT introduce a new owner kind.
- MUST enforce at most one active phase for the same owner.
- MUST fail closed when a phase switch, projection, or state assertion observes more than one active phase for the same owner.
- MUST fail closed when a phase switch would start or keep active a target phase that is missing objective, acceptance statements, dependencies, or quality baseline.
- MUST allow a first phase to start when the owner currently has no active phase only if the caller explicitly supplies the target phase id.
- MUST make switching to a target phase that is already the owner's only active phase a deterministic no-op that preserves `startedAt` and does not complete or archive the phase again.
- MUST complete the previous active phase during a normal switch by writing `completedAt`, setting status to `completed`, and preserving archived summary and typed artifact references in the ledger.
- MUST require a non-empty archive summary and an explicit artifact reference array when completing a previous active phase during a switch.
- MUST allow an empty artifact reference array only as an explicit "no artifacts" archive record.
- MUST fail closed and leave state unchanged when completing a previous active phase without archive summary or without an explicit artifact reference array.
- MUST start the target phase during a normal switch by writing `startedAt` and setting status to `active`.
- MUST represent archived artifacts as summary plus typed references, not as copied full run manifest records, copied issue comments, moved worktree files, or published release artifacts.
- MUST support typed artifact references for run manifest locators, acceptance evidence paths, issue comments, repository paths, and a bounded generic fallback.
- MUST provide a pure active phase context projection helper.
- MUST make active phase context projection return only current phase objective, phase quality baseline, acceptance statements, dependencies, phase identity, and owner identity.
- MUST make active phase context projection use `PhaseRecord.qualityBaseline` as the quality baseline and MUST NOT silently merge it with goal, milestone, or task quality baselines.
- MUST make active phase context projection fail closed when the active phase is missing objective, acceptance statements, dependencies, or quality baseline.
- MUST make active phase context projection return an explicit no-active / missing-active result when the owner has no active phase; it MUST NOT fallback to global goal, milestone, or task context.
- MUST keep previous phase artifact bodies out of the current context projection.
- MUST provide an explicit archived phase lookup path that can return completed phase archive summaries and typed references separately from current context.
- MUST keep phase names free-form and MUST NOT introduce fixed workflow names, automatic phase flow, fan-out/join behavior, worktree provisioning, observer UI behavior, or CEO orchestration as part of T2.

## 场景新增

### 场景 T2.1：阶段切换归档旧阶段并启动新阶段
Given a task owner has one active phase and one pending target phase
When the phase switch helper switches to the target phase with an archive summary and typed artifact references
Then the previous active phase is marked `completed`
And the previous phase records `completedAt`, archive summary, archive timestamp, and artifact references
And the target phase is marked `active`
And the target phase records `startedAt`

### 场景 T2.1b：缺归档输入不得静默完成旧阶段
Given a task owner has one active phase and one pending target phase
When the phase switch helper switches to the target phase without archive summary or without an explicit artifact reference array
Then the operation fails with a deterministic validation error
And the previous active phase remains active
And the target phase remains pending

### 场景 T2.1c：显式无产物归档允许空 references
Given a task owner has one active phase and one pending target phase
When the phase switch helper switches to the target phase with an archive summary and an empty artifact reference array
Then the previous active phase is marked `completed`
And the previous phase records the archive summary and an empty artifact reference array
And the target phase is marked `active`

### 场景 T2.1d：重复切到当前 active 是幂等 no-op
Given a task owner has exactly one active phase
When the phase switch helper is called with that same active phase as target
Then the returned state is unchanged
And the active phase keeps its original `startedAt`
And no completed timestamp or archive fields are added by the repeated call

### 场景 T2.2：首次启动阶段必须显式指定 target
Given an owner has no active phase
When the phase switch helper is called with an explicit pending target phase id
Then the target phase is marked `active`
And no previous phase is inferred or completed

### 场景 T2.2b：target 缺当前阶段必需字段时 switch fail closed
Given an owner has no active phase
And the target phase is missing objective, acceptance statements, or dependencies
When the phase switch helper is called with that target phase id
Then the operation fails with a deterministic validation error
And the target phase remains pending

### 场景 T2.3：多个 active phase fail closed
Given an owner has two active phases
When goal ledger state is asserted, phase switch runs, or active phase context projection runs
Then the operation fails with a deterministic validation error

### 场景 T2.4：无 active phase 不 fallback
Given an owner has phases but none is active
When active phase context projection runs
Then the result is an explicit no-active / missing-active result
And it does not return goal, milestone, or task global scope as a substitute

### 场景 T2.5：当前上下文只呈现当前阶段
Given a completed previous phase has archived artifact references
And the same owner has an active current phase with objective, acceptance statements, dependencies, and quality baseline
When active phase context projection runs
Then the current context contains the current phase objective, phase quality baseline, acceptance statements, dependencies, phase identity, and owner identity
And it does not contain the previous phase artifact references or archive summary in the current context body

### 场景 T2.6：阶段质量基准优先
Given an owner quality baseline is `production`
And the active phase quality baseline is `data-correct`
When active phase context projection runs
Then the projected quality baseline is `data-correct`
And the projection does not merge or override it with the owner baseline

### 场景 T2.7：归档引用可单独回查
Given a completed phase has an archive summary and typed artifact references
When archived phase lookup runs for the owner
Then it returns the completed phase archive summary and typed references
And this lookup is separate from active phase current context projection
