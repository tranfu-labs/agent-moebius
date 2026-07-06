# github-issue-runner spec delta：agent-handoff-closing-protocol

## 新增行为规则

- MUST 让每个可触发 agent persona（`dev`、`qa`、`product-manager`、`dev-manager`、`hermes-user`）的每条 issue 评论按统一输出骨架产出：`## 结论`、`## 依据`、角色专属必填节、`## 下一步`，stage marker 仍为最后一行。
- MUST 让 `## 下一步` 节包含恰好一条合法收尾行，二选一：`交棒：@<合法角色> <请其做什么>`（该 mention 是整条评论唯一合法 agent mention），或 `等待真人：<等什么、请谁做什么>`（不得含任何合法 agent mention）。
- MUST 让 `agents/ceo.md` 承载「交棒完整性裁决（第 0 检查）」：在所有既有业务场景之前，先核查 `latestResponse` 是否含合法收尾行；栏位缺失与内容空泛同等对待。
- MUST 让 CEO 在 `latestResponse` 无合法收尾行时禁用 `no_change`，改为 `append` 路由：能套既有剧本（`plan-written` → `@qa`、`code-verified` / QA 通过 → 发起需求角色）时套剧本；发起需求角色是真人时 append 裸写请真人按验收清单逐条验收（不使用 agent mention）。
- MUST NOT 让 CEO 在"等待真人验收"场景静默 `no_change`，除非最新评论已含等待真人行。
- MUST NOT 让 persona 输出 `ALL_STAGES` 枚举（`plan-written` / `code-verified` / `in-progress`）之外的 stage 值；`agents/product-manager.md` 的 `context-loaded` / `problem-framed` / `scope-locked` 三个收尾 marker 全部改为 `in-progress`，阶段语义写在「结论」节正文，停等表达写在「下一步」节的等待真人行。
- MUST 让收尾行语法在产出方（角色 persona）与核查方（`agents/ceo.md`）之间逐字一致，避免核查方因措辞差异漏判。

## 新增场景

### 场景 T7.1：persona 包含统一输出骨架
Given 开发者打开 `agents/dev.md`、`agents/qa.md`、`agents/product-manager.md`、`agents/dev-manager.md`、`agents/hermes-user.md`
Then 每个文件包含统一输出骨架：`## 结论`、`## 依据`、`## 下一步` 与收尾行语法定义
And 收尾行语法与 `agents/ceo.md`「交棒完整性裁决」中的定义逐字一致
And `agents/product-manager.md` 不再要求输出 `context-loaded` / `problem-framed` / `scope-locked` 等枚举外 stage 值

### 场景 T7.2：CEO 对无交棒的通过结论 append 路由
Given `latestResponse` 的 speaker 是 `qa`
And 正文含「QA 结论：通过」
And 正文既无 `交棒：@<合法角色>` 行也无 `等待真人：` 行
When CEO guardrail 处理该响应
Then CEO MUST NOT 输出 `no_change`
And CEO 输出 `append`、`as=ceo`，mention 发起需求角色；发起需求角色是真人时改为裸写请真人按验收清单逐条验收

### 场景 T7.3：等待真人不再静默
Given `latestResponse` 尾部 stage marker 为 `code-verified`
And 发起需求角色只能识别到真人用户
And 最新评论不含 `等待真人：` 行
When CEO guardrail 处理该响应
Then CEO 输出 `append`、`as=ceo`
And append 正文裸写请真人按验收清单逐条验收，不含合法 agent mention

### 场景 T7.4：已有合法收尾行时不重复催办
Given `latestResponse` 含 `交棒：@dev 请按缺陷清单修正方案` 且无其他违规
When CEO guardrail 处理该响应
Then CEO 输出 `no_change`
