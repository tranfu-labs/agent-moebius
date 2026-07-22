# console-ui delta：main-conversation-timeline-truth

## Requirement: #10 时间线不显示过程状态
Source: docs/product/pages/main-conversation.md#区域与信息

系统 MUST 只把对话内容和最终事实放入时间线，并让消息时间仅在悬停或聚焦时显示。系统 MUST NOT 显示「已交棒」「已完成」「运行中」「未开始」等过程标签、过程图标或汇总计数条。

### Scenario: 已结束的步骤只留下对话
- GIVEN 一个成员已经完成当前步骤
- WHEN 用户查看该步骤的历史记录
- THEN 记录中没有过程标签、过程图标、操作条或常驻时间

## Requirement: #11 运行操作条只属于当前步骤
Source: docs/product/pages/main-conversation.md#区域与信息

系统 MUST 在成员工作时实时展示输出并在末尾提供「停下」。系统 MUST NOT 显示计时，且步骤结束后 MUST NOT 在历史中保留操作条。

### Scenario: 当前步骤结束
- GIVEN 时间线正在展示一个成员的实时输出和「停下」
- WHEN 该步骤结束
- THEN 实时操作条整体消失且历史记录中没有计时或停下按钮

## Requirement: #12 四种事实由持久化类型驱动
Source: docs/product/pages/main-conversation.md#区域与信息

系统 MUST 按事件类型分别呈现没跑起来、卡住、用户按停和反复重试仍未成功；没跑起来与卡住 MUST 提供「重试」，另两种 MUST NOT 提供。系统 MUST NOT 把用户按停写成失败或暗示文件改动会被撤销。

### Scenario: 重启后仍可辨认四种事实
- GIVEN 一段对话已经持久化四种事件类型
- WHEN 页面刷新或桌面应用重启后重新打开该对话
- THEN 四种事实仍分别可见且只有没跑起来和卡住带「重试」

## Requirement: #13 所有对话文本过滤机器信息
Source: docs/product/pages/main-conversation.md#指标与验收

系统 MUST 过滤 Agent 正文、运行步骤标题、实时摘要和系统记录中的路径、cwd、runDir、数据库路径及内部 id。系统 MUST NOT 过滤项目修复确认框中由用户亲自选择的文件夹路径。

### Scenario: Agent 输出绝对路径
- GIVEN Agent 正文和步骤标题包含绝对路径与内部运行 id
- WHEN 时间线渲染这些文本
- THEN 用户只能看到替代文案而看不到路径或内部 id

## Requirement: #16 状态点只取确定事实
Source: docs/product/pages/main-conversation.md#操作与反馈

系统 MUST 按红大于蓝大于闪的优先级派生状态点：红点来自三种未处理异常或三种不可继续状态，蓝点来自无人工作、最后消息未提及成员且结果未读，闪点来自成员正在工作。系统 MUST NOT 以用户按停、正常完成、最后消息已提及成员或旧「等人回话」字段触发红点或蓝点；每个红点 MUST 对应时间线中的可读系统记录。

### Scenario: 停下不会召回用户
- GIVEN 用户按停后没有其他异常且最后结果已查看
- WHEN 侧边栏渲染该会话和所属项目
- THEN 会话行与项目聚合行都不显示红点

## Requirement: #17 三种不可继续状态共用只读表现
Source: docs/product/pages/main-conversation.md#三种不可继续状态的共同规则

系统 MUST 对项目文件夹不可用、团队已删除、团队需要修复统一禁用输入和发送、保持历史只读并标红对应上下文控件。系统 MUST NOT 混淆三种原因或恢复动作，恢复条件满足后 MUST 恢复输入能力。

### Scenario: 已删除团队改选后恢复
- GIVEN 当前团队已删除且对话处于只读态
- WHEN 用户改选一支可用团队
- THEN 输入与发送恢复且既有时间线保持不变
