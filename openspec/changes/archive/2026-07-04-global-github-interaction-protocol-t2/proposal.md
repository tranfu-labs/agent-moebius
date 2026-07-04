# 提案：global-github-interaction-protocol-t2

## 背景

里程碑 2 T2 要求把 GitHub issue 共享时间线中的交互规则固化为单一事实源，避免 agent 与真人评论误用 `@`、`#N` 和 role envelope，造成错误唤醒、通知噪音、假关联、speaker 事实污染和 driver 名额浪费。

当前系统已有 mention trigger、speaker 归一化、CEO 发布前 guardrail 与 persona 层协作约定，但规则分散在 agent 文本、spec 与 issue 经验里。最新 `docs/roadmap/milestone-2-stability-oracle.md` 已进一步明确：`#N` 只用于真实 issue / PR；任务编号、时间线评论序号和验收语句编号都不得写成裸 `#N`。

product-manager 已确认本任务按范围最小闭环执行：CEO 违规纠偏采用 append-only，不启用 replace；运行时加固纳入本任务，范围只限 `src/conversation.ts` 的 mention 解析忽略 fenced code block 与 inline backtick 内的合法 agent mention，并补对应测试；persona 只最小引用协议事实源，CEO 额外内嵌纠正规则；示例使用抽象角色与 `T3` 编号，不引用真实历史 issue。QA 增补 delta 已经由 product-manager 验收通过并并入最终验收清单。

## 提案

本变更新增全局 GitHub 交互协议，并让 persona、CEO guardrail 与 mention trigger 共同遵守：

1. 新增 `docs/protocols/github-interaction.md` 作为单一事实源，覆盖四条协议：
   - `@` 语义 = 移交控制权；每条消息最多一个，只在明确交棒下一步时使用，纯提及裸写角色名。
   - `#N` 只用于真实 GitHub issue / PR 引用；任务编号使用 `T3` 形式，评论序号写「第 N 条评论」，验收语句编号写「验收语句 N」。
   - role envelope 仅由 runner 发布；loop watcher 与真人补发评论必须用自己身份平文发言，不得伪装 agent 格式。
   - 带路由意图的人工评论必须显式带一个合法 agent mention，否则不会唤醒任何角色。
   每条规则都写正例、反例与合规改写。
2. 所有 `agents/*.md` 增加最小协议引用与遵守要求，不复制全文，避免多份事实源漂移。
3. `agents/ceo.md` 增加 append-only 违规纠偏规则：发现待发布 agent 响应违反协议时，保留原响应，追加一条 CEO 评论指出违规点并给出合规写法；本任务不启用 replace。
4. `src/conversation.ts` 的 mention 解析在运行时忽略 fenced code block 与 inline backtick 内的合法 agent mention；补充 `tests/conversation.test.ts` 与 `tests/triggers.test.ts`，证明代码区域内 mention 不触发，代码区域外仍按既有规则触发且 index 保持原文位置。
5. 实现完成后归档本 change，把 spec-delta 合回 `openspec/specs/github-issue-runner/spec.md`，把验收证据追记到 `docs/roadmap/milestone-2-stability-oracle.md` 的 T2 下方并勾选。

## 影响

- 文档：新增 `docs/protocols/github-interaction.md`。
- Persona：同步 `agents/*.md` 的协议引用；`agents/ceo.md` 额外增加 append-only 违规纠偏规则。
- 运行时纯业务模块：最小改动 `src/conversation.ts` 的 mention 解析；不改 runner、GitHub adapter、Codex adapter、intake 状态机或 driver pool。
- 测试：更新 `tests/conversation.test.ts`、`tests/triggers.test.ts` 与 `tests/format-ceo.test.ts`。
- OpenSpec / roadmap：新增本 change 的 spec-delta；实现完成后回流到 `openspec/specs/github-issue-runner/spec.md` 并更新 M2 T2 验收证据。

## 验收语句

### Roadmap 原验收语句

1. 打开 `docs/protocols/github-interaction.md` → 应看到 `@` 移交语义与 `#数字` 使用规则，且每条附正例反例。
2. 跑 `rg -l "github-interaction|交互协议" agents/` → 每个 persona 文件均应命中协议引用或内嵌要求。
3. 构造一条含裸 `@dev` 纯提及与 `#3` 任务编号的 agent 响应跑 CEO 校正 → CEO 应介入指出违规并给出合规写法。
4. 构造一条用 `#6` 指代第 6 条评论、`#1` 指代验收语句编号的 agent 响应跑 CEO 校正 → CEO 应指出 `#N` 误用并给出文字形式改写（「第 6 条评论」/「验收语句 1」或完整评论 URL）。
5. （若做运行时加固）构造代码块内 `@dev` 的时间线 → 不应触发 dev。

### QA 增补验收语句

1. 打开 `docs/protocols/github-interaction.md` → 四条核心规则（控制权移交、真实 issue / PR 引用、不得手写 role envelope、人工路由必须显式带一个合法 mention）均应包含正例、反例与合规改写。
2. 构造包含多个合法 agent mention、裸 `#3` 任务编号、手写 role envelope 的 agent 响应跑 CEO 校正 → CEO 应 append 指出违规并给出合规写法，不启用 replace。
3. 构造 inline backtick 内 `@dev` 的最新消息跑 mention trigger → 应返回 no-trigger，不调用 dev。
4. 构造 fenced code block 内 `@dev` 后、代码块外另有合法 agent mention 的最新消息跑 mention trigger → 应触发代码块外的 agent，且解析出的 index 保持原文位置。
