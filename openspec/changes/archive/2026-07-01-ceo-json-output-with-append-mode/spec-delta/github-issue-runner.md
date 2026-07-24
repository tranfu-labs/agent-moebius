# github-issue-runner spec delta

## 修改

- 更新既有规则「MUST 定义 `agents/ceo.md` 的输出契约：要么返回单一 token `NO_CHANGE`（允许前后空白与 markdown fence 包裹），要么返回改写后的完整评论文本；改写文本 MUST 保持原正文语义与内容不变、MUST 把 stage marker 保留在文本最末尾、MUST 在 marker 之前追加 quote 块标注"本条已由 CEO 校正"及一句修改说明。」为：

  MUST 定义 `agents/ceo.md` 的输出契约为 JSON，仅允许以下三种结构（允许 fenced code block 包裹）：
  1. `{"action":"no_change"}` — 不改动，runner 直接 post 原文。
  2. `{"action":"replace","body":"<完整改写正文>"}` — 用于 stage marker 补齐等格式层修正；`body` MUST 末尾带合法 stage marker（marker MUST 在 `AllStages` 内）；`body` MUST 保留原正文语义与内容；`body` MUST 在 marker 之前含一行 `> CEO guardrail: <说明>` quote 标注。
  3. `{"action":"append","as":"<role>","body":"<CEO 追加正文>"}` — 用于内容层修正与自主裁决表态；`as` MUST 在 `{ceo, dev, product-manager, hermes-user, reflector}` 集合内；`body` MUST 含一行 `> CEO guardrail: <说明>` quote 标注。

- 更新既有规则「MUST 在 CEO 返回修正文本、后置宽容匹配验证通过后，由 runner 在 post 前于最终 GitHub comment body 末尾追加 `<!-- moebius:ceo-corrected -->` metadata」为：runner 追加 `<!-- moebius:ceo-corrected -->` metadata 的行为按 action 分：
  - `replace`：在 CEO 返回的 `body` 末尾追加 metadata，走原 agent 前缀（`role=<原 agent>`）post。
  - `append`：先 post 原 `LAST_RESPONSE` 原文（`role=<原 agent>` metadata，**不追加** `ceo-corrected`），再 post 一条独立评论（前缀 `<${as}>:` + `role=${as}` metadata + 末尾追加 `ceo-corrected` metadata）。
  - `no_change`：不追加。

- 更新既有规则「MUST 在 CEO 调用超时、抛异常、返回空、返回非法 JSON / 非法结构、返回 stage 不在 `AllStages` 时 fail-open 直接 post 原文」为：CEO 调用超时、抛异常、返回空、返回非法 JSON、`action` 字段缺失或不在 `{no_change, replace, append}` 枚举内、`append.as` 缺失或不在允许集合内、`replace.body` 末尾 stage marker 不在 `AllStages` 内、`replace.body` 或 `append.body` 为空时，runner MUST fail-open 直接 post 原文。

- 更新既有规则「MUST 让 `agents/ceo.md` 至少覆盖两类识别场景」为：MUST 覆盖至少三类识别场景：① 缺失或非法 stage marker（走 `replace`）；② dev agent 收到含 `[MAX_REFLECT]` 收敛指令的 reflector hook 后无实质推进动作（走 `append`）；③ dev agent 停下询问"是否新建 change 分支"这类可自主裁决的确认题（走 `append`，CEO 决定 `as` 身份表态"同意 dev 自行推进"）。

## 新增

### CEO 输出契约扩展
- MUST 支持 `append` action：runner 收到 `{action:"append", as, body}` 时先 post 原 agent 的 `LAST_RESPONSE`（原前缀 + `role=<原 agent>` metadata、**不追加** `ceo-corrected`），再 post 一条独立评论（前缀 `<${as}>:` + `role=${as}` metadata + `ceo-corrected` metadata 追加于末尾）；两条评论按顺序 `appendPostedComment` 拼回 timeline。
- MUST 让 `format-ceo.ts` post-validate 只做基础格式红线校验：合法 JSON、`action` 枚举、`append.as` 已知 role、`replace.body` 末尾 stage marker、非空 body；MUST NOT 在 code 层做业务判据（触发条件、模板措辞、`@mention` 等），业务判据 MUST 全部由 `agents/ceo.md` 承担。
- MUST 在 `format-ceo.ts` 的 `FAIL_OPEN` reason 中区分：`invalid-json`、`unknown-action`、`unknown-as`、`empty-body`、以及既有的 `codex-failed` / `codex-timeout` / `persona-load-failed` / `post-validate-failed`。

### CEO speaker 命名空间
- MUST 让 `src/conversation.ts` 的 `normalizeComment` 识别 `<!-- moebius:role=ceo -->` metadata 并直接归为 `speaker=ceo`，**不走 `availableAgentNames` 白名单校验**；其他 role 仍走现有校验路径。
- MUST NOT 把 `ceo` 加进 `availableAgentNames`；CEO 不是 mention codex agent，`@ceo` 不应触发 codex 调用。
- MUST 让 `agents/ceo.md` 的 persona 明确 `as` 允许集合 = `{ceo, dev, product-manager, hermes-user, reflector}`（宽口径）；未来新增 driver agent 时 MUST 同步扩这个集合并更新 `format-ceo.ts` 校验白名单。

