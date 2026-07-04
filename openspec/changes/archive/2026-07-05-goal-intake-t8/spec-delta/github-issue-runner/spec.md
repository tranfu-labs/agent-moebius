# github-issue-runner spec delta：goal-intake-t8

## 业务规则变更
- MUST support a new required CEO script `goal-intake` whose action is `goal_intake`.
- MUST keep `goal_intake` as a normal CEO ordinary-agent workflow with fail-closed side effects; it MUST NOT run through the stateless guardrail path.
- MUST let active external no-mention fallback routing append a single `@ceo` when the latest user message has an obvious goal shape such as “我想要做一个 X”.
- MUST extend no-mention fallback routing to issue body messages that are actually being processed, using a bounded synthetic route decision key such as `issue-body:<digest>`; runner MUST NOT store the full issue body in intake state.
- MUST keep no-mention target routing as a two-step process: publish the `@ceo` route append first, then let the next active poll trigger CEO through the normal mention trigger.
- MUST NOT let fallback routing directly write the ledger, create child issues, or run goal-intake in the same processing cycle.
- MUST treat target handoff append publication as the visibility boundary: if fallback routing decides `append` but publishing the CEO route comment fails or times out, runner MUST return `failed`, MUST NOT advance intake `updatedAt`, MUST NOT save the route as a successful append, and MUST leave the message eligible for retry / dead-letter handling.
- MUST keep issue-body and comment fallback route idempotence keys distinct: issue body decisions MUST use a bounded body digest key, while comment decisions MUST use the GitHub comment id.
- MUST let CEO ledger context prescript return an intake bootstrap context when the current issue has no active ledger owner and the ledger is otherwise loadable or empty.
- MUST restrict intake bootstrap context to `goal_intake`; CEO outputs that attempt `spawn_child_issues` or `roundtable` without visible task ids MUST still be rejected by TypeScript validation.
- MUST keep malformed ledger JSON, unsupported schema version, invalid ledger entities, and multiple active phases fail-closed before Codex execution.
- MUST parse CEO `goal_intake` output only when the output is valid JSON followed by a valid `in-progress` stage marker.
- MUST support `goal_intake.interview` as a visible CEO comment with no ledger writes and no child issue creation.
- MUST require `goal_intake.interview` to contain 2-4 concrete questions when questions are present, and MUST reject more than 4 interview questions.
- MUST support `goal_intake.propose` by validating the proposed goal bundle, writing pending ledger state, and publishing a pending proposal comment that contains a hidden goal-intake proposal key.
- MUST require `goal_intake.propose` to include 2-5 coarse milestones, exactly one phase-one proposal, 3-7 phase-one tasks, 1-3 acceptance statements per task, valid quality baseline, valid initial role per task, and bounded provenance.
- MUST return `failed` without saving the CEO role thread when a pending ledger proposal save succeeds but publishing the visible proposal comment fails or times out; retry MUST recover the existing pending proposal by proposal key and attempt to publish the proposal comment again.
- MUST require payment-product examples such as “支付宝” to be represented as demo/data-correct/production scope without claiming real funds handling, financial licenses, or clearing/settlement capability unless the user explicitly confirms those are in scope in a future task.
- MUST support `goal_intake.confirm` by validating the pending proposal key, marking ledger entries ready/active, and then reusing the existing CEO child issue spawn executor for phase-one task child issues.
- MUST require `goal_intake.confirm` spawn descriptors to exactly match the confirmed pending phase-one tasks by task id, quality baseline, acceptance statements, and dependencies.
- MUST derive child issue orchestration keys for goal-intake confirmation from parent issue source, workflow id, and ledger task id, and MUST NOT include free text.
- MUST make `goal_intake.confirm` idempotent: retrying after a role-thread save failure, ledger child-ref save failure, or fail-closed comment failure MUST not create duplicate child issues when hidden keys or ledger refs already exist.
- MUST recover a `goal_intake.confirm` retry when ledger already has phase one active but one or more task child refs are missing: runner MUST not create another active phase, MUST search by hidden orchestration key before creating any child issue, and MUST write missing child refs for uniquely recovered children.
- MUST fail closed with a visible CEO comment and without saving the CEO role thread when goal-intake JSON is invalid, a required script is missing, proposal key conflicts, ledger proposal save fails, confirmation validation fails, child issue lookup/create fails, or child-ref save fails.
- MUST include already-created or recovered child issue URLs in fail-closed details when later goal-intake confirmation work fails.
- MUST return `failed` when publishing the visible goal-intake fail-closed comment itself fails or times out; in that case intake MUST NOT advance `updatedAt`, and existing failureCount / retry / dead-letter behavior remains responsible for visibility.
- MUST keep all GitHub visible writes bounded by existing timeout behavior and no automatic retry rules for visible writes.
- MUST use `child_process.spawn(cmd, args[])` only through existing adapters; issue title/body/comment text MUST NOT be interpolated into shell commands.
- MUST document `switch_phase` as a future contract for post-phase-one integrated acceptance follow-up, but T8 MUST NOT add an automatic phase-switch pre-pass, observer UI operation, or T9/T10 dogfood runner.

