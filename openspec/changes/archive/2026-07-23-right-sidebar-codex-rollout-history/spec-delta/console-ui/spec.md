# console-ui delta：right-sidebar-codex-rollout-history

本 delta 修改已归档 `right-sidebar-process-tab` 的过程标签呈现要求，并新增虚拟列表、底部跟随与阅读位置契约。

## Requirement: 过程标签以友好时间线呈现公开输入与执行事件
Source: docs/product/pages/main-right-sidebar.md#过程标签

系统 MUST 把每次执行的公开输入呈现为用户与 Agent 按顺序一来一回的安全 Markdown，并在其后呈现 Agent Markdown、命令、工具 / 函数 / MCP、文件、错误与 unsupported 等结构化过程事件；多次执行 MUST 各自显示「第 N 次执行 / 本轮输入 / 本轮执行过程」。系统 MUST NOT 显示原始 JSON、拼接 prompt、系统指令、persona、团队规则、token 统计或原始 reasoning。

### Scenario: 用户消息经开发经理交给开发
- GIVEN 某次开发 run 启动时公开时间线依次包含用户消息与开发经理交棒
- WHEN 用户打开开发的完整输出
- THEN 本轮输入先按角色显示用户与开发经理消息
- AND 本轮执行过程随后显示开发的 Agent Markdown 与工具事件
- AND 页面不出现开发 persona 或本地团队规则

## Requirement: 首开到底且遵循离底暂停的跟随模型
Source: docs/product/pages/main-right-sidebar.md#内容更新

系统 MUST 在过程标签首次 ready 时定位最新事件；用户位于底部阈值内时新事件 MUST 自动保持在底部，用户向上离开阈值后 MUST 保持阅读位置并累计新内容数量，只有点击「到最新」或手动回到底部才恢复跟随。系统 MUST NOT 在 reading 状态因轮询、事件追加或 Markdown 高度变化抢走位置。

### Scenario: 阅读旧命令时收到三条新事件
- GIVEN 用户已从底部向上滚动并停在一条旧命令
- WHEN 活动 run 追加三条事件
- THEN 旧命令保持相同视口位置
- AND 页面显示三条新内容与到最新入口
- WHEN 用户点击到最新
- THEN 页面滚到最新事件并恢复自动跟随

## Requirement: 上滚分页与虚拟化保持锚点和有界 DOM
Source: docs/product/pages/main-right-sidebar.md#响应式与窗口行为

系统 MUST 仅挂载可视窗口及 overscan 范围内的动态高度事件节点；顶部触发 previous page 后 MUST 以旧首个可见 event key 与像素偏移恢复位置。系统 MUST NOT 让 DOM 节点数随完整 rollout 事件总数线性增长，也不得因插入前页把用户跳到页面顶部或底部。

### Scenario: 十万事件的 rollout
- GIVEN 一个过程投影包含十万条事件
- WHEN 用户从末尾持续向上加载多页
- THEN 用户最终可读到第一条事件
- AND 任一时刻挂载节点数保持在 viewport 与 overscan 的有界范围
- AND 每次插入前页后当前旧事件保持原视口位置

## Requirement: 每个过程标签恢复自己的阅读锚点
Source: docs/product/pages/main-right-sidebar.md#内容更新

系统 MUST 为每个过程标签保存最后阅读 event key、像素偏移与是否跟随最新，并在切换标签、关闭重开和应用重启后尽力恢复；来源重复打开只聚焦已有标签，不重置阅读位置。锚点已不存在时 MAY 回到最新，但 MUST NOT 使用其他标签的位置。

### Scenario: 两个开发过程标签停在不同位置
- GIVEN 「开发」停在历史中部且「开发 2」停在最新
- WHEN 用户切换标签并重启应用
- THEN 两个标签分别恢复各自位置与跟随状态

## Requirement: Codex 记录不可用时只显示明确空态
Source: docs/product/pages/main-right-sidebar.md#codex-过程记录可能不可用

系统 MUST 在过程接口报告关联或 rollout 不可用时显示「Codex 过程记录文件已不可用」并说明最终回复仍在主对话区。系统 MUST NOT 在过程正文中渲染 fallback、stdout tail、stderr tail 或最终 Agent 回复。

### Scenario: 历史 rollout 被清理
- GIVEN 用户从历史 Agent 消息打开过程标签且 Codex rollout 已不存在
- WHEN 加载完成
- THEN 页面显示记录不可用空态
- AND 不显示截断提示、标准输出、错误输出或保留记录区块
