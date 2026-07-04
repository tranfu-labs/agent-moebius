# goal-ledger 规格

## 域定位
`goal-ledger` 负责把长期 GitHub issue 协作中的目标、里程碑、任务、阶段、质量基准、验收语句、依赖、provenance、父子 issue reference、run manifest reference 与阶段归档引用落成本地可信事实源。它解决“用户目标只能部分接收，后续澄清缺少可恢复账本”的问题，并为阶段切换后的当前上下文投影提供纯业务能力，避免跨阶段串扰和质量基准混淆。

本域不替代 GitHub 对话介质，不调度 agent，不创建 GitHub issue，不接 observer UI，也不把 run manifest 扩展成目标事实源。

## 业务规则
- MUST provide a first-class local goal ledger state for goals, milestones, tasks, phases, quality baselines, acceptance statements, dependencies, provenance, and parent/child issue references.
- MUST store goal ledger state under ignored local state path `.state/goal-ledger.json`.
- MUST keep goal ledger business rules in a pure module that does not call GitHub, Codex, shell commands, or the file system.
- MUST keep goal ledger file IO in a separate state adapter module.
- MUST treat the committed schema as versioned state with `schemaVersion = 1`.
- MUST load a missing `.state/goal-ledger.json` file as an empty ledger.
- MUST fail closed on malformed ledger JSON, unknown schema versions, invalid entity references, or invalid ready entities.
- MUST save `.state/goal-ledger.json` atomically by writing a temporary file and renaming it into place.
- MUST provide an entry-level merge helper that serializes writes for the same ledger file and prevents concurrent saves for different entries from clobbering each other.
- MUST provide a configurable deadline and AbortSignal wrapping entry for ledger state IO operations.
- MUST allow tests and future callers to inject ledger state IO implementations.
- MUST return deterministic timeout or aborted errors when a ledger state IO operation exceeds its configured deadline or receives an abort signal.
- MUST release the same-file entry merge lock after ledger state IO success, deterministic failure, timeout, or abort.
- MUST preserve the previous valid target ledger file when temporary file writing fails.
- MUST preserve the previous valid target ledger file when rename into place fails.
- MUST allow a goal to be partially admitted as `draft` or `pending` before all ready fields are known.
- MUST record missing fields and next clarification questions for partially admitted goals.
- MUST preserve provenance for goal intake facts, including the source issue reference and timeline location supplied by the caller.
- MUST require a goal or task marked `ready` to have scope, acceptance statements, dependencies, quality baseline, and provenance.
- MUST model quality baselines explicitly as one of `demo`, `data-correct`, or `production`.
- MUST model parent/child issue relationships as local references and intent/status only; the ledger MUST NOT create GitHub issues or synchronize GitHub issue state.
- MUST allow parent/child issue references to carry a bounded note for local provenance such as CEO orchestration keys; callers MUST keep that note bounded and MUST NOT store full issue bodies in it.
- MUST model phases as explicit ledger entries.
- MUST keep ledger phases separate from agent execution stage markers such as `plan-written`, `code-verified`, and `in-progress`.
- MUST NOT modify `src/stages.ts` or reuse execution stage marker semantics for ledger phase switching.
- MUST provide a pure phase switch helper that operates only on `GoalLedgerState` and does not call GitHub, Codex, shell commands, or the file system.
- MUST preserve the T1 phase owner model: phase owners are goals, milestones, or tasks; MUST NOT introduce a new owner kind for phase switching.
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
- MUST keep phase names free-form and MUST NOT introduce fixed workflow names, automatic phase flow, fan-out/join behavior, worktree provisioning, observer UI behavior, or CEO orchestration as part of phase switching.
- MUST relate tasks to run manifest records by reference, not by copying complete run manifest records.
- MUST require a run manifest reference to include a stable locator such as `.state/run-manifests.jsonl` line number or run directory; issue + role + completedAt alone MUST NOT be treated as a linked reference.
- MUST allow unresolved or missing run manifest references to be represented as ledger facts without parsing or repairing `.state/run-manifests.jsonl`.
- MUST NOT make run manifest the only source of truth for goals, milestones, tasks, phases, quality baselines, or parent/child issue relationships.
- MUST NOT store goal ledger state under `agents/`.
- MUST NOT execute or shell-interpolate issue body/comment content as part of goal ledger logic.
- MUST NOT integrate the ledger into runner heartbeat, mention trigger, observer UI, GitHub issue creation, worktree management, fan-out/join topology, or CEO orchestration as part of T1 phase and intake helpers; later callers such as bounded CEO orchestration may use the ledger through explicit state adapters without moving GitHub side effects into this domain.

