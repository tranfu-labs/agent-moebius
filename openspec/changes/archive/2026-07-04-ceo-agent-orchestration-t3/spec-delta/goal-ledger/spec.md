# goal-ledger spec delta：ceo-agent-orchestration-t3

## 业务规则变更
- MUST allow a bounded CEO orchestration caller to append child issue references to task entries after the corresponding GitHub child issue has been created by the runner.
- MUST keep T3 ledger writes limited to child issue reference, intent/status, and provenance fields; T3 MUST NOT synchronize GitHub issue lifecycle state back into the ledger.
- MUST keep goal-ledger pure business helpers free of GitHub, Codex, shell, and file-system calls; runner and state adapter remain responsible for side effects and persistence.
- MUST let CEO ledger context projection reuse active phase projection semantics: current context contains only current phase objective, quality baseline, acceptance statements, dependencies, phase identity, and owner identity.
- MUST fail closed when a CEO orchestration caller attempts to write a child issue reference for a missing task, an invalid task, or a task outside the current projection scope.
- MUST allow a child issue reference recorded by CEO orchestration to carry a bounded orchestration key for idempotent retry detection.
- MUST keep the orchestration key stable across CEO retry wording changes by deriving it outside title, description, or other free-text fields.
- MUST let callers detect an existing child issue reference by orchestration key without calling GitHub.

## 场景
### 场景 T3.GL1：CEO orchestration 追加 task child issue reference
Given a task exists in the ledger
And runner has created a child GitHub issue for that task
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
