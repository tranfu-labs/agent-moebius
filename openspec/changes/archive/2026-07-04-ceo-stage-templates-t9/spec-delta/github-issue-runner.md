# github-issue-runner spec delta

## 新增
- MUST 让 `agents/ceo.md` 在 `plan-written` / `code-verified` 阶段验收回流中执行固定分发顺序：先识别 stage 与可用验收语句，再按场景套固定模板，最后只 mention 对应角色；缺验收语句、qa 交棒兜底、协议违规、验收治理违规、PR 冲突、死锁等待、外部无 mention 兜底等非阶段模板场景 MUST 继续按各自既有规则处理。
- MUST 让 `plan-written` 且验收语句可用的 CEO append 正文套用“方案评审模板”，并保持现有路由：唯一合法 mention 指向 `@qa`，不得直接 mention 发起需求角色，不得复用历史 qa 结论。
- MUST 让“方案评审模板”固定包含六项清单：对其他模块的影响（依赖边界 / module-map）、可行性（技术路径是否已验证或有先例）、核心目标贴合度（防跑偏）、过度设计（能否更小）、现有规范遵守（OpenSpec / AGENTS.md / GitHub 交互协议 / 验收治理）、周全性与鲁棒性（意外情况 / 失败路径 / 边界条件）。
- MUST 让 `code-verified` 且历史方案验收语句可用、发起需求者是可触发 agent 的 CEO append 正文套用“执行后复盘模板”，并保持现有路由：唯一合法 mention 指向发起需求角色；若发起者是真人用户而非 agent，仍输出 `no_change`。
- MUST 让“执行后复盘模板”固定包含三问：实现是否符合方案最初设计且偏差逐条列出；有无方案当时没考虑到且应该调整的新发现，并回流为后续任务或规范修订；本次执行有无值得沉淀到规范、persona 或文档的新经验。
- MUST 在执行后复盘模板中用裸写 `dev` 指代执行方，MUST NOT 为了“提醒验收方与执行方”而在同一 append 正文中加入第二个 agent mention。
- MUST 保留 CEO 对无剧本场景的自由判断能力：当场景不属于 `plan-written` / `code-verified` 固定模板分支时，CEO 仍按 `agents/ceo.md` 的其他 guardrail 场景输出 `no_change` 或 append。
- MUST 让 CEO 阶段模板测试同时校验 persona 固定模板段落与 fake CEO append body 中的条目标签，避免 `agents/ceo.md` 模板缺项或 fake append body 与模板段落漂移时测试仍通过。

## 修改
- MUST 让 `agents/ceo.md` 的阶段验收回流描述从通用“要求审查 / 验收”升级为固定模板输出；运行时代码仍只做 JSON shape、append role、replace stage marker 与非空 body 等格式红线校验，MUST NOT 在 TypeScript 层硬编码模板内容或业务判据。

## 场景
### 场景：plan-written 使用方案评审模板
Given dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾含 `<!-- moebius:stage=plan-written -->`
And `${LAST_RESPONSE}` 的最终 stage marker 前包含「验收语句」小节
And 「验收语句」小节内包含逐条、可机械执行的检查
When runner 在 `postComment` 之前调用 CEO guardrail
Then `agents/ceo.md` MUST 要求 CEO 返回 `append`、`as=ceo`
And append body MUST mention `@qa`
And append body MUST 包含方案评审模板六项：对其他模块的影响、可行性、核心目标贴合度、过度设计、现有规范遵守、周全性与鲁棒性
And append body MUST NOT mention 发起需求角色
And append body MUST 只有一个合法 agent mention

### 场景：code-verified 使用执行后复盘模板
Given dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾含 `<!-- moebius:stage=code-verified -->`
And 完整公开 issue context 中存在一条历史 dev `plan-written` 方案
And 该方案包含「验收语句」小节与逐条、可机械执行的检查
And 完整公开 issue context 明确写明发起本需求角色是 `product-manager`
When runner 在 `postComment` 之前调用 CEO guardrail
Then `agents/ceo.md` MUST 要求 CEO 返回 `append`、`as=ceo`
And append body MUST mention `@product-manager`
And append body MUST 包含执行后复盘三问：实现是否符合方案最初设计、有无方案当时没考虑到的新发现、本次执行有无新经验值得沉淀
And append body MUST 用裸写 `dev` 指代执行方，不得出现第二个合法 agent mention

### 场景：CEO 阶段模板测试防止模板与 fake 输出漂移
Given `agents/ceo.md` 包含方案评审模板与执行后复盘模板的固定段落
And `tests/format-ceo.test.ts` 使用 fake CEO append output 跑 `formatCeoComment`
When 方案评审模板六项任一项在 `agents/ceo.md` 中缺失
Then `pnpm vitest run tests/format-ceo.test.ts` MUST 失败
When fake append body 与 `agents/ceo.md` 对应模板段落的条目标签不一致
Then `pnpm vitest run tests/format-ceo.test.ts` MUST 失败

### 场景：阶段模板不覆盖缺验收语句分支
Given dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾含 `<!-- moebius:stage=plan-written -->`
And `${LAST_RESPONSE}` 没有可用「验收语句」清单
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO MUST 继续按既有缺验收语句规则 append mention `@dev` 要求补齐
And CEO MUST NOT 套方案评审模板要求 qa 审查不可验收的方案
