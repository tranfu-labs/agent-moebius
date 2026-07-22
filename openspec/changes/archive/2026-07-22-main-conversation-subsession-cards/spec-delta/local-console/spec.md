# local-console delta：main-conversation-subsession-cards

## Requirement: 按父会话读取子任务事实
Source: docs/product/pages/main-conversation.md#子会话卡片

系统 MUST 通过父会话读接口返回每个子会话的标题、负责成员、当前状态及可读状态标签，并对空拆分返回空数组、对缺失或损坏的子会话返回确定性的不可用降级行。系统 MUST NOT 改写 `parent_session_id`、`session_edges` 或把聚合规则交给界面推导。

### Scenario: 一个子会话链损坏
- GIVEN 父会话关联三个子会话且其中一个会话记录已缺失
- WHEN 客户端通过 HTTP 请求该父会话的子任务聚合
- THEN 接口仍返回三行且缺失行的标题、成员和状态为确定性降级值

## Requirement: 拆分在父时间线持久化卡片锚点
Source: docs/product/pages/main-conversation.md#子会话卡片

系统 MUST 在 CEO 编排创建子会话并成功记录可见回复后，于父会话写入携带子会话标识的唯一卡片锚点，并在重启后保持相同消息顺序。系统 MUST NOT 为每个子会话另写侧边栏入口消息或在可见回复之前写入卡片锚点。

### Scenario: 重启后重读拆分时间线
- GIVEN 一次拆分已依次写入 CEO 可见回复和子会话卡片锚点
- WHEN local-console 进程重启后通过 HTTP 重读父会话
- THEN 同一卡片锚点仍位于 CEO 可见回复之后且只出现一次
