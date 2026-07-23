# local-console delta：right-sidebar-codex-rollout-history

本 delta 修改已归档 `right-sidebar-process-tab` 的过程输出数据源与聚合契约，并新增 Codex thread 关联、rollout 定位和分页投影要求。

## Requirement: 每个 Agent run 持久化到 Codex thread 的稳定关联
Source: docs/product/pages/main-right-sidebar.md#过程标签

系统 MUST 在 Codex 发出 `thread.started` 后，通过 session fact 写漏斗为对应 run 追加包含 `runId`、源消息 id、role、threadId 与 startedAt 的关联事实；同一 run 的同值重放 MUST 幂等，冲突 threadId MUST fail closed。系统 MUST NOT 把 Codex rollout 内容复制进 Moebius session JSONL，也不得只在 SQLite 或进程内保存该关联。

### Scenario: 失败 run 已建立 thread
- GIVEN 一个 Agent run 已收到合法 `thread.started`，随后失败或被用户中断
- WHEN 应用重启并从 session JSONL 恢复
- THEN 该 run 仍能恢复唯一 threadId
- AND 无需 run 成功或依赖 active-run 内存状态

## Requirement: 过程读取唯一定位 Codex rollout，缺失时不伪造降级
Source: docs/product/pages/main-right-sidebar.md#codex-过程记录可能不可用

系统 MUST 依据 session fact 中的 threadId 在当前 Codex sessions 根内唯一定位对应 rollout JSONL，并校验真实路径仍位于受信任根；关联缺失，或候选为零个、多个、损坏、越界、不可读时，MUST 返回结构化 unavailable。系统 MUST NOT 从 Moebius runDir / tmp 恢复关联，也不得使用 stdout / stderr tail、最终 Agent 回复或按时间 / role 猜测的其他文件冒充完整过程。

### Scenario: rollout 已被删除
- GIVEN run-thread link 仍存在但对应 Codex rollout 文件已被删除
- WHEN 客户端请求该步骤过程
- THEN 接口返回 unavailable
- AND 响应不包含 stdout tail 或最终 Agent 回复 fallback

## Requirement: 本轮输入从 session facts 恢复公开时间线
Source: docs/product/pages/main-right-sidebar.md#过程标签

系统 MUST 按每个 attempt 的源消息 id，以 session facts 的追加顺序重放到并包含该源消息，恢复该次执行启动时可见的用户、其他 Agent 与当前 Agent 的公开时间线，保留角色、顺序、正文与用户可见附件信息。系统 MUST NOT 下发 Codex user prompt blob、Agent persona、团队规则、系统上下文、workspace 内部信息或附件托管路径。

### Scenario: 同一步骤重试前新增公开消息
- GIVEN 第一次执行失败后时间线新增一条用户消息并触发第二次执行
- WHEN 请求该步骤完整过程
- THEN 两个 attempts 分别带有各自启动时的公开输入快照
- AND 第二次输入包含新增消息，第一次输入不包含

## Requirement: rollout 投影覆盖全部用户有意义事件
Source: docs/product/pages/main-right-sidebar.md#过程标签

系统 MUST 将 Codex rollout 中的 Agent Markdown、命令、工具 / 函数 / MCP、文件操作、错误与诊断映射为有序可见事件，并过滤系统 prompt、persona、协议生命周期、内部 id、token 统计与原始 reasoning；尚未支持且不属于明确协议噪音的事件 MUST 产生带 event type 的可见 unsupported 事件。系统 MUST NOT 静默丢弃未知过程事件或下发原始 rollout JSON。

### Scenario: 已知事件之间出现新类型
- GIVEN rollout 在命令结果与 Agent 消息之间出现一个 projector 未识别的新事件类型
- WHEN 客户端读取该页
- THEN 响应按原顺序包含命令结果、unsupported 占位和 Agent 消息
- AND 占位包含事件类型但不包含原始 JSON payload

## Requirement: 过程 API 跨 attempts 反向分页且不截断全程
Source: docs/product/pages/main-right-sidebar.md#响应式与窗口行为

系统 MUST 以不透明游标从最新 attempt 末尾反向分页，并在页内按时间正序返回；游标 MUST 能跨 attempt 边界，活动文件 MUST 支持从 append cursor 读取新增完整行。每页 MAY 有事件数与字节数上限；单个完整事件超过字节上限时 MUST 允许其独占一页且不得截断事件字段，系统 MUST NOT 因单页边界截断整段历史。尾部半行 MUST 等待后续追加而不得误报 malformed。

### Scenario: 大记录跨三页读取到开头
- GIVEN 一个步骤包含两个 attempts 且投影事件超过三页
- WHEN 客户端从初始页连续请求 previous cursor 直到为空
- THEN 合并后的事件从第一次执行的公开输入到第二次执行的最终事件完整且无重复
- AND 初始页来自最新 attempt 的末尾
