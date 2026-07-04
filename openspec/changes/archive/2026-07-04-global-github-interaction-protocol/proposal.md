# 提案：global-github-interaction-protocol

## 背景

里程碑 2 T2 要解决 GitHub issue 共享时间线中的协作协议缺口。当前 runner 只检查最新消息中的第一个合法 agent mention；`@` 一旦出现在非代码文本区域，就会被解释为把下一步控制权交给对应 agent。agent 或人工评论把 `@dev` 当普通提及、把裸 `#3` / `#6` 当任务或评论编号、或伪造 runner 专属 role envelope 时，会带来误触发、通知噪音、虚假 issue / PR 关联和 speaker 事实污染。

product-manager 已确认最小闭环：协议文档作为单一事实源；所有 persona 只加最小引用；CEO 采用 append-only 纠偏，不启用 replace；运行时加固纳入范围，仅让 `src/conversation.ts` 的 mention 解析忽略 fenced code block 与 inline backtick 内的 mention，并补测试。QA 审查通过后增补了对四条协议规则完整性、CEO 多 mention / role envelope 纠偏、inline code no-trigger、mask index 契约的验收要求。

## 提案

1. 新增 `docs/protocols/github-interaction.md`，作为 GitHub issue 共享时间线交互协议的单一事实源。
2. 同步所有 `agents/*.md`，只添加最小协议引用；`agents/ceo.md` 额外内嵌 append-only 协议违规纠偏场景。
3. 修改 `src/conversation.ts`：`parseAgentMentions` / `selectMentionedAgent` 忽略 fenced code block 与 inline backtick 内的 `@<agent>`，代码区域外的普通 mention 行为和 index 契约保持不变。
4. 补 `tests/conversation.test.ts`、`tests/triggers.test.ts`、`tests/format-ceo.test.ts` 覆盖协议与运行时加固。
5. 更新事实源：合并 spec-delta 到 `openspec/specs/github-issue-runner/spec.md`，更新 `AGENTS.md`、`docs/architecture/module-map.md` 与里程碑 T2 证据。

## 影响

- 新增：`docs/protocols/github-interaction.md`。
- 修改：`agents/*.md`、`src/conversation.ts`、相关测试、`openspec/specs/github-issue-runner/spec.md`、`AGENTS.md`、`docs/architecture/module-map.md`、`docs/roadmap/milestone-2-stability-oracle.md`。
- 不做：不改 runner 调度、intake、driver pool、GitHub adapter；不新增 stage marker；不启用 CEO `replace` 业务场景；不把协议全文复制到各 persona。

## 验收语句

原验收语句：

1. 打开 `docs/protocols/github-interaction.md` → 应看到 `@` 移交语义与 `#数字` 使用规则，且每条附正例反例。
2. 跑 `rg -l "github-interaction|交互协议" agents/` → 每个 persona 文件均应命中协议引用或内嵌要求。
3. 构造一条含裸 `@dev` 纯提及与 `#3` 任务编号的 agent 响应跑 CEO 校正 → CEO 应介入指出违规并给出合规写法。
4. 构造代码块内 `@dev` 的时间线 → 不应触发 dev。

QA 增补 delta：

1. 打开 `docs/protocols/github-interaction.md` → 四条核心规则均应有正例、反例、合规改写：控制权移交、真实 issue / PR 引用、不得手写 role envelope、人工路由必须显式带一个合法 mention。
2. 构造包含多个合法 mention、裸 `#3` 任务编号、手写 runner role envelope 的 agent 响应跑 CEO 校正 → CEO 应 append-only 指出违规并给出合规写法，不启用 replace。
3. 构造 inline backtick 内 `@dev` 的最新消息 → mention trigger 应 no-trigger。
4. 构造 fenced code block 后普通文本 `@dev` 的消息 → mention trigger 应选择代码区域外的 dev，且 mention index 保持原文位置。
