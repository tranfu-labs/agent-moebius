# 提案：ceo-stage-templates-t9

## 背景
里程碑 2 T9 要把 CEO 在 `plan-written` / `code-verified` 阶段的介入从自由发挥式提醒升级为固定模板输出。当前 `agents/ceo.md` 已负责阶段验收回流：`plan-written` 先派 qa 做测试设计审查，`code-verified` 回流给发起需求角色验收实现证据；但追加正文仍偏通用，缺少固定清单约束，容易漏掉模块影响、过度设计、失败路径或执行复盘经验沉淀。

本任务要求不改运行时代码。CEO 的业务判据和正文措辞本来就由 `agents/ceo.md` 承担，因此模板升级应落在 persona 与规格事实源中。

## 提案
采用最小改动方案：把两份固定模板直接写入 `agents/ceo.md` 的「阶段验收回流路由」章节，不新增独立模板文件。

1. **方案评审模板**用于 `plan-written` 且验收语句可用的分支：
   - 保留现有路由：append 以 `ceo` 身份发出，唯一 mention 指向 qa，要求 qa 审查本轮方案。
   - append 正文固定包含六项方案评审清单：模块影响、可行性、核心目标贴合度、过度设计、规范遵守、周全性与鲁棒性。
   - 不直接 mention 发起需求角色，不复用历史 qa 结论。

2. **执行后复盘模板**用于 `code-verified` 且历史方案验收语句可用、发起需求角色可识别为 agent 的分支：
   - 保留现有路由：append 以 `ceo` 身份发出，唯一 mention 指向发起需求角色。
   - append 正文固定包含三项执行后复盘问题：是否符合最初方案设计、是否有方案阶段未考虑的新发现、本次执行是否有值得沉淀的经验。
   - 用裸写 `dev` 表达执行方，避免违反每条消息最多一个合法 mention 的协议。

3. **无剧本场景保留自由判断**：
   - 缺验收语句、qa 交棒兜底、PR 冲突、协议违规、验收治理违规、外部无 mention 兜底等既有场景不套这两份模板。
   - 如果 `plan-written` / `code-verified` 以外的场景没有固定剧本，CEO 仍按既有 guardrail 规则自由判断如何托举流程推进。

4. **验证方式**：
   - 更新 `tests/format-ceo.test.ts`，用 deterministic fake `runCodex` 跑 `formatCeoComment` 的 CEO 校正路径，覆盖 plan-written append 正文包含六项清单且唯一合法 mention 指向 qa，code-verified append 正文包含三问且唯一合法 mention 指向发起需求角色。
   - 增加 persona 文本断言，确保 `agents/ceo.md` 本身包含两份模板和「识别场景 -> 套模板 -> @角色」分发规则。
   - 测试不能只手写一份 fake append body 后断言 parser 通过；必须同时从 `agents/ceo.md` 的固定模板段落与 fake append body 两侧校验同一组固定条目，防止 persona 模板缺项或 fake 输出与模板漂移时测试仍通过。
   - 重出 `plan-written` 时正文同步列出关键方案、测试和边界，避免审查方只能看到时间线摘要而无法读取本地 change 文件时无从审查。

## 影响
- Persona：`agents/ceo.md` 增加两份固定模板和分发规则。
- 事实源：`openspec/specs/github-issue-runner/spec.md` 归档时合入本 change 的 spec delta；`AGENTS.md` 同步 CEO 阶段模板规则。
- 测试：`tests/format-ceo.test.ts` 增加 CEO 阶段模板验收测试。
- 运行时代码：不修改 `src/`；`format-ceo.ts` 继续只做 JSON / role / stage 等格式红线校验，不承载模板业务判据。
