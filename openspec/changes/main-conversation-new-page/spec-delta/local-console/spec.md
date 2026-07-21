# local-console delta：main-conversation-new-page

## 新增业务规则

### 会话创建与首条消息原子化

Source: docs/product/pages/main-conversation.md#操作与反馈

- 会话创建接口 MUST 接受可选的首条消息；带首条消息时 MUST 在同一个事务内写入 session 行与该条 user 消息，并在同一事务内完成本轮路由所需的状态写入。
- 事务失败时 MUST NOT 留下没有任何消息的 session 行。
- 不带首条消息的创建路径行为不变，服务子会话编排；子会话创建 MUST NOT 依赖首条消息字段。

#### 场景 LC.MC.1：创建失败不留空白会话

- **GIVEN** 一次带首条消息的会话创建请求
- **WHEN** 消息写入在事务提交前失败
- **THEN** 数据库中不存在对应的 session 行
- **AND** 调用方收到可读的失败原因。

### 会话标题来自首条消息

Source: docs/product/pages/main-conversation.md#区域与信息

- 会话标题 MUST 在写入首条消息时由该消息体导出：折叠连续空白、只取首行、按显示宽度截断、内容为空或全为符号时使用兜底文案。
- 标题 MUST 只在创建时计算一次，MUST NOT 随后续消息重算。
- 缺省标题 MUST 仅用于不带首条消息的创建路径。
- 本域 MUST NOT 提供修改会话标题的接口（PRD 本版对是否允许改标题明确不作答）。

#### 场景 LC.MC.2：标题在创建后不再变化

- **GIVEN** 一段会话的标题由首条消息导出
- **WHEN** 后续消息写入该会话
- **THEN** 标题保持不变。
