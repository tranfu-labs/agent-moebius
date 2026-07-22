# console-ui delta：main-conversation-session-context

## Requirement: 验收 #5 会话输入区展示可改选的四项上下文
Source: docs/product/pages/main-conversation.md#上下文

系统 MUST 在输入框上方按“项目 → 工作空间 → 分支 → 团队”的固定顺序展示当前会话上下文，并允许用户在已有对话中改选工作空间与团队。系统 MUST NOT 把工作空间或团队只渲染成不可操作的静态标签。

### Scenario: 已有对话改选上下文
- GIVEN 一段已有消息的会话已经绑定项目、工作空间、分支和团队
- WHEN 用户查看输入区上方的上下文条
- THEN 四项按项目、工作空间、分支、团队的顺序出现，且工作空间与团队均可展开改选

## Requirement: 验收 #8 工作空间菜单在选择处说明边界
Source: docs/product/pages/main-conversation.md#选择工作空间与团队

系统 MUST 在非 Git 项目的工作空间菜单内禁用“独立工作空间”并显示不可选原因；从默认切到独立前 MUST 说明副本基于当前提交、不包含未提交改动且不会搬走既有改动，从独立切回默认前 MUST 说明后续改动直接落入项目文件夹。系统 MUST NOT 暗示切换会回滚、清理或搬运已经产生的改动。

### Scenario: 非 Git 项目解释独立工作空间不可选
- GIVEN 当前会话的项目文件夹不是 Git 仓库
- WHEN 用户打开工作空间菜单
- THEN “独立工作空间”不可选择，且同一菜单内显示“这个项目文件夹不是 git 仓库，无法隔离改动”

### Scenario: 从默认工作空间切到独立工作空间
- GIVEN 当前会话使用默认工作空间且项目是 Git 仓库
- WHEN 用户选择“独立工作空间”
- THEN 确认界面同时说明当前提交基线、未提交改动不包含、既有项目文件夹改动不搬走

## Requirement: 验收 #20 团队菜单披露创建时载入的快照语义
Source: docs/product/pages/main-conversation.md#上下文

系统 MUST 允许用户从会话团队菜单改选可用团队，并在菜单内说明“这段对话用的是开始时载入的那份团队内容，之后在 Agent 团队页的修改不影响它”。系统 MUST NOT 让用户把 Agent 团队页的后续编辑误认为会自动改变本会话已载入的团队内容。

### Scenario: 打开团队菜单查看绑定语义
- GIVEN 一段会话已绑定一个可用团队
- WHEN 用户打开团队菜单
- THEN 菜单列出可选团队，并显示创建时载入且不随团队页后续修改变化的说明
