# local-console 规格增量

## MODIFIED Requirement: 孤儿运行在重启后被确定性识别为卡住

系统 MUST 在启动 catch-up 时，把 SQLite 标记为 running、当前进程没有 activeRun、且没有未消费 `graceful-shutdown` 恢复意图的运行落成 stuck。若同一 run 存在已持久化且未消费的正常退出恢复意图，系统 MUST 将源消息释放为 pending 并自动继续，不得先写 stuck。没有恢复意图的崩溃、强杀或断电孤儿 MUST NOT 自动重跑。

### Scenario: 正常退出孤儿自动恢复
- GIVEN 活动 run 已建立 thread link，退出前已持久化 graceful resume intent
- WHEN 新进程执行启动 catch-up
- THEN 原源消息恢复为 pending 并自动进入同一次执行恢复
- AND 时间线不追加 orphan stuck 或 user-stopped

### Scenario: 强杀孤儿仍然卡住
- GIVEN 上一进程留下一条 running 消息但没有 graceful resume intent
- WHEN 新进程执行启动 catch-up
- THEN 该消息确定性落成 stuck 并等待用户点击重试

## MODIFIED Requirement: 每个 Agent run 持久化到 Codex thread 的稳定关联

系统 MUST 在 thread link 中额外持久化恢复上下文指纹。旧事实缺少指纹时 MUST 可读，但 MUST NOT 直接 resume。相同 run 的 link 重放必须连同指纹幂等，冲突必须 fail closed。

### Scenario: 旧 thread link 没有上下文指纹
- GIVEN session JSONL 中存在旧版合法 thread link
- WHEN 用户请求恢复该 run
- THEN 系统保留该 link 的过程读取能力
- AND 执行以 full-fallback 继续，不直接 resume

## ADDED Requirement: 仅显式同次未完成执行可以 resume

系统 MUST 只在存在指向原 runId 的未消费恢复意图时规划 resume。普通新消息、成员接力与下一步骤 MUST 继续使用 full。系统 MUST NOT 按 session+role、最新时间或最近 thread 猜测恢复目标。

### Scenario: 普通下一步骤仍然 full
- GIVEN 前一步已完成并持久化 thread link
- WHEN 时间线中的下一条消息触发同一角色
- THEN 新 run 使用完整共享时间线和 full 模式

### Scenario: Retry 恢复唯一原 run
- GIVEN stuck 记录关联原 runId 且该 run 有唯一兼容 thread link
- WHEN 用户点击 Retry
- THEN 新 run 使用该 threadId 的 resume 模式

## ADDED Requirement: 恢复兼容性失败时安全降级 full

系统 MUST 校验 session、source、role、团队/角色内容和工作空间身份。任一不匹配、thread link 缺失/冲突或 rollout 不可用时，MUST 使用完整共享时间线 full，并记录恢复意图的 full-fallback 消费原因。

### Scenario: 团队在停下后被切换
- GIVEN 原 run 的角色或团队快照与当前有效团队不同
- WHEN 用户执行改一改重发
- THEN 系统不 resume 原 thread，改用当前团队和完整共享时间线 full

## ADDED Requirement: 正常退出先持久化恢复意图

系统 MUST 在正常退出终止已建立 thread 的 active run 前持久化 graceful resume intent，并停止领取新消息。只有持久化成功的 run 才可在下次启动自动恢复；无法写入 intent 时 MUST 保留可见终态或由 orphan stuck 收敛。

### Scenario: 正常退出正在执行的 run
- GIVEN 活动 run 已收到 thread.started
- WHEN 用户正常退出应用
- THEN session JSONL 先出现 graceful resume intent，再终止 Codex
- AND 下次启动自动恢复该执行

## ADDED Requirement: 恢复尝试与缓存用量可诊断

系统 MUST 为每次恢复创建独立 Moebius run，并把 resume/full-fallback 选择、原因及 Codex 返回的 cached input token 写入 session 诊断事实。系统 MUST NOT 在普通对话 state DTO 中展示 token cache 指标。

### Scenario: resume 完成并返回 cache 用量
- GIVEN Codex resume 成功且返回 cached_input_tokens
- WHEN 运行完成
- THEN session 事实可关联恢复意图、新 run 和 cached token
- AND 普通对话 API 不新增 token cache 字段
