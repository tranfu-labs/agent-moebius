# local-console spec delta：session-fact-funnel-hardening

## Requirement: 绕过事实漏斗的消息写入必须显式失败
Source: docs/adr/0004-jsonl-session-fact-log.md#决策

系统 MUST 在 SQLite worker 的顶层派发入口显式拒绝任何绕过 `local-commit-session-fact-write`、可创建或变更 `session_messages` 的命令，并且 MUST 在对应消息索引变更发生前失败。生产 store 的会话创建、消息追加、状态流转、Agent / system 回复、子会话创建与子会话卡片写入 MUST 继续通过同一事实写漏斗提交；系统 MUST NOT 因此拦截一次性 jsonl 迁移导出或从 jsonl 重建消息索引的内部命令。

### Scenario: 顶层直调旧消息命令
- GIVEN 调用方绕过 local console store，从真实 SQLite worker 入口直接提交一个可写 `session_messages` 的旧命令
- WHEN worker 派发该命令
- THEN 调用以指向 ADR-0004 与 `local-commit-session-fact-write` 的明确错误失败
- AND `session_messages` 没有该命令产生的新增或变更。

### Scenario: 生产 store 门面继续写入事实日志
- GIVEN local console 通过真实 store 装配调用任一会话消息变更门面
- WHEN store 提交该会话事实
- THEN worker 只在 `local-commit-session-fact-write` 内执行对应消息索引变更
- AND 对应 session jsonl 追加一条完整事实事件。

### Scenario: 迁移与重建内部命令不被误拦
- GIVEN 旧 `session_messages` 尚待一次性迁移，或 jsonl 对应的消息索引需要重建
- WHEN store 从最外层初始化或重建入口执行迁移导出与索引重建
- THEN 内部迁移和重建命令仍可完成
- AND 旧 SQLite 行不会反向覆盖既有 jsonl。
