# local-console delta：main-conversation-workspace-lock

本 delta 修改 `main-conversation-session-context` 交付的两条 Requirement（验收 #6、验收 #7），把工作空间从「运行中可切换」收敛为「首条消息后锁定」。合并时以本文替换 `openspec/specs/local-console/spec.md` 中的同名 Requirement，NEVER 与旧版并存。

## Requirement: 验收 #6 运行中的团队切换在当前步骤结束后落定
Source: docs/product/pages/main-conversation.md#选择工作空间与团队

系统 MUST 在会话空闲时立即落定团队切换，在会话运行时持久化待生效团队并于当前步骤收尾后落定、清空待生效值，且后续步骤使用新团队。系统 MUST NOT 因团队切换中止当前步骤、重放已完成步骤或丢弃既有对话历史，MUST NOT 为工作空间保留任何待生效路径。

### Scenario: 运行中改选团队
- GIVEN 一段会话正在执行当前步骤
- WHEN 用户改选团队
- THEN 当前执行继续且生效团队保持不变，待生效团队持久化；当前执行结束后待生效值成为生效值并被清空，已完成步骤只出现一次

### Scenario: 待生效团队跨进程重启保留
- GIVEN 一段会话已持久化待生效的团队
- WHEN 本地进程重启并重新打开该会话
- THEN 待生效团队仍存在，并可在当前步骤收尾时正常落定

## Requirement: 验收 #5 工作空间在首条消息后锁定
Source: docs/product/pages/main-conversation.md#选择工作空间与团队

系统 MUST 在会话已有消息时拒绝工作空间切换命令并返回用户可理解的原因；已有库中残留的待生效工作空间值 MUST 被视作无效并按生效值解析。系统 MUST NOT 静默忽略该命令，MUST NOT 在错误文案中暴露列名、路径或内部标识，MUST NOT 因升级使既有会话的生效工作空间发生跳变。

### Scenario: 已开始的会话拒绝切换工作空间
- GIVEN 一段会话已经有消息
- WHEN 收到该会话的工作空间切换命令
- THEN 命令被拒绝并返回可理解的原因，会话的生效工作空间不变

### Scenario: 存量待生效值降级
- GIVEN 升级前某会话持久化了待生效工作空间
- WHEN 升级后该会话触发一次运行
- THEN 解析结果取生效值，待生效值不参与解析，也不在当前步骤收尾时被提升

## Requirement: 验收 #7 工作空间模式归属于会话
Source: docs/product/pages/main-conversation.md#上下文

系统 MUST 在 session 上持久化生效工作空间模式，并在每次运行前以会话模式和所属项目文件夹解析 Codex cwd；升级时 MUST 将既有会话初始化为所属项目当时的模式且迁移幂等。系统 MUST NOT 在运行时从 project 的当前模式回退推导会话模式，也 MUST NOT 因孤儿会话阻塞迁移。

### Scenario: 同项目两段会话使用不同工作空间
- GIVEN 同一个项目下有一段默认工作空间会话和一段独立工作空间会话
- WHEN 两段会话分别触发一次 Codex 运行
- THEN 默认会话的 cwd 是项目文件夹，独立会话的 cwd 是自己的隔离副本，任一会话的模式不改变另一段会话

### Scenario: 既有会话迁移保持原行为
- GIVEN 结构升级前一个项目启用了独立工作空间且其下已有会话
- WHEN 会话工作空间列迁移执行两次
- THEN 该既有会话的生效模式均保持独立，第二次迁移不产生额外变化
