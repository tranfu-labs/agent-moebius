# github-issue-runner spec delta

## 新增

- MUST 提供 `docs/protocols/github-interaction.md` 作为 GitHub issue 共享时间线交互协议的单一事实源，适用于所有 agent 输出、CEO append、人类评论与 loop watcher 补发评论。
- MUST 让全局 GitHub 交互协议至少覆盖四条规则：`@` 语义等于移交下一步控制权且每条消息最多一个合法 agent mention；裸 `#N` 只用于真实引用 GitHub issue / PR，任务编号、评论编号、验收语句编号与步骤编号不得写成裸 `#N`；runner 专属 role envelope（`<role>:` 可见前缀与 `<!-- moebius:role=... -->` metadata）不得由人工或 loop watcher 手写伪装；带路由意图的人工评论必须显式包含一个合法 agent mention。
- MUST 让全局 GitHub 交互协议为每条规则提供正例、反例与合规改写；任务编号示例 MUST 使用 `T3` 等非 GitHub issue 引用形式，评论位置 MUST 使用「第 N 条评论」或完整评论 URL，验收编号 MUST 使用「验收语句 N」文字形式，避免制造真实 issue / PR 反向引用。
- MUST 让所有 `agents/*.md` persona 引用并遵守 `docs/protocols/github-interaction.md`；persona 文件只做最小引用，MUST NOT 复制协议全文形成多事实源。
- MUST 让 `agents/ceo.md` 承载 GitHub 交互协议违规纠偏场景：当本轮 `latestResponse` 误用 `@` 进行纯提及或多重控制权移交、用裸 `#N` 表达非 issue / PR 编号、试图手写 runner 专属 role envelope，或需要提醒人工路由必须显式带一个合法 mention 时，CEO SHOULD 输出 `append`、`as=ceo`，指出违规点并给出合规写法。
- MUST 让 CEO 的 GitHub 交互协议违规纠偏保持 append-only；`agents/ceo.md` MUST NOT 为本场景启用 `replace`，以保留违规原文作为审计证据。
- MUST 让 `src/conversation.ts` 的 agent mention 解析忽略 fenced code block 与 inline backtick 内的 `@<agent>` 文本；普通文本中的 mention 解析、最早有效 agent 选择和 mention index 契约保持不变。
- MUST 让未闭合 fenced code block 从围栏起点覆盖到文本结尾；其中的 agent mention 不应触发。

## 修改

- 把「MUST 保留 mention trigger：最新消息包含已存在 agent mention 时，触发对应 agent」细化为：最新消息的非代码文本区域包含已存在 agent mention 时触发对应 agent；fenced code block 与 inline backtick 内的 mention 不参与触发。
- 把「MUST 在同一条消息包含多个有效 agent mention 时选择文本中最早出现的一个」细化为：只在非代码文本区域的有效 mention 中选择文本最早出现者；协议层仍要求每条消息最多一个 `@`，多 mention 由 CEO 纠偏而非运行时拒绝。
- 把 `agents/ceo.md` 至少覆盖的识别场景清单扩展一项：GitHub 交互协议违规纠偏，包括 `@` 控制权误移交、裸 `#N` 非 issue / PR 引用、手写 role envelope、人工路由缺 mention 的提醒。

## 场景新增

- 场景：协议文档包含四条核心规则与例子
  Given 开发者打开 `docs/protocols/github-interaction.md`
  Then 文档包含 `@` 控制权移交规则与 `#数字` 真实 issue / PR 引用规则
  And 文档包含 runner 专属 role envelope 规则与人工路由必须带合法 mention 规则
  And 每条核心规则都包含正例、反例与合规改写
- 场景：所有 persona 引用全局协议
  Given 仓库存在 `agents/*.md`
  When 运行 `rg -l "github-interaction|交互协议" agents/`
  Then 每个 persona 文件都被命中
- 场景：CEO append-only 纠正协议违规
  Given `dev` 的 `latestResponse` 把 `@dev` 用作纯提及
  And 同一响应把任务编号写成 `#3`
  When CEO guardrail 处理该响应
  Then CEO 输出 `append`、`as=ceo`
  And append 正文指出 `@` 只能用于控制权移交、任务编号应写成 `T3`
  And CEO MUST NOT 输出 `replace`
- 场景：CEO 纠正评论编号与验收编号的裸 `#N`
  Given agent 响应用 `#6` 指代第 6 条评论
  And 同一响应用 `#1` 指代验收语句编号
  When CEO guardrail 处理该响应
  Then CEO 输出 `append`、`as=ceo`
  And append 正文给出「第 6 条评论」与「验收语句 1」等文字形式改写
- 场景：代码块内 mention 不触发
  Given 最新消息只有 fenced code block 内包含 `@dev`
  When mention trigger 解析最新消息
  Then 系统不选择 `dev`
  And 不调用 Codex driver
- 场景：inline code 内 mention 不触发但普通文本 mention 仍触发
  Given 最新消息包含 inline code `` `@dev` `` 作为示例
  And 同一消息普通文本包含 `@product-manager`
  When mention trigger 解析最新消息
  Then 系统选择 `product-manager`
