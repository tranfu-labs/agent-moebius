# 设计：global-github-interaction-protocol-t2

## 方案

### 1. 协议文档作为单一事实源

新增 `docs/protocols/github-interaction.md`，文档包含适用范围、核心原则和四条规则。每条规则都必须有正例、反例和合规改写：

- `@` 是控制权移交，不是普通提及。
- `#N` 只用于真实 GitHub issue / PR；任务编号、评论序号、验收语句编号都用文字形式。
- role envelope 是 runner 发布专属，人工评论不得伪造。
- 带路由意图的人工评论必须显式带一个合法 agent mention。

示例使用抽象角色名和 `T3` 任务编号，不引用真实历史 issue，避免协议文档本身制造错误关联。

### 2. Persona 同步

所有 `agents/*.md` 增加一个短小的“GitHub 交互协议”段落，内容只包含硬性遵守声明与链接：写入 issue 时间线时必须遵守 `docs/protocols/github-interaction.md`，不要复制协议全文。`agents/ceo.md` 除最小引用外，额外加入纠偏场景。

### 3. CEO append-only 违规纠偏

在 `agents/ceo.md` 增加“GitHub 交互协议违规”识别场景，作为发布前 guardrail 的 persona 规则，不改 `src/format-ceo.ts` 的业务判断。

CEO 检查 `latestResponse` 是否违反协议：

- 同一条待发布响应内出现多个合法 agent mention，或把纯提及写成可触发 mention。
- 用 `#N` 表达任务编号、评论序号、验收语句编号或其它非真实 issue / PR 编号。
- 要求 loop watcher / 真人补发评论伪装 agent role envelope，或输出看起来像 runner 专属 metadata 的伪装格式。
- 有明确路由意图却没有可触发 mention 的情况，若发生在 agent 指示人工评论怎么写的上下文中，也应指出正确写法。

命中时 CEO 输出 `append`，默认 `as=ceo`。append body 必须自身遵守协议：最多一个合法 agent mention，指出违规点，给出合规改写。T2 不启用 replace，保留原评论以便审计违规来源；代码层现有 replace 能力不因本任务变化。

### 4. Mention 解析忽略反引号代码区域

`src/conversation.ts` 保持 mention trigger 的唯一文本解析入口。实现上在 `parseAgentMentions(text)` 内先对 Markdown 反引号代码区域做等长 mask，再沿用现有正则扫描：

- fenced code block：处理反引号围栏代码块，覆盖多行内容；mask 后不产生 mention。
- inline backtick：处理同一行内的反引号代码片段；mask 后不产生 mention。
- mask 保持字符串长度不变，代码区域外 mention 的 index 仍指向原文位置。
- 不扩展到更多 Markdown 语义，例如链接标题、HTML 注释、blockquote 或波浪线围栏；这些不在 product-manager 确认范围内。

这样改动保持在纯业务函数层，不引入 GitHub、Codex 或文件系统依赖，也不改变 prompt 构造、speaker 归一化或 role thread 状态。

### 5. 测试与验证

补充单元测试：

- `parseAgentMentions` 忽略 inline backtick 内的合法 agent mention。
- `parseAgentMentions` 忽略 fenced code block 内的合法 agent mention。
- 同一文本中代码区域外的合法 mention 仍被解析，且 index 保持原文位置。
- `resolveTrigger` 在最新消息只有代码区域内 mention 时返回 no-trigger。
- `resolveTrigger` 在代码块外出现合法 mention 时仍触发对应 agent。
- `formatCeoComment` fake CEO append 覆盖协议违规纠偏路径；persona 文本合约断言覆盖协议规则落入 `agents/ceo.md`。

## 权衡

- 选择 append-only 而非 replace：保留原违规评论证据链，更符合“发布前兜底与协议纠偏”的审计目标；代价是时间线会多一条 CEO 纠偏评论，但这是可见且可追踪的。
- 选择单一文档 + persona 最小引用：降低多份规则漂移风险；代价是 persona 不再完全自包含，运行时需要通过引用理解细则。
- 选择在 `conversation.ts` mask 代码区域，而不是在 trigger 层另写解析：mention 解析规则集中在一个纯函数入口，测试更直接；代价是 `parseAgentMentions` 本身承担少量 Markdown-aware 预处理。
- 不处理所有 Markdown：本任务只确认 fenced code block 与 inline backtick。链接、quote、HTML 注释等未来若形成误触发，再以独立任务论证，避免扩大 T2 范围。

## 风险

- Markdown code span 语法有复杂边界；本实现只覆盖常见反引号 inline 与 fenced code block。如果未来出现嵌套或异常反引号序列，可能仍需扩展解析。
- Persona 最小引用要求每个 agent 真的读到协议链接；实现时应让段落措辞足够直接，避免只放链接但不声明硬性要求。
- CEO append body 本身若不遵守协议，会制造二次误触发；CEO 规则必须明确 append body 最多一个合法 agent mention，并优先给合规改写。
- 运行时加固会改变现有“代码片段中也能触发”的行为；这是 product-manager 已确认的目标行为，但测试必须保留代码区域外 mention 正常触发，避免过度屏蔽。
