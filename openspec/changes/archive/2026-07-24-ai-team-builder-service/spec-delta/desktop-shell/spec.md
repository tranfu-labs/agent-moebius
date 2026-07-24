# spec-delta: desktop-shell / ai-team-builder-service

## Requirement: AI 建队草稿在同一流程中可退出并恢复
Source: docs/product/pages/onboarding.md#第-2-步--ai-建队子流程
Acceptance: onboarding#6

系统 MUST 以「你希望这支团队长期替你完成什么工作？」作为固定首问、每轮 clarifying 只返回一个问题，并以独立草稿保存对话、最后有效方案和当前状态供用户返回后恢复。系统 MUST NOT 把未确认草稿登记为正式团队或在同一轮展示多个追问。

### Scenario: 退出后恢复未确认草稿
- GIVEN 用户已提交长期工作目标且 AI 建队草稿含一轮对话
- WHEN 用户退出并再次打开同一建队入口
- THEN renderer 获得原对话、最后有效方案和可继续的草稿状态，团队列表没有新增项

### Scenario: 固定首问与单次追问
- GIVEN 用户首次打开一个尚无对话的 AI 建队草稿
- WHEN service 返回 idle 状态并在后续一轮收到 clarifying 输出
- THEN 第一条 assistant 消息以固定长期目标问题开头，clarifying 消息只包含一个可回答的问题

## Requirement: AI 团队方案经验证后整支提交
Source: docs/product/pages/onboarding.md#第-2-步--ai-建队子流程
Acceptance: onboarding#7

系统 MUST 只接受含 2–6 名成员、唯一稳定 slug、唯一主 Agent、结构化职责与交棒引用、有效接力示例的方案。系统 MUST NOT 提交过期 proposal revision 或未经验证的方案。

### Scenario: 当前有效方案创建并选中
- GIVEN 当前显示方案已通过业务校验且 proposal revision 为 N
- WHEN 用户以 revision N 请求创建
- THEN 系统一次创建全部成员及其有效 `AGENT.md`，登记普通用户团队并返回 selected 状态

## Requirement: AI 建队使用隔离的 Codex execution profile
Source: docs/product/pages/onboarding.md#AI-建队技术约束
Acceptance: onboarding#20

系统 MUST 为每个草稿使用独立 Codex thread、固定 developer instructions、output schema、只读 sandbox、隔离 cwd、2 分钟 idle timeout 与 10 分钟 max-duration timeout。系统 MUST NOT 使用普通 Agent 的 `--yolo` 参数、项目 `AGENTS.md`、用户 MCP 或个人指令。

### Scenario: 首轮与续轮均保持隔离
- GIVEN AI 建队草稿尚无 thread
- WHEN 用户提交首轮目标并在回复后继续调整
- THEN 首轮使用 `codex exec`、续轮使用 `codex exec resume <threadId>`，两轮参数均不含 `--yolo` 且输出受同一 schema 约束

## Requirement: AI 建队失败有界并保留可恢复内容
Source: docs/product/pages/onboarding.md#第-2-步--ai-建队子流程
Acceptance: onboarding#21

系统 MUST 在非法输出时最多自动执行一次修复 turn，并在超时、resume 失败、二次非法输出或创建失败后进入可重试 failed 状态。系统 MUST NOT 无限自动重试、删除既有对话或最后有效方案、把失败当作已创建。

### Scenario: 修复一次后仍非法
- GIVEN 当前草稿已有对话和一版有效方案
- WHEN 新一轮 Codex 输出非法且唯一一次修复 turn 仍非法
- THEN 状态变为 failed、原对话和有效方案仍可见、动作只允许用户显式重试或取消

## Requirement: renderer 只接收白名单 AI 建队 DTO
Source: docs/product/pages/onboarding.md#AI-建队技术约束
Acceptance: onboarding#22

系统 MUST 只向 renderer 返回 phase、公开消息、方案预览、revision、安全错误摘要、可执行动作和 selected 终态的团队 id。系统 MUST NOT 返回 Codex thread id、原始 JSONL、schema 路径、cwd、内部堆栈或内部错误。

### Scenario: Codex 运行失败后的 IPC 响应
- GIVEN Codex 子进程在内部运行目录中产生 stderr 与堆栈
- WHEN renderer 通过 AI 建队 IPC 读取草稿
- THEN 响应只含安全 `error.code`、`humanMessage`、`canRetry` 与恢复动作，序列化结果不含任何内部路径或 thread id

## Requirement: AI 建队提交对团队列表原子可见
Source: docs/product/pages/agent-teams.md#AI-建队
Acceptance: agent-teams#6

系统 MUST 在同一文件系统临时目录写完并重读验证完整团队后才切换为正式用户团队并登记记录。系统 MUST NOT 在确认前或任一步失败后让团队列表看到临时目录、部分成员或残留团队记录。

### Scenario: 团队记录登记失败
- GIVEN 临时团队的 2–6 名成员及全部 `AGENT.md` 已写完并通过重读校验
- WHEN 正式目录 rename 后的用户团队记录登记失败
- THEN writer 删除正式目录和临时目录，团队列表不返回该团队且 last-used team 记录不变
