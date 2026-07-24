# github-issue-runner spec delta

## 修改
- MUST 让 CEO guardrail 承担阶段验收回流入口：当 Codex agent 的 `latestResponse` 尾部 stage marker 为 `plan-written` 或 `code-verified` 时，`agents/ceo.md` MUST 先查可用「验收语句」清单；有可用清单且发起本需求者是可达 agent 时，CEO MUST 返回 `append`，默认 `as=ceo`，正文 mention 发起需求角色并要求其按验收语句逐条验收。
- MUST 让 `agents/ceo.md` 在 `plan-written` 阶段判断本轮 `latestResponse` 是否包含「验收语句」小节且小节内有逐条、可机械执行的检查；缺失或不可逐条核查时，CEO MUST `append as=ceo` mention `@dev` 要求补齐验收语句，不得回流给验收角色。
- MUST 让 `agents/ceo.md` 在 `code-verified` 阶段优先使用历史有效 `plan-written` 方案中的「验收语句」进行验收回流；若完整公开 issue context 中找不到可用验收语句，CEO MUST `append as=ceo` mention `@dev` 要求补齐验收语句。
- MUST 让 `agents/ceo.md` 按以下优先级识别发起本需求的 agent 角色：issue body 或后续明确流程说明中写明的需求持有者 / 发起者 / 发起需求角色；否则为时间线中最早提出本需求的合法 agent speaker；若发起者是真人用户而非 agent，CEO MUST 输出 `no_change`，维持等真人用户验收。
- MUST NOT 让 `agents/ceo.md` 把转交或维护 CEO 规则的 `secretary` 评论、或 `dev` 的澄清 / 方案 / 实现评论误判为需求发起者；上下文明确写明发起者是 `product-manager` 或 `hermes-user` 时，MUST 以显式信息为准。
- MUST 让 `agents/ceo.md` 至少覆盖六类识别场景（全部走 `append` 的场景保持不变，除真人发起者分支外）：① `latestResponse` 尾部 stage marker 为 `plan-written` 或 `code-verified` 时的阶段验收回流 / 缺验收语句补齐；② 工作明显未完成、或已交付但不符合规范（持续推进）；③ 交付规范细则不满足；④ 死锁等待；⑤ PR 冲突；⑥ 免确认操作放行。

## 场景
### 场景：CEO guardrail — plan-written 回流给发起需求角色验收
Given issue body 明确写明需求持有者是 `hermes-user`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾含 `<!-- moebius:stage=plan-written -->`
And `${LAST_RESPONSE}` 的最终 stage marker 前包含「验收语句」小节
And 「验收语句」小节内包含逐条、可机械执行的检查
When runner 在 `postComment` 之前调用 CEO guardrail
Then `agents/ceo.md` MUST 要求 CEO 返回 `{"action":"append","as":"ceo","body":"..."}`
And append body MUST mention `@hermes-user`
And append body MUST 要求 `@hermes-user` 按「验收语句」逐条验收方案
And runner 先 post dev 原文，再以 `<ceo>:` 前缀 post CEO 追加评论

### 场景：CEO guardrail — plan-written 缺验收语句时要求 dev 补齐
Given dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾含 `<!-- moebius:stage=plan-written -->`
And `${LAST_RESPONSE}` 没有「验收语句」小节，或该小节内没有逐条、可机械执行的检查
When runner 在 `postComment` 之前调用 CEO guardrail
Then `agents/ceo.md` MUST 要求 CEO 返回 `{"action":"append","as":"ceo","body":"..."}`
And append body MUST mention `@dev`
And append body MUST 要求 `@dev` 补齐「验收语句」
And append body MUST NOT mention 验收角色要求其验收当前方案

### 场景：CEO guardrail — code-verified 回流给发起需求角色验收实现证据
Given issue body 明确写明需求持有者是 `product-manager`
And 完整公开 issue context 中存在一条历史 dev `plan-written` 方案
And 该方案包含「验收语句」小节与逐条、可机械执行的检查
And dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾含 `<!-- moebius:stage=code-verified -->`
When runner 在 `postComment` 之前调用 CEO guardrail
Then `agents/ceo.md` MUST 要求 CEO 返回 `{"action":"append","as":"ceo","body":"..."}`
And append body MUST mention `@product-manager`
And append body MUST 要求 `@product-manager` 按验收语句逐条验收实现证据

### 场景：CEO guardrail — 真人用户发起时不自动回流 agent
Given 发起本需求的是 issue body 的真人用户
And 时间线中没有明确的 agent 需求持有者 / 发起者
And dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾含 `<!-- moebius:stage=plan-written -->`
And `${LAST_RESPONSE}` 包含可用「验收语句」
When runner 在 `postComment` 之前调用 CEO guardrail
Then `agents/ceo.md` MUST 要求 CEO 返回 `{"action":"no_change"}`
And runner 只 post dev 原文，继续等待真人用户验收