## 场景

### 场景 T8.1：无 mention 目标兜底到 CEO
Given an issue body says “我想要做一个支付宝”
And it contains no legal agent mention
When runner processes that message
Then fallback routing may publish one CEO role comment containing exactly one legal `@ceo`
And the same processing cycle does not write the ledger or create child issues
And the route decision is keyed by a bounded issue-body digest, not by storing the issue body text

### 场景 T8.1a：comment 兜底按 comment id 去重
Given the latest external comment says “我想要做一个支付宝”
And it contains no legal agent mention
When runner processes that message
Then fallback routing may publish one CEO role comment containing exactly one legal `@ceo`
And the route decision is keyed by the GitHub comment id
And reprocessing the same comment id does not call fallback routing again

### 场景 T8.1b：目标 handoff 发布失败不得 no-trigger 吸收
Given fallback routing decided to append a `@ceo` route comment for a target-shaped no-mention message
And posting that route comment times out
When runner finishes the issue processing attempt
Then the outcome is `failed`
And intake `updatedAt` is not advanced
And no successful append route decision is recorded
And later retry or dead-letter handling can still leave a visible result

### 场景 T8.2：采访问题有界
Given CEO outputs `goal_intake.interview`
When the output contains 5 interview questions
Then parser rejects it
And runner publishes a fail-closed CEO explanation
And no ledger entry is saved

### 场景 T8.3：propose 写 pending 并发待确认提案
Given CEO outputs a valid `goal_intake.propose`
When runner executes it
Then runner saves a pending goal-intake ledger bundle
And runner publishes a visible proposal comment containing the hidden proposal key
And runner saves the CEO role thread only after ledger save and proposal comment succeed

### 场景 T8.3a：pending 已保存但提案评论失败可重试
Given CEO outputs a valid `goal_intake.propose`
And runner saves the pending ledger bundle
And publishing the visible proposal comment fails
When runner returns from the attempt
Then the outcome is `failed`
And the CEO role thread is not saved
When the same proposal is retried
Then runner recognizes the existing pending proposal by proposal key
And attempts to publish the proposal comment without creating duplicate ledger entities

### 场景 T8.4：confirm 后复用 spawn
Given the ledger contains a pending goal-intake proposal
And the user confirms that proposal
When CEO outputs a valid `goal_intake.confirm`
Then runner marks the goal and phase-one tasks ready
And runner activates phase one
And runner creates or recovers one same-repository child issue per phase-one task through the existing spawn executor
And each child body contains parent reference, ledger task id, quality baseline, acceptance statements, dependencies, initial handoff role, provenance, and hidden orchestration key

### 场景 T8.5：confirm 重试不重复创建 child
Given `goal_intake.confirm` created a child issue whose body contains a hidden orchestration key
And saving the CEO role thread failed
When the same confirmation is retried with changed CEO wording
Then runner recovers the existing child issue by key or ledger child ref
And does not call GitHub create issue for that task again

### 场景 T8.5a：active phase 已存在但 child ref 缺失时恢复
Given `goal_intake.confirm` already marked phase one active
And one child issue was created with the hidden orchestration key
And saving that task child ref timed out
When the same proposal confirmation is retried
Then phase one remains the single active phase with its original startedAt
And runner searches by hidden key before creating a child issue
And runner writes the missing child ref for the recovered child
And runner does not create a duplicate child issue

### 场景 T8.6：ledger proposal 保存失败 fail closed
Given CEO outputs a valid `goal_intake.propose`
And saving the goal ledger entry times out
When runner handles the failure
Then runner publishes a visible fail-closed CEO comment if possible
And runner does not save the CEO role thread
And intake does not advance unless that visible failure comment posts successfully

### 场景 T8.6a：fail-closed 评论发布失败保持 failed
Given goal-intake validation or side-effect execution fails before a successful visible comment
And publishing the visible fail-closed CEO explanation also times out
When runner finishes the issue processing attempt
Then the outcome is `failed`
And intake `updatedAt` is not advanced
And the existing failureCount / retry / dead-letter path remains available

### 场景 T8.7：支付宝文本不触发真实 dogfood
Given a unit or runner test uses the simulated issue text “我想要做一个支付宝”
When T8 tests execute
Then no real external GitHub issue is created
And fake adapters observe only bounded runner calls
And the proposal / child issue text explicitly states that the demo does not cover real funds, financial licenses, clearing, or settlement

### 场景 T8.8：issue 文本不进入 shell
Given an issue goal title contains shell metacharacters
When no-mention routing, goal-intake proposal, confirmation, and spawn rendering run
Then no code path passes issue text through `exec`, `execSync`, or `shell: true`
And any child process invocation uses controlled argv through existing adapters
