# console-ui delta：main-conversation-workspace-lock

本 delta 修改 `main-conversation-session-context` 交付的两条 Requirement（验收 #5、验收 #8），产品立场已由 PRD 反转。合并时以本文替换 `openspec/specs/console-ui/spec.md` 中的同名 Requirement，NEVER 与旧版并存。

## Requirement: 验收 #5 会话输入区展示四项上下文，只有团队可改选
Source: docs/product/pages/main-conversation.md#上下文

系统 MUST 在输入框上方按“项目 → 工作空间 → 分支 → 团队”的固定顺序展示当前会话上下文；会话已有消息时，项目与工作空间 MUST 渲染为不可点击文本，团队 MUST 仍可展开改选。系统 MUST NOT 为已有消息的会话提供改变工作空间的入口，MUST NOT 提供从独立工作空间切回默认工作空间的路径或对应的确认弹层。

### Scenario: 已开始的对话锁定项目与工作空间
- GIVEN 一段已有消息的会话已经绑定项目、工作空间、分支和团队
- WHEN 用户查看输入区上方的上下文条
- THEN 四项按项目、工作空间、分支、团队的顺序出现；项目与工作空间是不可点击文本，只有团队可展开改选

### Scenario: 产品内不存在切回默认工作空间的路径
- GIVEN 一段会话正在使用独立工作空间
- WHEN 用户在会话页寻找改回默认工作空间的方式
- THEN 页面上不存在该入口，也不出现工作空间切换确认弹层

## Requirement: 验收 #8 工作空间在选择处说明边界
Source: docs/product/pages/main-conversation.md#选择工作空间与团队

系统 MUST 在发出第一条消息之前提供工作空间选择，并在选择“独立工作空间”时说明副本基于项目当前所在的提交、不包含尚未提交的改动；非 Git 项目 MUST 在同一菜单内禁用“独立工作空间”并显示不可选原因。系统 MUST NOT 暗示切换会回滚、清理或搬运已经产生的改动，MUST NOT 在对话已经开始后仍提供该选择。

### Scenario: 新对话页选择独立工作空间
- GIVEN 新对话页已选定一个 Git 项目且尚未发出消息
- WHEN 用户选择“独立工作空间”
- THEN 界面说明副本基于项目当前所在的提交且不包含尚未提交的改动

### Scenario: 非 Git 项目解释独立工作空间不可选
- GIVEN 当前选定的项目文件夹不是 Git 仓库
- WHEN 用户打开工作空间菜单
- THEN “独立工作空间”不可选择，且同一菜单内显示“这个项目文件夹不是 git 仓库，无法隔离改动”
