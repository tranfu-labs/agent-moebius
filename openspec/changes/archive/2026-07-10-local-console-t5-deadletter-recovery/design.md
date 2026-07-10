# 设计：local-console-t5-deadletter-recovery

## 方案

### 1. 失败预算模型
在 local message 维度维护处理失败预算，默认预算沿用 GitHub intake 语义为 5 次。计数对象是“同一 session 的同一 source message id”，不按 run id 或 role 重新开始。

需要纳入预算的失败：

- Codex 非 timeout / 非用户中断失败，例如 non-zero exit、spawn error。
- local route judgment / route append / visible write 失败后同一消息反复 retry。
- workspace resolve、worktree diff generation、store write failure 等导致本轮没有成功 visible result 的 runtime failure。
- `recordAgentResponse` 在提交前失败，尤其是事务前或 worker timeout。

不纳入普通 dead-letter 的分流：

- 用户主动 interrupt：继续写 interrupted visible system record，不算失败预算。
- Codex idle timeout / max-duration timeout / stale running repair：继续写 stuck visible system record，但也要释放 session 位点，避免永久 running。
- 明确 no-trigger/no-action 且已成功写 visible result：按 processed 完成，不进入预算。

实现上新增 runtime helper，例如 `recordRetryableFailureOrDeadLetter()`：

1. 从 store 读取 source message 当前 failure metadata。
2. 若 `failureCount + 1 < LOCAL_CONSOLE_FAILURE_RETRY_LIMIT`，在事务中把 source message 从 `running` 释放回 `pending`，更新 failure metadata 与 last reason。
3. 若达到上限，在同一事务中写 visible dead-letter system message、写 `local_dead_letters` fact、把 source message 标记为 `failed` 或 `completed/dead-lettered` 等最终态，并推进 cursor。
4. 若第 3 步 visible dead-letter 写入失败，整个事务回滚；source message 保持 retryable/running 可被 stale repair 释放，不保存 successful dead-letter outcome。

### 2. SQLite 与 store 边界
当前 `local_dead_letters` 表已存在，但 runtime 还没有把失败预算与 visible system record 绑定。实现阶段新增或复用下列 store command：

- `local-record-retryable-failure`：原子更新 source message failure count / last reason，并释放为 retryable。
- `local-record-dead-letter-and-complete`：原子写 visible system message、`local_dead_letters`、route decision dead_letter（如适用）与 cursor complete。
- `local-get-message-processing-state` 或在 claim/list 返回中包含 failure metadata：供 runtime 判断预算。

如需要 schema migration，优先在 `session_messages` 增加 `failure_count INTEGER NOT NULL DEFAULT 0` 与 `last_failure_reason TEXT`。如果实现者选择独立 table，也必须以 `(session_id, source_message_id)` 唯一约束保证幂等。

visible dead-letter message 文案必须满足：

- `speaker = system`。
- `status = displayed`。
- body 不含合法 agent mention，避免自触发。
- 包含 source message id、failure count、reason、可恢复提示。
- run id / runDir 尽可能保留最近一次失败证据。

### 3. Runtime 接入点
`LocalConsoleRuntime.processPending()` 保持 session 内串行。接入点如下：

- route bus 返回 `retry` 或抛错：不再无限 release；改走失败预算 helper。
- selected agent missing、workspace resolve failure、Codex non-timeout failure、workspace diff failure、recordAgentResponse failure：走失败预算 helper。
- route append visible write failure 与 recordAgentResponse 提交前失败仍不得保存成功 route/agent response；失败预算只记录失败原因和 retry/dead-letter。
- `recordFailedCodexResult()` 中 timeout 分流保持 stuck；interrupted 保持 interrupted；其它 failure 改为预算路径。

处理成功后清理或忽略该 message 的 failure metadata，保证后续新 message 从 0 开始。

### 4. 重启 catch-up 与 stale recovery
`init()` 已对所有 session 执行 `repairStaleRunning()`，再由 server startup catch-up 处理 pending。实现阶段补齐两个幂等边界：

- 对 stale running：`markStaleRunning()` 必须只处理仍处于 running 且 older than cutoff 的 source message；已成功写入 agent response 的 source message 不应再次变回 pending。
- 对 handoff catch-up：如果上一棒 agent response 已落库、cursor 已推进到该 message，重启后只从该 agent response 产生的下一条 pending/trigger 继续，不重复写上一棒 response。
- 对 stuck 后新消息：stuck source message 不再阻挡 `submitUserMessage()`；同 session 新消息可继续 process。

### 5. 验收脚本升级
`scripts/acceptance/local-console-t5.ts` 现有 `dead-letter-recovery` 只是直接调用 `recordLocalDeadLetter()`，不足以证明 runtime 行为。实现阶段改为真实启动 fake local console server：

- fake Codex 对 `@dev bad` 连续返回同一 non-timeout failure，直到预算耗尽。
- 等待 timeline 出现一条 visible dead-letter system record，并读取 `listLocalT5Facts()` 验证只有一条 dead-letter fact。
- 再次调用 `processPending()` 或等待轮询，验证 dead-letter 不重复。
- 追加 `@dev recovery`，fake Codex 返回 success，验证新消息可处理。

新增 `restart-stuck-recovery` case：

- 构造 SQLite fixture：一条已完成 agent response 后还有下一棒待处理，或一条 stale running message。
- 关闭旧 store，重启 `startLocalConsoleServer()`。
- 验证已完成 response 数量不增加，stale/running 被 stuck 或 retry/recovery 释放，下一棒或新消息能继续处理。

## 权衡

- 选择 message-level failure budget，而不是 run-level budget：run id 每次 retry 都会变化，无法阻止同一坏消息刷屏；message id 才是稳定的用户意图边界。
- 选择 visible dead-letter + fact 同事务，而不是先写 fact 再补可见消息：用户可见性是验收目标，fact 先成功会制造“系统认为已死信、用户看不到”的不可恢复状态。
- timeout/stale 保持 stuck 而不是 dead-letter：T4 已把 stuck 作为独立可见状态，timeout 代表运行卡住，不等同于语义失败；本任务只要求释放/恢复位点和避免重复。
- recordAgentResponse 失败达到预算后可以 dead-letter：虽然失败点在“Codex 已产出结果后”，如果响应无法持久化，继续无限重跑会重复执行 agent；预算收敛比静默丢结果更可验收。

## 风险

- 如果 store write 故障持续存在，dead-letter visible write 也可能一直失败。缓解：不推进 cursor、不保存 success outcome，保留 retryable 状态和日志；恢复 SQLite 后下一轮可重新写。
- failure metadata schema 迁移需要兼容旧 SQLite。缓解：新增 nullable/default 字段或独立 table，migration 保持幂等，补充旧 fixture 测试。
- 将更多失败从 immediate failed 改为 retry/dead-letter 可能影响现有 T4 测试。缓解：保留 interrupted/stuck 的现有行为；对普通 failure 更新测试期望为“预算内 retry，预算耗尽 visible dead-letter”。
- startup catch-up 幂等依赖 cursor 与 message status 一致。缓解：单元测试覆盖“agent response 已提交但下一棒未 claim”和“stale running source”两类 fixture。
