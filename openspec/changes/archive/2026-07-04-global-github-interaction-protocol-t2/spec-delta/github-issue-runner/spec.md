# github-issue-runner spec delta

## 新增

- MUST 提供 `docs/protocols/github-interaction.md` 作为 GitHub issue 共享时间线交互协议的单一事实源。
- MUST 让 GitHub 交互协议至少覆盖：agent mention 语义为移交控制权且每条消息最多一个；`#N` 只用于真实 GitHub issue / PR 引用、任务编号使用 `T3` 形式、评论序号使用「第 N 条评论」或完整评论 URL、验收语句编号使用「验收语句 N」；runner 的 role envelope 仅由 runner 发布，人工评论不得伪装；带路由意图的人工评论必须显式带一个合法 agent mention 才能唤醒角色。
- MUST 在协议文档中为每条规则提供正例、反例与合规改写，示例 SHOULD 使用抽象角色与任务编号，避免引用真实历史 issue 制造误关联。
- MUST 让所有 `agents/*.md` persona 明确引用并遵守 `docs/protocols/github-interaction.md`；persona 文件 SHOULD 只做最小引用与硬性遵守声明，不复制协议全文。
- MUST 让 `agents/ceo.md` 承载 GitHub 交互协议违规纠偏规则：当待发布 agent 响应违反协议时，CEO MUST 使用 `append` 指出违规点并给出合规写法；本协议纠偏场景 MUST NOT 要求 CEO 使用 `replace`。
- MUST 让 CEO 的协议纠偏 append body 自身遵守 GitHub 交互协议：最多一个合法 agent mention，不使用 `#N` 表达非 issue / PR 编号，不伪造 runner role envelope。
- MUST 让 `src/conversation.ts` 的 `parseAgentMentions` 忽略 fenced code block 与 inline backtick 内的 agent mention；代码区域外的 mention 解析与选中顺序保持既有行为，解析 index MUST 保持为原文位置。
- MUST 保持 mention 解析为纯业务数据操作，不因代码区域屏蔽引入 GitHub、Codex CLI、文件系统或 runner 状态依赖。

## 场景新增

- 场景：协议文档定义控制权移交规则
  Given 仓库包含 `docs/protocols/github-interaction.md`
  When 读取该文档
  Then 文档说明 agent mention 只用于移交控制权
  And 每条消息最多一个 agent mention
  And 纯提及应裸写角色名
  And 该规则包含正例、反例与合规改写。

- 场景：协议文档定义 `#N` 规则
  Given 仓库包含 `docs/protocols/github-interaction.md`
  When 读取该文档
  Then 文档说明 `#N` 只用于真实 GitHub issue / PR 引用
  And 文档要求任务编号使用 `T3` 形式
  And 文档要求评论序号和验收语句编号使用文字形式或完整评论 URL
  And 该规则包含正例、反例与合规改写。

- 场景：所有 persona 引用交互协议
  Given 仓库存在多个 `agents/*.md` persona 文件
  When 搜索 `github-interaction` 或 `交互协议`
  Then 每个 persona 文件均能命中协议引用或内嵌要求。

- 场景：CEO append-only 纠正协议违规
  Given 某 agent 的 `latestResponse` 把纯提及写成可触发 agent mention
  And 同一响应用 `#N` 表达任务编号、评论序号或验收语句编号
  And 响应包含手写 role envelope 示例
  When CEO guardrail 处理该响应
  Then CEO 输出 `append`
  And append body 指出这些协议违规
  And append body 给出裸写角色名、`T3` 任务编号、「第 N 条评论」和「验收语句 N」形式的合规写法
  And CEO 不要求使用 `replace` 改写原响应。

- 场景：inline backtick 内 mention 不触发
  Given 最新时间线消息只在 inline backtick 内包含合法 agent mention
  When mention trigger 解析最新消息
  Then 系统返回 no-trigger
  And 不调用该 agent 的 Codex driver。

- 场景：fenced code block 内 mention 不触发
  Given 最新时间线消息只在 fenced code block 内包含合法 agent mention
  When mention trigger 解析最新消息
  Then 系统返回 no-trigger
  And 不调用该 agent 的 Codex driver。

- 场景：代码区域外 mention 仍触发
  Given 最新时间线消息在代码区域外包含合法 agent mention
  When mention trigger 解析最新消息
  Then 系统仍选择最早出现的合法 agent mention
  And 解析出的 mention index 对应原文位置
  And 按既有 mention trigger 路径调用对应 agent。
