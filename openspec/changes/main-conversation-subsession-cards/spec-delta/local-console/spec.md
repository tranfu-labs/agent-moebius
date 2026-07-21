# local-console delta：main-conversation-subsession-cards

## 新增业务规则

### 子任务状态聚合

Source: docs/product/pages/main-conversation.md#区域与信息

- 本域 MUST 提供按父会话聚合其子任务的读能力，每个子任务 MUST 携带标题、负责成员与当前状态。
- 状态取值 MUST 与会话页的四种事实对齐，MUST NOT 由界面自行推导。
- 子会话链损坏、子会话缺失或成员无法解析时 MUST 降级为可读的确定性取值，MUST NOT 让整张聚合失败。
- 本能力 MUST NOT 改变 `sessions.parent_session_id` 与 session edges 既有的运行时编排与恢复用途。

#### 场景 LC.MC.12：一个子任务挂了不影响整张聚合

- **GIVEN** 某个父会话下有三个子任务，其中一个的子会话链损坏
- **WHEN** 请求该父会话的子任务聚合
- **THEN** 三行都返回
- **AND** 损坏的那行给出确定性的降级状态而不是整张聚合失败。

### 拆分在父时间线留下卡片锚点

Source: docs/product/pages/main-conversation.md#页面结构

- 编排产生子会话时 MUST 在父会话时间线写入一条卡片锚点记录，使卡片具有确定的时间位置。
- 锚点 MUST 位于触发本次拆分的那条消息之后。
- 锚点 MUST 持久化，重启后卡片位置不变。

#### 场景 LC.MC.13：卡片位置跨重启稳定

- **GIVEN** 一次拆分在父时间线留下了卡片锚点
- **WHEN** 进程重启后重新读取该会话时间线
- **THEN** 锚点仍位于触发拆分的那条消息之后。
