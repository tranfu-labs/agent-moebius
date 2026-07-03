# 提案：route-ceo-stage-acceptance-feedback

## 背景
里程碑 1 T1 已要求 `dev` 在 `plan-written` 方案末尾输出「验收语句」清单。T2 要把 CEO 对 `plan-written` / `code-verified` 的强制 append 从通用阶段反思升级为验收闭环：当方案或实现完成时，CEO 应把验收工作回流给发起本需求的 agent 角色，而不是继续让 `@dev` 做泛泛反思。

当前 `agents/ceo.md` 的“阶段反思强制介入”只要求 CEO 追加一条评论艾特刚进入阶段的 agent，通常是 `@dev`，要求其反思、纠偏或继续推进。这会导致两个问题：

- 已有验收语句时，验收责任没有回到 product-manager / hermes-user 等需求发起角色。
- dev 方案缺少验收语句时，CEO 没有明确要求先补齐清单，可能把不可验收的方案错误交给验收角色。

## 提案
修改 `agents/ceo.md` 的阶段规则，把“阶段反思强制介入”改为“阶段验收回流路由”：

- `latestResponse` 尾部 stage marker 为 `plan-written` 或 `code-verified` 时，CEO 先检查可用的「验收语句」清单。
- `plan-written` 检查本轮 `latestResponse` 是否包含「验收语句」小节，且小节内有逐条、可机械执行的检查。
- `code-verified` 优先使用历史已确认方案中的「验收语句」；若找不到可用清单，也要求 dev 补齐。
- 缺少可用验收语句时，CEO `append as=ceo`，正文 mention `@dev`，要求补齐验收语句，不回流给验收角色。
- 找到可用验收语句时，CEO 从完整公开 issue context 中识别发起本需求的 agent 角色；若发起者是可达 agent，则 `append as=ceo`，正文 mention 该发起角色，要求其按验收语句逐条验收。
- 若发起者是真人用户而非 agent 角色，CEO 输出 `no_change`，维持现有等真人用户验收的行为。
- 不改 `src/format-ceo.ts`；所有业务判据继续留在 `agents/ceo.md` persona 层。

同步：

- `openspec/changes/route-ceo-stage-acceptance-feedback/spec-delta/github-issue-runner.md`
- `AGENTS.md` 中 CEO 阶段承接描述
- `tests/format-ceo.test.ts` persona contract / fake CEO output 测试

## 影响
- 受影响模块：`agents/ceo.md`、`tests/format-ceo.test.ts`、`AGENTS.md`。
- 受影响事实源：`openspec/specs/github-issue-runner/spec.md`（归档时合入）。
- 不改 `src/` 运行时代码，不改变 `format-ceo.ts` 的 JSON 解析、后置校验或 fail-open 行为。
- 不新增真实 Codex / GitHub 调用测试；自动化测试使用 fake CEO output 验证 runner 允许的 append 形态与 persona 文本合约。