### 日志事件
- MUST 新增 `event=ceo-guardrail-appended` 日志事件，含 `issueKey`、`agent`（原 agent 名）、`as`（CEO 追加评论身份）；沿用现有 `event=ceo-guardrail-repaired` / `ceo-guardrail-noop` / `ceo-guardrail-failopen`。

## 新增场景

### 场景 34：CEO guardrail — dev 询问可自主裁决问题被 CEO append 同意
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 停下询问"是否从当前 HEAD 创建 `change/foo` 分支"并以 `<!-- moebius:stage=in-progress -->` 结尾
And `agents/ceo.md` 存在且识别场景清单包含"dev 询问可自主裁决问题"
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO 返回 `{"action":"append","as":"ceo","body":"> CEO guardrail: 新建 change 分支属于 dev 自主裁决范围。\n\n@dev 同意你提出的分支方案，请自行创建并继续推进 plan-written。"}`
And 后置校验通过（合法 JSON、`action=append`、`as=ceo` 在允许集合、`body` 非空）
And runner 先 `postComment` 一次：body 为 dev 原文 + `role=dev` metadata（**不追加** `ceo-corrected`）
And runner 再 `postComment` 一次：body 为 `<ceo>:\n${CEO body}` + `role=ceo` metadata + `ceo-corrected` metadata
And `appendPostedComment` 依次拼回 timeline（`speaker=dev` → `speaker=ceo`）
And 日志包含 `event=ceo-guardrail-appended` 与 `agent=dev` / `as=ceo` / `issueKey`
And 后续 `resolveTrigger` 命中 mention 或 skip 都可（同轮自反循环按现有规则处理）

### 场景 35：CEO guardrail — dev 收到 [MAX_REFLECT] 后仅回"收到"被 CEO append 督促
Given 最新消息包含 `@dev`
And `lastReflectorHook` 是含 `[MAX_REFLECT]` 收敛指令的 reflector hook 评论
And dev codex 本轮返回的 `${LAST_RESPONSE}` 仅表示"看过、没问题、收到"没有实质推进动作，末尾带 `<!-- moebius:stage=in-progress -->`
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO 返回 `{"action":"append","as":"ceo","body":"> CEO guardrail: 上一条 reflector 收敛指令要求继续推进。\n\n@dev 请按方案计划继续执行，若有阻塞请明确说明。"}`
And 后置校验通过
And runner 先 post dev 原文，再 post CEO append 评论（结构同场景 34）
And 日志包含 `event=ceo-guardrail-appended`

### 场景 36：CEO guardrail — CEO 扮演 dev 追加评论
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 停下询问"是否创建 change 分支"并以 `<!-- moebius:stage=in-progress -->` 结尾
And CEO 判定应扮演 dev 直接推进（`as=dev`）
When runner 调用 CEO guardrail
Then CEO 返回 `{"action":"append","as":"dev","body":"> CEO guardrail: 新建 change 分支属于 dev 自主裁决范围。\n\n我自行按 `change/foo` 分支方案继续推进 plan-written。\n\n<!-- moebius:stage=in-progress -->"}`
And 后置校验通过（`as=dev` 在允许集合、`body` 非空；code 层不校验 stage marker，是 dev 语义自带）
And runner 先 post dev 原文，再 post 一条 `<dev>:\n${CEO body}` + `role=dev` metadata + `ceo-corrected` metadata 的评论
And `appendPostedComment` 依次拼回 timeline（两条 `speaker=dev`，第二条含 `ceo-corrected` metadata）
And 日志包含 `event=ceo-guardrail-appended` 与 `as=dev`

### 场景 37：CEO guardrail — 非法 JSON fail-open
Given 最新消息包含 `@dev`
When runner 调用 CEO guardrail
And CEO 返回一段自然语言解释而非 JSON
Then `parseCeoOutput` 抛错
And `FormatCeoResult.action = "FAIL_OPEN"` 且 `reason = "invalid-json"`
And runner fail-open 直接 post dev 原文（单次 `postComment`）
And 日志包含 `event=ceo-guardrail-failopen`

### 场景 38：CEO guardrail — `append.as` 未知 role fail-open
Given 最新消息包含 `@dev`
When runner 调用 CEO guardrail
And CEO 返回 `{"action":"append","as":"nobody","body":"..."}`
Then `format-ceo.ts` post-validate 拒绝
And `FormatCeoResult.action = "FAIL_OPEN"` 且 `reason = "unknown-as"`
And runner fail-open 直接 post dev 原文
And 日志包含 `event=ceo-guardrail-failopen`

### 场景 39：CEO speaker 命名空间独立于 mention 白名单
Given issue timeline 里有一条 body 含 `<!-- moebius:role=ceo -->` 的评论
And `availableAgentNames = ["dev", "product-manager", "hermes-user"]`（不含 `ceo`）
When `normalizeComment` 处理该评论
Then 该评论归一化为 `speaker=ceo`
And 该评论 body 不会因 `@ceo` mention 触发 codex 调用（`ceo` 不在 mention agent 集合内）
