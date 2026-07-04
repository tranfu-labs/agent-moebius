# goal-ledger spec delta：goal-ledger-t1

## 新增行为规则
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
- MUST model phases as explicit ledger entries but MUST NOT perform phase switching, phase artifact archival, or context filtering in T1.
- MUST relate tasks to run manifest records by reference, not by copying complete run manifest records.
- MUST require a run manifest reference to include a stable locator such as `.state/run-manifests.jsonl` line number or run directory; issue + role + completedAt alone MUST NOT be treated as a linked reference.
- MUST allow unresolved or missing run manifest references to be represented as ledger facts without parsing or repairing `.state/run-manifests.jsonl`.
- MUST NOT make run manifest the only source of truth for goals, milestones, tasks, phases, quality baselines, or parent/child issue relationships.
- MUST NOT store goal ledger state under `agents/`.
- MUST NOT execute or shell-interpolate issue body/comment content as part of goal ledger logic.
- MUST NOT integrate the ledger into runner heartbeat, mention trigger, observer UI, GitHub issue creation, worktree management, fan-out/join topology, or CEO orchestration in T1.

## 新增场景
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
