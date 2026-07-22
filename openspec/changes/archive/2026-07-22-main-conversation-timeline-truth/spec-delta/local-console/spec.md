# local-console delta：main-conversation-timeline-truth

## Requirement: #12 系统事实类型持久化
Source: docs/product/pages/main-conversation.md#区域与信息

系统 MUST 为每条系统记录持久化非空事件类型，覆盖没跑起来、卡住、用户按停、反复重试仍未成功和中性其他类型；旧 exception 只迁为中性类型，其他旧人工等待值清空。系统 MUST NOT 依赖正文猜测事实，也 MUST NOT 把路径或内部 id 写入面向用户的正文。

### Scenario: 旧数据库幂等升级
- GIVEN 数据库含旧 awaits_human_reason 值且尚无事件类型列
- WHEN 同一结构升级执行一次或重复执行
- THEN 每条系统记录都有非空类型、旧等待值均被清空且 exception 不触发异常红点

## Requirement: #14 用户消息遵循团队主 Agent 与重定向语义
Source: docs/product/pages/main-conversation.md#操作与反馈

系统 MUST 把未提及成员的用户消息交给当前团队主 Agent；提及正在工作的成员时 MUST 中止它的当前步骤并用新指令重新开始；未绑定存量会话 MUST 继续使用共享 agents 名单。系统 MUST NOT 从共享 agents 目录补充已绑定团队的团队外成员，主 Agent 转达给正在工作成员的消息 MUST 使用相同重定向语义。

### Scenario: 无提及消息进入主 Agent
- GIVEN 会话绑定的团队主 Agent 为 dev-manager 且没有成员正在工作
- WHEN 用户发送一条不含 mention 的消息
- THEN 运行时以 dev-manager 启动该消息且没有调用旧兜底路由

### Scenario: 未绑定存量会话继续推进
- GIVEN 存量会话没有团队绑定且共享 agents 名单可用
- WHEN 用户从本地 HTTP 入口发送消息
- THEN 消息由共享名单中的 Agent 处理且会话没有进入团队已删除状态

## Requirement: #17 不可继续状态可判定并可恢复
Source: docs/product/pages/main-conversation.md#三种不可继续状态的共同规则

系统 MUST 分别产出项目文件夹不可用、团队已删除、团队需要修复的原因和恢复动作；修复项目、改选团队或修复团队后 MUST 恢复推进并保留历史。系统 MUST NOT 把已删除团队归为需要修复，团队恢复后 MUST NOT 要求用户额外操作。

### Scenario: 团队修复自动生效
- GIVEN 会话因团队需要修复而不可继续
- WHEN 后续真实状态刷新发现该团队恢复可用
- THEN 会话自动恢复推进能力且历史消息未改变

## Requirement: #18 运行中上下文失效按工作空间安全性分流
Source: docs/product/pages/main-conversation.md#三种不可继续状态的共同规则

系统 MUST 允许已有有效隔离副本的执行完成当前步骤后停止，并 MUST 立即中止依赖已失效项目目录或团队内容的执行、写入可读系统记录。系统 MUST NOT 在执行无法继续后仍上报成员正在工作。

### Scenario: 直接工作空间在目录消失时立即停止
- GIVEN 成员正在直接工作空间执行且项目文件夹变为不可用
- WHEN 状态从 HTTP 应用入口刷新
- THEN 当前执行被中止、时间线出现可读记录且 activeRun 为空
