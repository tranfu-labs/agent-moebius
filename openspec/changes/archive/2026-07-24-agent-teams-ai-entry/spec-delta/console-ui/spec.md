# spec-delta: console-ui / agent-teams-ai-entry

## Requirement: Agent 团队新建入口区分三条创建路径
Source: docs/product/pages/agent-teams.md#页面标题与新建入口
Acceptance: agent-teams#4

系统 MUST 在 Agent 团队首页的「新建团队」菜单中提供「跟 AI 聊出一支新团队」和「从空白开始」，MUST 让 AI 建队占用当前页面主体并提供返回 Agent 团队列表的动作，且 MUST 继续让从空白开始使用短字段 `TeamInformationDialog`。系统 MUST 只在已有团队详情中提供「复制并编辑」，不得把它加入新建菜单；三条路径创建成功后 MUST 都以普通用户团队进入既有团队详情。

### Scenario: 从新建菜单进入 AI 建队主体

- GIVEN Agent 团队首页已经载入
- WHEN 用户展开「新建团队」并选择「跟 AI 聊出一支新团队」
- THEN 当前页面主体显示共享的 `TeamBuilderView`
- AND 桌面 console 顶部导航和 Agent 团队上下文仍然保留
- AND 页面没有打开新建团队 dialog

### Scenario: 从空白开始保持既有短表单

- GIVEN Agent 团队首页已经载入
- WHEN 用户展开「新建团队」并选择「从空白开始」
- THEN 页面打开只含团队名称和一句话描述的 `TeamInformationDialog`
- AND 菜单中没有「复制并编辑」

## Requirement: AI 建队草稿与会话团队偏好保持隔离
Source: docs/product/pages/agent-teams.md#AI-建队
Acceptance: agent-teams#6

系统 MUST 只在 AI 建队主体内显示和恢复未确认草稿，MUST NOT 把草稿加入 Agent 团队列表或新建对话团队选择。确认创建后，系统 MUST 通过正式团队列表读取一次性原子创建的普通用户团队并进入其详情；AI 建队 selected 本身 MUST NOT 创建、覆盖或更新 `last-used-team.json`，该偏好仍只允许由成功创建会话更新。

### Scenario: 未确认草稿不进入团队列表

- GIVEN Agent 团队页的 AI 建队草稿含对话或有效方案但尚未确认
- WHEN renderer 从最外层团队列表入口调用 `listAgentTeams()`
- THEN 返回值只包含已经登记的正式团队
- AND 新建对话团队选择中没有该草稿

### Scenario: 确认创建进入详情但不改变会话偏好

- GIVEN `last-used-team.json` 记录上一次成功创建会话时使用的团队 A
- WHEN 用户在 Agent 团队页确认 AI 方案并收到 selected 团队 B
- THEN 团队 B 作为普通用户团队出现在列表并打开详情
- AND `last-used-team.json` 仍记录团队 A
