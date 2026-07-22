# console-ui spec delta：main-conversation-streamdown-markdown

## ADDED Requirements

### Requirement: 用户与 Agent 使用同一套安全 Markdown renderer
Source: docs/product/pages/main-conversation.md#时间线

系统 MUST 用共享 Streamdown renderer 呈现用户与 Agent 正文：已完成消息使用 static mode，活动 run 使用 streaming mode。系统 MUST 支持基础 Markdown、GFM 表格/任务列表/删除线/自动链接/脚注、CJK 友好解析、Shiki 代码高亮、KaTeX 数学与 Mermaid 图。系统事实、失败、卡住、中断、子会话和结果卡片 MUST 继续使用结构化组件，MUST NOT 因正文含 Markdown 标记而被重新解释。

#### Scenario: 同一时间线混合静态与活动 Markdown
- GIVEN 时间线有一条用户 Markdown、一条已完成 Agent Markdown、一个当前活动 run 和一条系统失败事实
- WHEN operator console 渲染
- THEN 用户与 Agent 正文按完整语法呈现且活动 run 使用 streaming mode
- AND 系统失败事实仍按其结构化组件与恢复动作呈现

### Requirement: 流式更新不增加时间线行
Source: docs/product/pages/main-conversation.md#时间线

系统 MUST 以 `runId` 稳定呈现至多一个活动 run 节点，后续 `liveMarkdown` MUST 原地替换该节点内容，MUST NOT 插入虚拟 message。run 完成后活动节点 MUST 消失并由最终持久化 Agent 消息接管，最终正文 MUST NOT 同时显示两份。历史消息 MUST 使用 static mode 且 MUST NOT 在重开会话时重新播放流式动画。

#### Scenario: 活动段切换为最终消息
- GIVEN 同一 run 已依次收到两段可见 Markdown
- WHEN renderer 先 refresh 活动 snapshot、再 refresh 已完成 snapshot
- THEN 活动阶段始终只有一条 run 行且显示最新段
- AND 完成阶段只显示一条最终 Agent 消息

### Requirement: Markdown 丰富内容服从会话布局与可访问性
Source: docs/product/pages/main-conversation.md#时间线

系统 MUST 让表格和 fenced code 在自身容器横向滚动、图片按时间线宽度等比收敛，并让标题层级、段落、列表、引用、代码与公式服从现有 console-ui 令牌。复制、下载、链接确认和 Mermaid 控件 MUST 可由键盘操作；昂贵的 Mermaid 渲染 MUST 等代码 fence 闭合后再执行。活动动画 MUST 只作用于当前 run。

#### Scenario: 窄时间线包含宽表格和 Mermaid
- GIVEN 760px 或更窄的时间线正在显示宽表格、代码块和未闭合 Mermaid
- WHEN Markdown 处于 streaming mode
- THEN 页面宽度不被内容撑开且表格/代码自身可滚动
- AND Mermaid 在 fence 闭合前不执行图表渲染

### Requirement: Markdown URL 与 HTML 显式收紧
Source: docs/product/pages/main-conversation.md#时间线

系统 MUST 清洗 raw HTML 并阻止 script、iframe、事件属性和危险节点。链接 MUST 只允许 `http`、`https`、`mailto`，图片 MUST 只允许 `http`、`https`，并 MUST 禁止 data image、本地文件、JavaScript 与自定义协议。外链 MUST 经确认并通过宿主回调打开；没有宿主回调时 MUST NOT 直接导航。Mermaid MUST 使用 strict security。

#### Scenario: 恶意 Markdown 不越过 renderer
- GIVEN 用户或 Agent 正文包含 script、onclick、javascript link、data image、file URL 与一个合法 HTTPS 链接
- WHEN Markdown 渲染并发生点击
- THEN 危险内容不可执行且不能导航或读取本地文件
- AND 只有合法链接能进入确认与宿主回调
