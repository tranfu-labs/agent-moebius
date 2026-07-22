# console-ui delta：main-conversation-new-page

## Requirement: 验收 1 — 新对话使用主内容页面
Source: docs/product/pages/main-conversation.md#页面目标

系统 MUST 在主内容区显示标题为“新对话”的新对话页面，并把侧边栏顶部“新建对话”入口显示为当前选中。系统 MUST NOT 打开模态弹窗、独立窗口或在侧边栏新增会话行。

### Scenario: 从全局入口进入新对话页
- GIVEN 主页面已有至少一个持久化会话
- WHEN 用户点击侧边栏顶部“新建对话”
- THEN 主内容区显示“新对话”页面且原会话行数量不变

## Requirement: 验收 2 — 未选项目时保持可编辑但禁止发送
Source: docs/product/pages/main-conversation.md#页面状态

系统 MUST 在全局入口进入时保持项目未选择、草稿输入可编辑、团队选择可用，并以内联常驻文字说明不能发送的原因。系统 MUST NOT 猜测第一个项目或上次项目，也 MUST NOT 在未选项目时显示工作区与分支上下文或允许发送。

### Scenario: 无项目的新对话初始态
- GIVEN 至少存在一个可用项目与一支可用团队
- WHEN 用户从侧边栏顶部进入新对话页
- THEN 项目保持未选择、输入框可编辑、发送按钮禁用且页面显示原因文字

## Requirement: 验收 3 — 首次发送后才出现会话
Source: docs/product/pages/main-conversation.md#操作与反馈

系统 MUST 在项目、团队和非空草稿齐备时以一次创建操作提交首条消息，并在成功后选择返回的会话、清除新对话草稿且只新增一个侧边栏会话行。系统 MUST NOT 在创建失败时清除草稿、项目或团队选择，也 MUST NOT 重复提交并发创建。

### Scenario: 首次发送创建并选中会话
- GIVEN 新对话页已选择项目和团队并填有非空草稿
- WHEN 用户点击发送且创建成功
- THEN 侧边栏恰好新增一个会话行并选中该会话

### Scenario: 创建失败保留输入
- GIVEN 新对话页已选择项目和团队并填有非空草稿
- WHEN 创建请求失败
- THEN 草稿、项目和团队选择保持不变且页面显示可读错误

## Requirement: 验收 4 — 项目菜单可添加项目
Source: docs/product/pages/main-conversation.md#操作与反馈

系统 MUST 在 composer 项目菜单列出全部可用项目，并在分隔线后提供“添加项目…”；新项目成功添加后 MUST 立即成为当前新对话项目。系统 MUST NOT 在选择器取消、添加失败或文件夹已绑定活动项目时改变当前选择、清除其他输入或创建重复项目。

### Scenario: 添加项目后立即选中
- GIVEN 新对话页没有选择项目且已填写草稿
- WHEN 用户从项目菜单选择“添加项目…”并在系统选择器中添加新目录成功
- THEN 新项目成为当前项目且原草稿保持不变

### Scenario: 已绑定目录不重复添加
- GIVEN 选择的目录已绑定一个活动项目
- WHEN 用户尝试从新对话页添加该目录
- THEN 当前项目选择保持不变且页面显示目录已被使用

## Requirement: 验收 5 — 创建后标题与项目上下文稳定
Source: docs/product/pages/main-conversation.md#会话内容区

系统 MUST 在首发成功后于主内容区顶部显示由首条消息生成的单行会话标题，长标题 MUST 截断且通过 title 属性暴露全文；有消息的会话 MUST 保持创建时项目归属。系统 MUST NOT 提供标题编辑入口或有消息会话的项目切换控件。

### Scenario: 已有会话显示稳定标题
- GIVEN 首条消息已创建会话且生成标题
- WHEN 用户查看该会话
- THEN 主内容区与侧边栏显示同一标题且项目切换控件不可用

## Requirement: 验收 19 — 草稿按新对话与会话隔离持久化
Source: docs/product/pages/main-conversation.md#草稿隔离与保留

系统 MUST 独立持久化新对话草稿和每个已有会话的草稿，并在跨会话、跨页面、窗口尺寸变化及应用重启后恢复对应草稿。系统 MUST NOT 因离开新对话页、切换已有会话或创建失败而清除草稿；新对话草稿只能在会话创建且新选择已提交后清除。

### Scenario: 新对话草稿跨重启恢复
- GIVEN 新对话页保存了尚未发送的草稿
- WHEN 应用重启后用户再次打开新对话页
- THEN 输入框恢复该新对话草稿且已有会话草稿未被覆盖

### Scenario: 会话草稿互不覆盖
- GIVEN 两个已有会话分别保存了不同未发送草稿
- WHEN 用户在两会话之间往返切换
- THEN 每个会话恢复自己的草稿