## 场景
### 场景 T1.1：部分目标可先入账
Given a caller supplies a goal title and provenance but no acceptance statements, scope, dependencies, or quality baseline
When the goal intake helper records the input
Then the ledger contains a goal in `draft` or `pending` state
And the goal records missing fields for acceptance statements, scope, dependencies, and quality baseline
And the goal records next clarification questions

### 场景 T1.2：必要字段齐备后目标可转 ready
Given a draft goal has provenance
And the caller supplies scope, acceptance statements, dependencies, and quality baseline
When the ready gate is applied
Then the goal can be marked `ready`
And the ledger no longer reports those fields as missing

### 场景 T1.3：ready 缺字段被拒绝
Given a goal has no acceptance statements
When a caller attempts to mark it `ready`
Then the operation fails with a deterministic validation error
And the persisted ledger is not updated to an invalid ready state

### 场景 T1.4：父子 issue 关系只落本地引用
Given a task records a parent issue and child issue references
When the ledger is saved
Then the state file contains those references and relation intent/status
And no GitHub API or CLI operation is invoked

### 场景 T1.5：run manifest 用 locator 引用
Given a task records a run manifest reference with issue, role, completedAt, and `.state/run-manifests.jsonl` line number
When the ledger validates the task
Then the reference is accepted as linked
And the task does not copy the complete run manifest record

### 场景 T1.6：run manifest 碰撞风险不能伪装为 linked
Given a task records only issue, role, and completedAt for a run manifest
When the ledger validates the task
Then the reference is rejected as linked or represented as `unresolved`
And the ledger does not claim the run manifest reference is uniquely resolved

### 场景 T1.7：entry-level merge 不覆盖并发写入
Given two callers save different ledger entries through the entry-level merge helper
When their writes overlap in time
Then the final `.state/goal-ledger.json` contains both entries
And neither write replaces the whole file with a stale snapshot

### 场景 T1.8：writeFile 失败不破坏旧账本
Given `.state/goal-ledger.json` contains a valid existing ledger
And the ledger state IO implementation fails during temporary file write
When `saveGoalLedgerState` is called
Then the operation rejects with a deterministic error
And the target `.state/goal-ledger.json` still contains the previous valid ledger

### 场景 T1.9：rename 失败不破坏旧账本
Given `.state/goal-ledger.json` contains a valid existing ledger
And the ledger state IO implementation writes the temporary file but fails during rename
When `saveGoalLedgerState` is called
Then the operation rejects with a deterministic error
And the next `loadGoalLedgerState` returns the previous valid ledger

### 场景 T1.10：慢 IO 串行完成后不覆盖并发 entry
Given one `saveGoalLedgerEntry` call is paused by fake IO during write
When another `saveGoalLedgerEntry` call for a different entry starts
Then the second call waits for same-file serialization
And after both calls complete, the final ledger contains both entries

### 场景 T1.11：IO timeout 或 abort 后锁释放
Given a ledger state IO operation exceeds the configured deadline or receives an abort signal
When `saveGoalLedgerEntry` rejects with timeout or aborted error
Then a later `saveGoalLedgerEntry` call for the same file can run
And it is not permanently blocked by the failed operation

