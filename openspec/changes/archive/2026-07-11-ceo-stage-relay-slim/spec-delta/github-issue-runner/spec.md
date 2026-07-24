# github-issue-runner delta：ceo-stage-relay-slim

说明：本文件保留为项目级 `spec-delta/` 路径；OpenSpec CLI 可验证版本同步写在 `openspec/changes/ceo-stage-relay-slim/specs/github-issue-runner/spec.md`。两者语义保持一致。

归档合并指引：本 delta 作用于 `openspec/specs/github-issue-runner/spec.md` 的阶段验收回流条目（现第 130-135 行一带）与 `agents/product-manager.md` 验收职责条目（现第 270 行一带）。

## MODIFIED Requirements

### Requirement: 阶段验收回流轻交棒

（替换原「固定分发顺序 / 套固定模板」与「方案评审模板」「执行后复盘模板」四条 MUST；触发入口条目——stage marker 判定、验收语句检查、路由目标、真人发起者 `no_change` 分支、qa 幂等重审——保持原文不动。）

- MUST 让 `agents/ceo.md` 在 `plan-written` / `code-verified` 阶段验收回流中执行固定分发顺序：先识别 stage 与可用「验收语句」，再输出**一行轻交棒正文**，最后只 mention 对应角色；缺验收语句、qa 交棒兜底、协议违规、验收治理违规、PR 冲突、死锁等待、外部无 mention 兜底等非阶段场景 MUST 继续按各自既有规则处理。
- MUST 让 `plan-written` 且验收语句可用的 CEO append 正文为一行轻交棒：陈述 stage 事实并请 `@qa` 按其自身测试设计流程审查；路由约束不变——唯一合法 mention 指向 `@qa`，不得直接 mention 发起需求角色，不得复用历史 qa 结论。
- MUST 让 `code-verified` 且历史方案验收语句可用、发起需求者是可触发 agent 的 CEO append 正文为一行轻交棒：陈述 stage 事实并请发起需求角色按已确认「验收语句」逐条验收实现证据；路由约束不变——唯一合法 mention 指向发起需求角色；发起者是真人用户时仍输出 `no_change`。
- MUST NOT 让 CEO 阶段回流 append 正文复制目标角色 persona 已有的审查方法或验收方法清单；审查方法的事实源是 `agents/qa.md`，验收走查与复盘的事实源是 `agents/product-manager.md` 等验收角色 persona。

#### Scenario: plan-written 轻交棒

Given dev 输出尾部 stage marker 为 `plan-written` 且含可用「验收语句」清单的评论
When CEO guardrail 执行阶段验收回流
Then CEO append 正文为一行轻交棒且唯一合法 mention 指向 `@qa`
And 正文不包含六项方案评审清单或其他 qa persona 已有方法的复制

#### Scenario: code-verified 轻交棒

Given dev 输出尾部 stage marker 为 `code-verified` 且历史方案含可用「验收语句」、发起需求角色为 `product-manager`
When CEO guardrail 执行阶段验收回流
Then CEO append 正文为一行轻交棒且唯一合法 mention 指向 `@product-manager`
And 正文不包含三问复盘模板或其他验收角色 persona 已有方法的复制

## REMOVED Requirements

### Requirement: 方案评审模板固定六项

（原文：MUST 让“方案评审模板”固定包含六项清单：对其他模块的影响、可行性、核心目标贴合度、过度设计、现有规范遵守、周全性与鲁棒性。）

移除理由：六项与 `agents/qa.md` 自持的四步审查方法（经验假设清单、故障矩阵、用例二分、对抗性审查）构成方法论双事实源，且每轮以全文抄进交棒评论，是纯上下文税。

### Requirement: 执行后复盘模板固定三问

（原文：MUST 让“执行后复盘模板”固定包含三问：实现是否符合方案、有无应回流的新发现、有无值得沉淀的新经验。）

移除理由：「实现是否符合方案」由 `agents/product-manager.md` 验收职责的逐条走查覆盖；「新发现回流 / 经验沉淀」两问移入 product-manager persona 的验收复盘附注（见 ADDED）。

## ADDED Requirements

### Requirement: product-manager 验收复盘附注

- MUST 让 `agents/product-manager.md` 在验收方案或代码结果的响应中，于「验收结论」行之后附一段简短复盘：① 有无方案当时未考虑、应回流为后续任务或规范修订的新发现；② 有无值得沉淀到规范、persona 或文档的经验；无则各写「无」。
- MUST NOT 让复盘附注改变既有逐条走查硬格式（`N. 通过 — 依据` 与 `验收结论：` 行）与 stage marker 契约。

#### Scenario: 验收响应含复盘附注

Given product-manager 被请求验收一次 `code-verified` 实现
When 它输出验收响应
Then 响应含逐条走查行与 `验收结论：` 行
And 结论之后含新发现回流与经验沉淀两项复盘（可为「无」）
And 最后一行仍为 `<!-- moebius:stage=in-progress -->`
