# local-console spec delta：multi-agent-primary-control-lanes

## Requirement: 用户消息只进入主 Agent 控制车道
Source: docs/product/pages/main-conversation.md#说话与提及

local runtime MUST 把所有 composer 用户消息交给会话团队快照首成员。用户正文中的成员 mention MUST 作为主 Agent 可见内容保留，MUST NOT 在入站时直接启动或中断专业成员。只有主 Agent 或既有成员接力产生的合法 mention MAY 启动专业 Agent 执行车道。

### Scenario: 用户点名正在运行的成员
- GIVEN dev 正在运行且团队主 Agent 是 dev-manager
- WHEN 用户提交包含 `@dev` 的消息
- THEN dev 的中断信号保持未触发
- AND 消息由 dev-manager 控制车道领取

## Requirement: 一个主理人车道与多个成员执行车道
Source: docs/product/pages/main-conversation.md#团队推进中

每个 session MUST 同时允许最多一个主 Agent run，并允许不同专业成员各有一个活动 run。不同成员的 run MUST 可并行；同一成员的新任务 MUST 等待其旧 run 进入终态，若新任务来自主 Agent 对活动成员的重定向则 MUST 先中断旧 run。系统 MUST NOT 用 session 级单值 active run 覆盖或串行阻塞所有专业成员。

### Scenario: 主理人与两个成员并行
- GIVEN dev 与 qa 已在同一 session 运行
- WHEN 用户发送新消息且主 Agent 空闲
- THEN runtime 启动主 Agent run
- AND dev、qa 的 controller 与活动事实保持不变

### Scenario: 重定向同一成员
- GIVEN dev 的旧 run 仍在执行
- WHEN 主 Agent 的新回复合法提及 dev
- THEN runtime 中断旧 dev run 并等待其终态
- AND 之后才以新指令启动新的 dev run

## Requirement: 主理人 pending FIFO 在任一主理人终态后发射
Source: docs/product/pages/main-conversation.md#输入框

主 Agent 运行期间提交的用户消息 MUST 以原子、可恢复的 pending 事实保存正文与附件，并 MUST 按提交顺序暴露给 state。主 Agent completed、failed、stuck 或 interrupted 后，runtime MUST 幂等唤醒并领取最早一条 pending；专业成员终态 MUST NOT 单独触发该队列发射。进程重启且不存在真实主 Agent run 时 MUST 继续 catch-up。

### Scenario: 停下主理人后发射
- GIVEN 主 Agent 正在运行且有两条 pending 用户消息
- WHEN 用户精确停止主 Agent 且旧 run 已确认终态
- THEN runtime 领取第一条 pending 并启动新的主 Agent run
- AND 第二条保持 pending

### Scenario: 停下专业成员不发射
- GIVEN 主 Agent 正在运行、dev 也在运行且存在 pending 用户消息
- WHEN 用户停止 dev
- THEN pending 用户消息保持 pending
- AND 主 Agent run 不受影响

## Requirement: state 暴露多 run 与主理人兼容投影
Source: docs/product/pages/main-conversation.md#团队推进中

local state、session view 与 snapshot MUST 返回当前 session 的全部 `activeRuns`，每项以非空 runId、role、live Markdown 和 interruptible 区分。迁移期 `activeRun` MAY 保留，但 MUST 只投影主 Agent run；主 Agent 空闲时 MUST 为 null，MUST NOT 随机投影专业成员。

### Scenario: 只有两个专业成员运行
- GIVEN dev 与 qa 正在运行且主 Agent 空闲
- WHEN 客户端读取 state
- THEN `activeRuns` 含 dev 与 qa 两项
- AND `activeRun` 为 null

## Requirement: 中断按精确 runId 匹配
Source: docs/product/pages/main-conversation.md#停下

runtime MUST 在 session 的全部活动 run 中按 `sessionId + runId` 精确匹配中断目标，并只向命中的 controller 发出 abort。不存在或已终态的 runId MUST 返回无匹配；停止任一专业成员 MUST NOT 改变其他 run 或释放主理人 pending。

### Scenario: 并行 run 中停止一个
- GIVEN 同一 session 有 primary-run、dev-run 与 qa-run
- WHEN interrupt 请求携带 dev-run
- THEN 只有 dev-run controller 收到 abort
- AND primary-run 与 qa-run 保持活动

## Requirement: 并行控制工作事实与恢复
Source: docs/product/pages/main-conversation.md#指标与验收

`hasPendingControlWork` 与 running count MUST 覆盖全部活动 run、尚未领取的主理人 pending、已完成但尚待主理人接回的专业结果。重启恢复 MUST 逐条识别持久化但已无真实进程的 running run 并写入可见 stuck 终态。系统 MUST NOT 因某一 run 完成而把仍有其他 run 或 pending 的 session 标为 idle。

### Scenario: 一个成员完成但另一个仍运行
- GIVEN dev 与 qa 并行且 dev 已完成
- WHEN session summary 刷新
- THEN qa 仍计入 runningCount
- AND session 保持进行中
