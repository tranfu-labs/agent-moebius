# local-console spec delta：main-conversation-streamdown-markdown

## ADDED Requirements

### Requirement: 活动 run 暴露最新 Agent 可见 Markdown 而不制造消息
Source: docs/product/pages/main-conversation.md#时间线

系统 MUST 从当前 Codex run 的完整结构化 stdout 事件中只提取 Agent 可见 Markdown，并在活动 run snapshot 中至多暴露当前最新一段；命令、reasoning、错误、usage 与 thread/turn 生命周期事件 MUST NOT 成为对话消息或活动 Markdown。活动 Markdown MUST 只存在于当前 run 的内存/API 事实中，MUST NOT 追加到 `session_messages`、推进 cursor 或改变重启恢复语义。

#### Scenario: 八个运行事件不生成八条消息
- GIVEN 一次 run 依次产生 thread、turn、两条 agent message、命令开始/结束和完成事件
- WHEN local runtime 更新活动 snapshot
- THEN 同一个 run 始终只有一条活动记录且其 Markdown 从第一段原地替换为第二段
- AND run 成功后 SQLite 只新增一条最终 Agent 消息

### Requirement: JSONL 增量读取有界且不伪造 token 流
Source: docs/product/pages/main-conversation.md#时间线

系统 MUST 只向可见事件适配器提交已经换行闭合的 JSONL，并 MUST 对单条未闭合输入设置明确的有限字节上限；超限行 MUST 有界丢弃且后续完整行仍可处理。系统 MUST 容忍 chunk 断行、malformed 行、未知事件与回调异常而不终止 Codex run。当前上游未提供正式 token delta 时，系统 MUST 按完整 Agent 进度段更新，MUST NOT 人工切字或把命令输出伪装成 token stream。无可见 Agent Markdown 时 MUST 保留非空、有界的运行摘要降级。

#### Scenario: 半条 JSON 后仍可恢复
- GIVEN stdout chunk 在一条 agent message JSON 中间断开且其前后夹有 malformed、超限与 command 事件
- WHEN 后续 chunk 补齐该行
- THEN 适配器只产生一次完整 Agent Markdown 更新
- AND state API 不因 malformed 或缺失可见段无限等待或返回空白 run
