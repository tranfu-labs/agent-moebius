# local-console delta：main-conversation-session-context

## Requirement: 验收 #6 运行中的上下文切换在当前步骤结束后落定
Source: docs/product/pages/main-conversation.md#选择工作空间与团队

系统 MUST 在会话空闲时立即落定工作空间或团队切换，在会话运行时持久化待生效值并于当前步骤收尾后落定、清空待生效值，且后续步骤使用新上下文。系统 MUST NOT 因上下文切换中止当前步骤、重放已完成步骤或丢弃既有对话历史。

### Scenario: 运行中同时改选工作空间与团队
- GIVEN 一段会话正在执行当前步骤
- WHEN 用户改选工作空间与团队
- THEN 当前执行继续且生效值保持不变，待生效值持久化；当前执行结束后待生效值成为生效值并被清空，已完成步骤只出现一次

### Scenario: 待生效值跨进程重启保留
- GIVEN 一段会话已持久化待生效的工作空间
- WHEN 本地进程重启并重新打开该会话
- THEN 待生效工作空间仍存在，并可在当前步骤收尾时正常落定

## Requirement: 验收 #7 工作空间模式归属于会话
Source: docs/product/pages/main-conversation.md#上下文

系统 MUST 在 session 上持久化生效与待生效工作空间模式，并在每次运行前以会话模式和所属项目文件夹解析 Codex cwd；升级时 MUST 将既有会话初始化为所属项目当时的模式且迁移幂等。系统 MUST NOT 在运行时从 project 的当前模式回退推导会话模式，也 MUST NOT 因孤儿会话阻塞迁移。

### Scenario: 同项目两段会话使用不同工作空间
- GIVEN 同一个项目下有一段默认工作空间会话和一段独立工作空间会话
- WHEN 两段会话分别触发一次 Codex 运行
- THEN 默认会话的 cwd 是项目文件夹，独立会话的 cwd 是自己的隔离副本，任一会话的模式不改变另一段会话

### Scenario: 既有会话迁移保持原行为
- GIVEN 结构升级前一个项目启用了独立工作空间且其下已有会话
- WHEN 会话工作空间列迁移执行两次
- THEN 该既有会话的生效模式均保持独立，第二次迁移不产生额外变化

## Requirement: 验收 #9 会话状态上行真实分支名
Source: docs/product/pages/main-conversation.md#上下文

系统 MUST 在会话状态中返回当前生效工作空间的 `git branch --show-current` 真值，并按工作空间路径有界缓存读取结果、在运行收尾和工作空间切换时失效；detached HEAD MUST 返回确定性 `detached`。系统 MUST NOT 以“当前分支”“会话分支”或编造的名称代替 Git 真值，也 MUST NOT 让每次状态刷新都启动 Git 进程。

### Scenario: 默认与独立工作空间分别返回真实分支
- GIVEN 同项目的默认会话位于 `main`，独立会话位于 `agent/local-session`
- WHEN 客户端分别请求两段会话的 state
- THEN 两段会话的 `branchName` 分别为 `main` 与 `agent/local-session`

## Requirement: 验收 #20 会话使用选择时载入的团队内容快照
Source: docs/product/pages/main-conversation.md#上下文

系统 MUST 在会话创建或改选团队时持久化当下成员 slug 与 `AGENT.md` 内容，并在后续推进时使用该会话 effective 快照；运行中改选的快照 MUST 与团队绑定一起待生效和落定。系统 MUST NOT 因用户之后在 Agent 团队页修改成员文件而改变已有会话已载入的 prompt 内容，也 MUST NOT 用内容快照替代团队当前健康状态的实时判定。

### Scenario: 团队页后续修改不改变已有会话
- GIVEN 会话已载入团队成员内容版本 A
- WHEN 用户在团队页把同一成员修改为版本 B 后继续该会话
- THEN 下一步仍使用版本 A，且不会从当前团队目录重读版本 B

### Scenario: 运行中改选团队冻结选择时版本
- GIVEN 会话正使用团队 A 执行当前步骤
- WHEN 用户改选团队 B，随后在当前步骤结束前又修改团队 B 的成员文件
- THEN 当前步骤继续使用团队 A，结束后团队 B 的选择时快照生效，下一步使用该快照而非后改版本
