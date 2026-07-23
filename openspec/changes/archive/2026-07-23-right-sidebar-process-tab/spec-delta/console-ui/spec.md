# console-ui delta：right-sidebar-process-tab

本 delta 为 `console-ui` 域新增过程标签渲染。以下 Requirement 均为新增条目。

## Requirement: 验收 #12 — 过程标签呈现留存的原始输出、原始错误与截断状态
Source: docs/product/pages/main-right-sidebar.md#过程标签

系统 MUST 在用户从某成员步骤点击「完整输出」后打开过程标签，并逐字呈现接口返回的 stdout、stderr 与文件路径；任一输出发生留存截断时，系统 MUST 显示可见的「此处已截断」提示。系统 MUST NOT 使用 Markdown 渲染、`sanitizeMachineText` 或摘要替换过程输出。

### Scenario: 查看包含错误且已截断的步骤输出
- GIVEN 某成员步骤的过程输出包含 stderr、文件路径且 stderr 标记为已截断
- WHEN 用户点击该步骤的「完整输出」
- THEN 右侧过程标签显示原始 stderr、原始文件路径和「此处已截断」提示

## Requirement: 验收 #13 — 过程标签标题只由成员名和同成员序号组成
Source: docs/product/pages/main-right-sidebar.md#标签条

系统 MUST 使用步骤意图的 role 到成员名映射作为过程标签标题，同一会话内同时打开的同成员第二个及以后过程标签 MUST 依次命名为「成员名 2」「成员名 3」；无法映射 role 时 MUST 使用「成员未知」，标签文字溢出时 MUST 截断显示并由 `title` 提供完整标题。系统 MUST NOT 从步骤正文、摘要或实时输出生成描述性标题。

### Scenario: 同一成员打开两个不同步骤
- GIVEN 同一会话中开发成员有两个不同 run 输出入口
- WHEN 用户依次点击两个入口的「完整输出」
- THEN 标签条同时出现「开发」与「开发 2」，且二者标题均不包含步骤正文

## Requirement: 验收 #14 — 同一步骤的每次执行在一个过程标签内按序保留
Source: docs/product/pages/main-right-sidebar.md#过程标签

系统 MUST 在同一过程标签内按开始时间显示同一步骤的全部执行，并以「第 1 次执行」「第 2 次执行」连续编号；活动过程标签 MUST 持续轮询，因此某次执行已 settled、下一次 retry 尚未开始的间隙也不得停止更新，执行结束后的已有分段 MUST 继续可见。系统 MUST NOT 用后一次执行覆盖前一次执行。

### Scenario: 失败后重试同一步骤
- GIVEN 某步骤第一次执行失败并产生原始错误，第二次执行随后成功
- WHEN 用户查看该步骤的过程标签
- THEN 标签内先显示含原始错误的「第 1 次执行」，再显示「第 2 次执行」

## Requirement: 验收 #22 — 过程标签为只读且原文可选择复制
Source: docs/product/pages/main-right-sidebar.md#过程标签

系统 MUST 以可选择的纯文本区域显示过程输出和文件路径，并在原始文件丢失与空输出时分别显示「原始输出已不可用」和「这一步没有产生输出」；过程标签 MUST NOT 提供文本框、编辑、提交或其他写操作。

### Scenario: 原始文件在应用重启前后被清理
- GIVEN 某次执行的 runDir 已不存在但会话事实保留 fallback
- WHEN 用户在过程标签查看该次执行
- THEN 标签显示「原始输出已不可用」及可选择的 fallback，且不显示任何编辑控件
