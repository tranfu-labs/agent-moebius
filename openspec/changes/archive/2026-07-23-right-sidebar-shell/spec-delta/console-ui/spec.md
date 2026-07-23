# console-ui delta：right-sidebar-shell

本 delta 为 `console-ui` 域新增右侧栏容器与标签条骨架的行为规格。合并时**新增** Requirement，不替换既有条目。

## Requirement: 验收 #1 右侧栏开关与宽度作为全局偏好持久化
Source: docs/product/pages/main-right-sidebar.md#入口与去向

系统 MUST 在没有已保存偏好时默认关闭右侧栏，并在用户改变开关或宽度后跨对话切换及应用重启恢复该值。系统 MUST NOT 让右侧栏开合清空当前会话草稿、改变运行状态或重置会话区滚动位。

### Scenario: 重启后恢复右侧栏工作习惯
- GIVEN 用户已打开右侧栏并把宽度调整为 500 像素
- WHEN 用户切换对话并重启应用
- THEN 右侧栏保持打开且恢复为 500 像素宽

## Requirement: 验收 #2 标签条按对话隔离并跨重启恢复
Source: docs/product/pages/main-right-sidebar.md#入口与去向

系统 MUST 按会话标识分别持久化标签列表与当前标签，并在切换会话或重启应用后恢复目标会话自己的标签条。系统 MUST NOT 把一个会话的标签带到另一个会话，且 MUST NOT 因持久化数据包含未知标签类型而使右侧栏崩溃。

### Scenario: 两个会话恢复各自标签
- GIVEN 会话 A 打开了“改动”和“项目文件”，会话 B 只打开了“改动”
- WHEN 用户从会话 B 切回会话 A 并重启应用
- THEN 会话 A 恢复“改动”和“项目文件”及其原选中项

## Requirement: 验收 #7 非 Git 项目不提供改动类型
Source: docs/product/pages/main-right-sidebar.md#空白标签与类型选择

系统 MUST 在当前项目文件夹不是 Git 仓库时只显示“项目文件”类型，并显示改动不可用的原因。系统 MUST NOT 显示或创建“改动”类型，也 MUST NOT 静默隐藏该类型而不解释。

### Scenario: 非 Git 项目打开空白标签
- GIVEN 当前会话绑定的项目文件夹不是 Git 仓库
- WHEN 用户通过加号打开空白标签
- THEN 类型选择仅有“项目文件”且同时显示不是 Git 仓库的说明

## Requirement: 验收 #15 来源标签去重而手动标签不去重
Source: docs/product/pages/main-right-sidebar.md#标签条

系统 MUST 以来源键去重主对话区打开的标签，重复打开同一来源时聚焦已有标签；系统 MUST 让每次加号操作创建新的空白标签。系统 MUST NOT 因标签类型相同而合并来自不同来源或用户手动创建的标签。

### Scenario: 重复打开同一结果卡片
- GIVEN 结果卡片对应的改动标签已经存在且用户当前位于另一个标签
- WHEN 用户再次点击该结果卡片的“查看”
- THEN 标签总数不变且已有改动标签成为当前标签

## Requirement: 验收 #16 每个标签可关闭且最后一个标签有空白兜底
Source: docs/product/pages/main-right-sidebar.md#关闭标签

系统 MUST 为每个标签提供关闭操作，并在最后一个标签关闭后立即留下一个空白标签且保持右侧栏打开。系统 MUST NOT 因关闭标签而关闭对话、停止推进或取消子任务。

### Scenario: 关闭最后一个标签
- GIVEN 右侧栏已打开且只剩一个标签
- WHEN 用户关闭该标签
- THEN 右侧栏继续显示并包含一个标题为“新标签”的空白标签

## Requirement: 验收 #17 加号只创建两类可选内容
Source: docs/product/pages/main-right-sidebar.md#空白标签与类型选择

系统 MUST 让加号创建一个不参与去重的空白标签，并在 Git 项目中只提供“改动”和“项目文件”两种选择。系统 MUST NOT 在类型选择中出现过程、子任务、终端、预览或浏览器。

### Scenario: Git 项目打开空白标签
- GIVEN 当前会话绑定的是 Git 项目
- WHEN 用户点击标签条加号
- THEN 新空白标签的类型选择恰好包含“改动”和“项目文件”

## Requirement: 验收 #18 空白标签说明受来源约束的内容入口
Source: docs/product/pages/main-right-sidebar.md#空白标签与类型选择

系统 MUST 在空白标签中说明成员完整输出与子任务需要从主对话区点开。系统 MUST NOT 把过程或子任务伪装成缺失的通用类型选择。

### Scenario: 用户查看空白标签说明
- GIVEN 用户已经通过加号创建空白标签
- WHEN 空白标签成为当前标签
- THEN 页面可见文字说明成员完整输出与子任务从主对话区点开

## Requirement: 验收 #19 内容更新不抢占当前标签
Source: docs/product/pages/main-right-sidebar.md#内容更新

系统 MUST 在标签内容或会话状态更新时保留用户当前选中的标签。系统 MUST NOT 因非当前标签出现新内容而自动改变当前标签。

### Scenario: 用户阅读项目文件时会话刷新
- GIVEN 用户当前选中“项目文件”标签且“过程”标签收到新内容
- WHEN 会话状态刷新
- THEN “项目文件”仍为当前标签

## Requirement: 验收 #23 窄窗右侧栏覆盖会话区并恢复滚动位
Source: docs/product/pages/main-right-sidebar.md#窄窗口

系统 MUST 在窗口不足以三栏并排时让右侧栏覆盖会话区，提供独立的关闭并回到会话区操作，并在关闭后恢复打开前的会话区滚动位。系统 MUST NOT 让用户必须依赖被覆盖的主内容按钮才能离开右侧栏。

### Scenario: 窄窗打开并关闭右侧栏
- GIVEN 窄窗口中的会话区滚动位置为 320 像素
- WHEN 用户打开右侧栏并使用覆盖层内的关闭操作
- THEN 右侧栏消失且会话区滚动位置仍为 320 像素
