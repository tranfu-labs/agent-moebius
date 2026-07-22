# local-console delta：main-conversation-new-page

## Requirement: 验收 3 — 会话与首条消息原子创建
Source: docs/product/pages/main-conversation.md#操作与反馈

系统 MUST 允许会话创建请求携带首条消息，并在同一数据库事务内写入 session 与对应 user message 后才返回成功。系统 MUST NOT 在消息写入或事务提交失败时留下空白 session，也 MUST NOT 改变不带首条消息的既有会话及子会话创建路径。

### Scenario: 消息写入失败整体回滚
- GIVEN 创建请求同时携带项目、团队与非空首条消息
- WHEN 首条消息在事务提交前写入失败
- THEN 数据库中不存在本次请求的 session 与 message

### Scenario: 旧创建路径保持兼容
- GIVEN 调用方创建会话时没有携带首条消息
- WHEN 本地服务处理该请求
- THEN 会话仍按既有缺省标题路径创建且不产生首条 user message

## Requirement: 验收 5 — 首条消息只生成一次会话标题
Source: docs/product/pages/main-conversation.md#会话内容区

系统 MUST 从首条消息首行折叠连续空白并按显示宽度最多 32 截断生成标题，全空白或全符号内容 MUST 使用“新会话”兜底，长标题 MUST 以省略号结束。系统 MUST NOT 因后续消息重算标题，也 MUST NOT 为本行为新增标题修改接口。

### Scenario: 标题在后续消息后保持不变
- GIVEN 会话已从首条消息生成标题
- WHEN 该会话写入任意后续消息
- THEN 持久化标题与创建完成时完全相同

### Scenario: 长首行按显示宽度截断
- GIVEN 首条消息第一行的显示宽度超过 32
- WHEN 会话与首条消息创建成功
- THEN 标题显示宽度不超过 32 且以省略号结束