### 场景 T2.1：阶段切换归档旧阶段并启动新阶段
Given a task owner has one active phase and one pending target phase
When the phase switch helper switches to the target phase with an archive summary and typed artifact references
Then the previous active phase is marked `completed`
And the previous phase records `completedAt`, archive summary, archive timestamp, and artifact references
And the target phase is marked `active`
And the target phase records `startedAt`

### 场景 T2.2：缺归档输入不得静默完成旧阶段
Given a task owner has one active phase and one pending target phase
When the phase switch helper switches to the target phase without archive summary or without an explicit artifact reference array
Then the operation fails with a deterministic validation error
And the previous active phase remains active
And the target phase remains pending

### 场景 T2.3：显式无产物归档允许空 references
Given a task owner has one active phase and one pending target phase
When the phase switch helper switches to the target phase with an archive summary and an empty artifact reference array
Then the previous active phase is marked `completed`
And the previous phase records the archive summary and an empty artifact reference array
And the target phase is marked `active`

### 场景 T2.4：重复切到当前 active 是幂等 no-op
Given a task owner has exactly one active phase
When the phase switch helper is called with that same active phase as target
Then the returned state is unchanged
And the active phase keeps its original `startedAt`
And no completed timestamp or archive fields are added by the repeated call

### 场景 T2.5：首次启动阶段必须显式指定 target
Given an owner has no active phase
When the phase switch helper is called with an explicit pending target phase id
Then the target phase is marked `active`
And no previous phase is inferred or completed

### 场景 T2.6：target 缺当前阶段必需字段时 switch fail closed
Given an owner has no active phase
And the target phase is missing objective, acceptance statements, or dependencies
When the phase switch helper is called with that target phase id
Then the operation fails with a deterministic validation error
And the target phase remains pending

### 场景 T2.7：多个 active phase fail closed
Given an owner has two active phases
When goal ledger state is asserted, phase switch runs, or active phase context projection runs
Then the operation fails with a deterministic validation error

### 场景 T2.8：无 active phase 不 fallback
Given an owner has phases but none is active
When active phase context projection runs
Then the result is an explicit no-active / missing-active result
And it does not return goal, milestone, or task global scope as a substitute

### 场景 T2.9：当前上下文只呈现当前阶段
Given a completed previous phase has archived artifact references
And the same owner has an active current phase with objective, acceptance statements, dependencies, and quality baseline
When active phase context projection runs
Then the current context contains the current phase objective, phase quality baseline, acceptance statements, dependencies, phase identity, and owner identity
And it does not contain the previous phase artifact references or archive summary in the current context body

### 场景 T2.10：阶段质量基准优先
Given an owner quality baseline is `production`
And the active phase quality baseline is `data-correct`
When active phase context projection runs
Then the projected quality baseline is `data-correct`
And the projection does not merge or override it with the owner baseline

### 场景 T2.11：归档引用可单独回查
Given a completed phase has an archive summary and typed artifact references
When archived phase lookup runs for the owner
Then it returns the completed phase archive summary and typed references
And this lookup is separate from active phase current context projection

### 场景 T2.12：旧 T1 phase 兼容加载但不可隐式投影
Given a T1 phase record lacks objective, acceptance statements, dependencies, or archive fields
When the ledger parses that state
Then parsing succeeds
But active phase context projection or phase switch fails closed if that phase is the current target without required current-stage fields

### 场景 T2.13：不同 owner 的 active phase 互不冲突
Given a goal owner has one active phase
And a task owner has one active phase
When goal ledger state is asserted
Then the state is valid
But two active phases for the same owner are rejected

### 场景 T2.14：typed artifact reference 拒绝不安全 payload
Given a phase artifact reference has a bounded summary and safe locator
When the ledger validates the phase
Then the reference is accepted
But empty locators, workspace-escaping paths, full run manifest bodies, or full comment bodies in the generic fallback are rejected

