# 设计：global-github-interaction-protocol

## 方案

### 协议文档

`docs/protocols/github-interaction.md` 定义四条硬规则：`@` 是控制权移交、`#数字` 只引用真实 issue / PR、role envelope 只能由 runner 发布、人工路由必须带一个合法 mention。每条规则提供正例、反例和合规改写；任务编号使用 `T3`，评论编号使用「第 N 条评论」或完整评论 URL，验收编号使用「验收语句 N」。

### Persona 同步

所有 `agents/*.md` 增加最小引用小节，指向协议文档并列出重点，不复制全文。`agents/ceo.md` 额外新增「GitHub 交互协议违规纠偏」业务场景。

### CEO append-only 纠偏

CEO 只对 `latestResponse` 做本轮待发布正文纠偏，完整 issue context 只辅助理解流程。命中纯提及误写 `@`、多重合法 mention、裸 `#N` 非 issue / PR 编号、手写 role envelope、人工路由缺 mention 时，输出 `append`、`as=ceo`，指出违规点并给出合规写法。保留原文用于审计，不启用 `replace`。

### Mention 解析加固

`src/conversation.ts` 增加内部纯函数，将三反引号 fenced code block 与同行成对 inline backtick 区域覆盖为等长空格，再运行现有 mention 正则。这样返回 index 仍对应原文坐标；未闭合 fenced code block 从围栏起点覆盖到文本结尾。不引入 Markdown parser，不扩展到缩进代码块、HTML 或完整 Markdown 方言。

### 测试

- `tests/conversation.test.ts` 覆盖 inline code、fenced code block、未闭合 fenced code block、代码块后普通 mention 的解析结果和 index。
- `tests/triggers.test.ts` 覆盖最新消息仅含代码块或 inline code mention 时 no-trigger。
- `tests/format-ceo.test.ts` 覆盖 CEO persona 协议规则存在，并构造违规 `latestResponse` 走 append 纠偏路径。

## 权衡

- append-only 保留证据链，放弃直接替换评论的整洁性。
- 单一协议文档降低 persona 漂移风险，放弃单文件完全自包含。
- 轻量 mask 足够覆盖已确认范围，避免新增依赖与完整 Markdown 解析复杂度。
- 运行时只忽略代码区域 mention，不拒绝多 mention；多 mention 由协议与 CEO 纠偏治理，保留现有兼容行为。

## 风险与缓解

- Markdown 边界偏差：通过测试锁定三反引号、inline backtick、未闭合 fence 与 index 契约。
- CEO 误判真实 issue / PR 引用：persona 明确只纠正非 issue / PR 编号语境，真实引用保留。
- persona 同步遗漏：用 `rg -l "github-interaction|交互协议" agents/` 验收。
