# desktop-shell delta：main-conversation-timeline-truth

## Requirement: #14 桌面运行名单只来自会话团队
Source: docs/product/pages/main-conversation.md#操作与反馈

系统 MUST 从会话绑定团队的内容快照解析名单并把主 Agent 排在首位；没有团队绑定的存量会话 MUST 按已登记兼容契约回退共享 agents 目录。系统 MUST NOT 在已绑定团队删除或需要修复时使用共享 agents 顶替，也 MUST NOT 把未绑定存量会话误判为团队已删除。

### Scenario: 绑定团队不可解析
- GIVEN 会话所绑团队已删除或需要修复且共享 agents 目录仍有文件
- WHEN 桌面壳为该会话解析运行名单
- THEN 返回可区分的团队错误且没有使用共享目录中的 Agent

### Scenario: 未绑定存量会话
- GIVEN 存量会话没有团队绑定且共享 agents 目录存在可用 Agent
- WHEN 桌面壳解析名单与团队健康
- THEN 使用共享目录名单并返回可继续状态

## Requirement: #17 桌面团队健康接通恢复入口
Source: docs/product/pages/main-conversation.md#三种不可继续状态的共同规则

系统 MUST 将团队已删除与团队需要修复作为不同健康状态交给本地控制台，并让改选可用团队或团队修复在真实 IPC/HTTP 装配中恢复推进。系统 MUST NOT 把缺失团队引导到不可执行的修复动作。

### Scenario: 桌面窗口改选已删除团队
- GIVEN 桌面窗口中的当前会话绑定团队已被删除并处于只读态
- WHEN 用户从团队上下文菜单改选内置可用团队
- THEN 真实会话绑定更新、输入恢复且原时间线仍可见
