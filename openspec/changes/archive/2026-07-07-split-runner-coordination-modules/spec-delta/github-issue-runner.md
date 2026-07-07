# github-issue-runner spec delta

## 新增

- MUST keep `src/runner.ts` as the heartbeat and issue-processing composition entry while allowing high-cohesion runner submodules under `src/runner/` for side-effect coordination.
- MUST keep runner submodules business-named by capability, not generic `utils` / `helpers` buckets.
- MUST NOT let runner submodules become new pure-business fact sources: acceptance semantics remain in `goal-ledger.ts`, orchestration output parsing remains in `ceo-orchestration.ts`, mention parsing remains in `conversation.ts`, and route judgement remains in `agents/ceo.md` / `format-ceo.ts`.
- MUST let runner submodules receive explicit injected dependencies for GitHub, Codex, ledger state, artifact publishing, and logging; they MUST NOT shell out directly or construct shell commands from issue content.
- MUST NOT introduce a dependency from pure modules (`goal-ledger`, `conversation`, `github-response-intake`, `driver-pool`, trigger modules, observer modules) back into `src/runner/` submodules.
- MUST keep acceptance pre-pass execution before mention trigger resolution. If it returns a handled outcome, runner MUST NOT proceed to normal trigger processing.
- MUST keep roundtable no-handoff recovery before normal mention trigger processing and preserve its route-key dedupe behavior.
- MUST keep external no-mention fallback route only on the normal trigger skip path; append route comments MUST still be processed by a later active poll rather than running the mentioned target in the same cycle.
- MUST keep Codex execution reaction best-effort and immediately before the real Codex driver path after workspace / preScript / prompt plan / media preparation succeeded.
- MUST keep runner submodule calls bounded by existing timeout / watchdog contracts when they wait for GitHub, Codex, ledger state, formatter, artifact publishing, reaction, or comment publish dependencies; a single never-resolving dependency MUST NOT keep an issue permanently in-flight.
- MUST keep the S1 visible-result boundary after runner coordination code is split: before the first visible GitHub comment is published, failures in acceptance pre-pass, external route append, ledger writes, repair child create / lookup, artifact publishing, or guardrail formatting MUST NOT advance role-thread state or the processed intake cursor as if the user instruction had been handled.
- MUST keep V1 failure visibility after runner coordination code is split: blocked reports, acceptance format reminders, route append failures, repair child failures, and dead-letter-like visible failure paths MUST either leave a visible GitHub trace or return a failed/retryable outcome; publishing that visible trace failing MUST NOT be silently converted into success.
- MUST NOT record successful external route decisions, acceptance facts, integration repair references, or roundtable recovery records when the corresponding visible comment or persistent ledger write failed.

## 修改

- The existing `github-issue-runner` implementation MAY split runner coordination code into `src/runner/acceptance-prepass.ts`, `src/runner/external-route.ts`, `src/runner/codex-execution-reaction.ts`, and narrowly scoped runtime contract modules, provided the observable runner behavior remains unchanged.
- The module map MUST describe runner submodules as part of the GitHub issue runner side-effect boundary, not as new independent domains.

## 场景

### 场景 R1：acceptance pre-pass 仍先于 mention trigger

Given 最新 comment 来自验收角色
And 该 issue 能唯一匹配 ledger child task
When runner 处理该 issue
Then runner 先执行 acceptance pre-pass 并尝试写入验收 fact
And 若 pre-pass 返回 `triggered-success` 或 `no-trigger`
Then runner 不执行 mention trigger、不调用 Codex

### 场景 R2：external no-mention route 仍只在 trigger skip 后执行

Given 最新外部 user comment 没有合法 agent mention
And issue state 是 active
When mention trigger 返回 skip
Then runner 调用 external no-mention route
And route append 发布成功后本轮返回 `triggered-success`
And runner 不在同一轮直接运行 append 正文中的目标 agent

### 场景 R3：Codex reaction 时机不变

Given 最新消息包含合法 agent mention
And workspace / preScript / prompt plan / media preparation 全部成功
When runner 即将调用 Codex driver
Then runner 对本轮触发源添加一次 `eyes` reaction
And reaction 添加失败只记录 failure 日志，不阻断 Codex driver

### 场景 R4：runner 子模块不反向污染纯模块

Given 新增了 `src/runner/acceptance-prepass.ts`
When TypeScript dependency graph is inspected
Then `src/goal-ledger.ts`, `src/conversation.ts`, `src/github-response-intake.ts`, `src/driver-pool.ts`, `src/triggers/*`, and `src/observer/*` do not import any `src/runner/*` module
And runner submodules use injected dependencies instead of direct shell execution

### 场景 R5：acceptance pre-pass ledger write 永不返回时仍有界 settle

Given 最新 comment 来自验收角色
And acceptance pre-pass attempts to write a child task acceptance fact
And the injected ledger write dependency never resolves
When runner processes the issue
Then the operation settles within the existing orchestration timeout or watchdog budget
And the issue job is not permanently in-flight
And the processed intake cursor is not advanced as successfully handled

### 场景 R6：external route append 发布失败时可重试

Given 最新 active user comment has no valid agent mention
And external route formatter returns an append decision for that comment
And posting the route append comment fails before a visible result exists
When runner processes the issue
Then the processing result is failed or retryable
And no successful route decision is recorded for that comment id
And a later active poll can retry the same comment id

### 场景 R7：repair child create / lookup 失败不得保存虚假引用

Given parent integration acceptance failed
And runner attempts to create or recover a repair child issue
And the injected create / lookup dependency fails
When runner handles the repair path
Then no repair child reference is written to the ledger for an issue that was not created or uniquely recovered
And any failure comment publish failure keeps the processing failed or retryable