## T3 CEO orchestration ledger writes
- MUST allow a bounded CEO orchestration caller to append child issue references to task entries after the corresponding GitHub child issue has been created or uniquely recovered by the runner.
- MUST keep T3 ledger writes limited to child issue reference, intent/status, bounded note, and provenance fields; T3 MUST NOT synchronize GitHub issue lifecycle state back into the ledger.
- MUST keep goal-ledger pure business helpers free of GitHub, Codex, shell, and file-system calls; runner and state adapter remain responsible for side effects and persistence.
- MUST let CEO ledger context projection reuse active phase projection semantics: current context contains only current phase objective, quality baseline, acceptance statements, dependencies, phase identity, and owner identity.
- MUST fail closed when a CEO orchestration caller attempts to write a child issue reference for a missing task, an invalid task, or a task outside the current projection scope.
- MUST allow a child issue reference recorded by CEO orchestration to carry a bounded orchestration key for idempotent retry detection.
- MUST keep the orchestration key stable across CEO retry wording changes by deriving it outside title, description, or other free-text fields.
- MUST let callers detect an existing child issue reference by orchestration key without calling GitHub.

### 场景 T3.GL1：CEO orchestration 追加 task child issue reference
Given a task exists in the ledger
And runner has created or uniquely recovered a child GitHub issue for that task
When the bounded CEO orchestration helper appends the child issue reference
Then the task records the child issue reference with relation `child` and status `open`
And the task records provenance for the parent issue and CEO orchestration run

### 场景 T3.GL2：CEO orchestration 不同步 GitHub 状态
Given a task has a child issue reference recorded by CEO orchestration
When the GitHub child issue is later closed or edited
Then goal-ledger does not automatically change that reference status
And no GitHub adapter is called from goal-ledger business logic

### 场景 T3.GL3：越界 task id 写入被拒绝
Given current CEO projection contains task `task-a`
And CEO orchestration output attempts to write child refs for `task-b`
When runner validates the ledger write
Then the write fails closed
And the ledger is not updated for `task-b`

### 场景 T3.GL4：按 orchestration key 检测已创建 child
Given a task has a child issue reference with orchestration key `key-1`
When CEO orchestration retry checks the task for `key-1`
Then the existing child issue reference is returned
And no GitHub adapter is called by goal-ledger business logic

## T4 integration acceptance ledger facts
- MUST allow a task to record bounded child acceptance facts with reviewer role, per-statement pass/fail results, source issue/comment identity, timestamp, and note.
- MUST upsert child acceptance facts by a stable source/fact key so replaying the same acceptance comment does not change the semantic child pass digest.
- MUST evaluate integration acceptance join from the current active phase projection only.
- MUST enumerate only ledger child refs visible to the current active phase owner.
- MUST return waiting until every in-scope child ref has a latest passed acceptance fact.
- MUST fail closed for no active phase, missing target-level acceptance statements, missing child refs, multiple active phases, or cross-repository child refs.
- MUST derive the target-level acceptance digest from active phase acceptance statements only.
- MUST record bounded integration acceptance events on the phase with requested/passed/failed/blocked status and provenance.
- MUST NOT call GitHub, Codex, shell, file system, observer, worktree, or issue lifecycle APIs from goal-ledger logic.

### 场景 T4.GL1：child acceptance fact replay is stable
Given a task child issue has a formal acceptance pass comment
When the same comment is recorded twice
Then the task has one acceptance fact for that source key
And the join digest does not change on replay

### 场景 T4.GL2：join waits for all in-scope children
Given a current active phase owner has two ledger child refs
And only one child has a latest passed acceptance fact
When integration join evaluation runs
Then the result is waiting and lists the missing child

### 场景 T4.GL3：join ready uses active phase acceptance
Given every visible child ref has a latest passed acceptance fact
When integration join evaluation runs
Then the result is ready with child pass digest, target acceptance digest, and hidden integration key

### 场景 T4.GL4：integration events are idempotent
Given a phase has an integration acceptance requested event
When the same join key and status are recorded again
Then the event is upserted rather than duplicated
