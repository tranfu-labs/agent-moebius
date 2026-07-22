# console-ui delta：main-conversation-subsession-cards

## Requirement: 子会话以时间线卡片呈现且不进入侧边栏
Source: docs/product/pages/main-conversation.md#子会话卡片

系统 MUST 在父会话时间线的拆分锚点处呈现子会话卡片，每行 MUST 显示子任务标题、负责成员和运行时给出的当前状态，且整行可打开对应子会话。系统 MUST NOT 在侧边栏呈现带父会话的会话、lineage 文案或由界面自行推导的子任务状态。

### Scenario: 拆分结果只有一个聚合入口
- GIVEN 父会话已拆出两个状态不同的子会话
- WHEN 主会话页同时呈现时间线和侧边栏
- THEN 时间线卡片含两行任务、成员、状态，侧边栏只含父会话

## Requirement: 子会话在右侧展开区外壳中打开
Source: docs/product/pages/main-conversation.md#子会话卡片

系统 MUST 在宽窗口右侧打开所选子会话、标记所选卡片行、保持父会话及其输入框可达，并在关闭后恢复打开前的父时间线滚动位置。系统 MUST NOT 在本外壳中新增输入方式或操作集。

### Scenario: 父会话更新后关闭展开区
- GIVEN 用户从父时间线中部打开了一个子会话
- WHEN 展开期间父会话收到新消息且用户关闭展开区
- THEN 父会话仍显示在打开前的滚动位置，展开区内只复用既有会话视图

## Requirement: 窄窗按固定顺序收敛会话上下文
Source: docs/product/pages/main-conversation.md#响应式与窗口行为

系统 MUST 在窗口变窄时按分支、工作空间、团队、项目的顺序逐项隐藏上下文，并让子会话展开区覆盖整个主内容区。系统 MUST NOT 在团队或项目仍需显示的宽度先隐藏它们而保留分支或工作空间。

### Scenario: 从宽窗缩到最窄
- GIVEN 会话上下文在宽窗显示项目、工作空间、分支、团队
- WHEN 窗口依次跨过每个收敛阈值
- THEN 可见项依次变为项目工作空间团队、项目团队、仅项目、全部隐藏，子会话展开区在窄窗为全覆盖

## Requirement: 父时间线保持可控跟随
Source: docs/product/pages/main-conversation.md#响应式与窗口行为

系统 MUST 只把时间线作为页面主要滚动区域；用户位于底部时 MUST 跟随新内容，用户向上翻阅时 MUST 保持位置并提供回到底部入口，可见的代码或命令输出 MUST 在自身容器内横向滚动。系统 MUST NOT 让长文本或命令输出撑宽页面，也 MUST NOT 让分栏遮断页面标题和父会话输入框。

### Scenario: 向上阅读时收到新内容
- GIVEN 用户已离开父时间线底部
- WHEN 父会话出现新内容
- THEN 时间线保持用户当前阅读位置并显示回到底部入口
