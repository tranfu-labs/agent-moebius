# github-issue-runner spec delta

## 修改

- 更新既有规则「MUST 支持 `plan-written` 与 `code-verified` 两个 reflector stage」为：`ReflectorStages` 白名单保持 `plan-written` / `code-verified` 不变；新增 `AllStages = ReflectorStages ∪ ["in-progress"]`；`in-progress` MUST NOT 触发 reflector stage trigger。
- 更新既有 reflector stage trigger 的 marker 识别规则：正则 MUST 宽容匹配（大小写混合、marker 内部多余空白、`=` 前后空白），但 stage 名 MUST 严格匹配 `AllStages` 白名单枚举。

## 新增

### stage 契约扩展
- MUST 集中定义 stage 枚举于 `src/stages.ts`，供 CEO guardrail、reflector stage trigger、各 agent persona 契约测试共用；多处 MUST NOT 各自维护副本。
- MUST 让所有 codex agent persona（`agents/dev.md`、`agents/product-manager.md`、`agents/hermes-user.md` 及未来新增 codex agent）契约要求：每条响应末尾必须以 `<!-- agent-moebius:stage=<enum> -->` marker 结尾，`<enum>` MUST 属于 `AllStages`。
- MUST 让 `in-progress` 承载"还在干活 / 采访 / 澄清 / 报进度 / 等待用户 — 不需要 reflector 接力"的语义；`plan-written` / `code-verified` 现有触发反思接力的语义 MUST 保持不变。
- SHOULD 让 `plan-written` / `code-verified` 保持为 dev agent 的开发阶段语义；其他 codex agent 的默认 stage MUST 为 `in-progress`；若非 dev agent 意外发出 `plan-written` / `code-verified`，reflector-stage-trigger 现有触发行为不变（触发仍生效，靠 agent persona 契约在源头约束）。

### CEO guardrail 层
- MUST 新增 `agents/ceo.md` 作为 CEO agent persona，承载触发范围、识别场景清单、输入契约、输出契约与修改红线；未来事故规则扩展 MUST 通过修改 `agents/ceo.md` 实现，NEVER 硬编码到 runner 或 `src/format-ceo.ts`。
- MUST 让 `agents/ceo.md` 至少覆盖两类识别场景：① 缺失或非法的 stage marker（事故 1）；② dev agent 收到含 `[MAX_REFLECT]` 收敛指令的 reflector hook 后无实质推进动作（事故 2）。
- MUST 定义 `agents/ceo.md` 的输入契约字段：`originalRequest`、`latestResponse`、`agent`、`allowedStages`、`lastReflectorHook`；MUST NOT 把完整 issue timeline 传给 CEO。
- MUST 定义 `agents/ceo.md` 的输出契约：要么返回单一 token `NO_CHANGE`（允许前后空白与 markdown fence 包裹），要么返回改写后的完整评论文本；改写文本 MUST 保持原正文语义与内容不变、MUST 把 stage marker 保留在文本最末尾、MUST 在 marker 之前追加 quote 块标注"本条已由 CEO 校正"及一句修改说明。
- MUST 在 `src/runner.ts` 的 mention Codex 分支于 `postComment` 之前插入 CEO 拦截：所有 codex agent 生成的评论 MUST 走 CEO；`reflector-stage-trigger` 直接生成的确定性 hook 评论 MUST NOT 走 CEO；CEO 自身修正版评论 MUST NOT 再次走 CEO。
- MUST 通过评论 body 中的 `<!-- agent-moebius:ceo-corrected -->` metadata 识别 CEO 自身修正版评论：runner 在拦截入口读到该 metadata 就跳过 CEO 拦截，直接 post 或按现有流程处理；此机制 MUST NOT 依赖 runner 内存中的响应通道来源，以保证 runner 重启、跨轮读取、外部编辑等场景仍能正确识别。
- MUST 在 CEO 返回修正文本、后置宽容匹配验证通过后，由 runner 在 post 前于最终 GitHub comment body 末尾追加 `<!-- agent-moebius:ceo-corrected -->` metadata（位置在 role metadata 之后，即 body 最末尾）；此 metadata 由 runner 追加而非要求 CEO 输出，避免 CEO 忘记或写错。
- MUST 让 CEO 调用以短上下文、无状态方式执行：每次 CEO 调用 MUST 新建 codex thread、NEVER 复用 dev thread、NEVER 复用上次 CEO thread。
- MUST 在收到 CEO 修正文本后执行后置宽容匹配验证：修正文本末尾 MUST 存在合规 `<!-- agent-moebius:stage=<enum> -->` marker（`<enum>` MUST 属于 `AllStages`）；验证不通过 MUST fail-open 直接 post 原文。
- MUST 在 CEO 调用超时、抛异常、返回空、返回非法 JSON / 非法结构、返回 stage 不在 `AllStages` 时 fail-open 直接 post 原文；CEO guardrail MUST NOT 变成新的失败源阻断主流程。
- MUST 在 CEO 调用超时时取消对应底层 Codex 子进程，避免 fail-open 后仍留下后台 guardrail 进程继续运行。
- MUST 从当前 issue timeline 中定位最近一条 reflector hook 评论 body 作为 `lastReflectorHook` 传给 CEO；若不存在则传空值。
- MUST 记录结构化日志覆盖以下事件类型：`event = "ceo-guardrail-repaired"`（CEO 修正命中并 post 修正版）、`event = "ceo-guardrail-noop"`（CEO 返回 NO_CHANGE）、`event = "ceo-guardrail-failopen"`（后置验证不通过 / 超时 / 异常 / 非法输出），至少包含 `issueKey`、`agent`、`reason`。

## 新增场景

### 场景 31：CEO guardrail — dev 漏发 stage marker 被 CEO 补齐
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 正文明显对应 `code-verified` 阶段但末尾无 `<!-- agent-moebius:stage=code-verified -->` marker
And `agents/ceo.md` 存在且识别场景清单包含"缺失 stage marker"
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO 以短上下文（`originalRequest` + `latestResponse` + `agent = "dev"` + `allowedStages` + `lastReflectorHook`）被调用
And CEO 返回改写后完整文本，末尾含 `<!-- agent-moebius:stage=code-verified -->`
And 后置宽容匹配验证通过
And runner 在 post 前在 body 最末尾追加 `<!-- agent-moebius:ceo-corrected -->` metadata
And runner post 的评论为 CEO 修正版，包含 CEO quote 标注、stage marker、role metadata、以及最末尾的 `<!-- agent-moebius:ceo-corrected -->` metadata
And 日志包含 `event = "ceo-guardrail-repaired"` 与 `issueKey`
And 后续 `reflector-stage-trigger` 能正确识别 `code-verified` 并触发反思接力

### 场景 32：CEO guardrail — CEO 返回 NO_CHANGE 直接 post 原文
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 末尾已含合规 `<!-- agent-moebius:stage=in-progress -->`
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO 返回单一 token `NO_CHANGE`（含前后空白或 markdown fence 包裹均视同 NO_CHANGE）
And runner post 的评论为 dev 原文，不追加 CEO quote 标注
And 日志包含 `event = "ceo-guardrail-noop"`

### 场景 33：CEO guardrail — 后置验证不通过 fail-open
Given 最新消息包含 `@dev`
And dev codex 本轮返回的 `${LAST_RESPONSE}` 无合规 marker
When runner 调用 CEO guardrail
Then CEO 返回一段"修正文本"，但末尾不含 `AllStages` 内的任何合规 marker
And 后置宽容匹配验证不通过
And runner fail-open post dev 原文
And 日志包含 `event = "ceo-guardrail-failopen"` 与 `reason = "post-validate-failed"`

### 场景 34：CEO guardrail — CEO 超时或异常 fail-open
Given 最新消息包含 `@dev`
When runner 调用 CEO guardrail 并遇到超时、CLI 非 0 退出、返回空 stdout 或返回非法结构
Then runner fail-open post dev 原文
And 日志包含 `event = "ceo-guardrail-failopen"` 与错误原因
And 若失败原因为超时，runner 取消对应底层 Codex 子进程
And 不阻断主流程，不影响 role thread 状态推进条件

### 场景 35：CEO guardrail — CEO 自身评论通过 metadata 识别不再走 CEO 防循环
Given 场景 31 中 CEO 修正评论已 post，body 末尾含 `<!-- agent-moebius:ceo-corrected -->` metadata
When runner 后续从 GitHub 读到该评论并进入 CEO 拦截入口
Then runner 通过 body 中 `<!-- agent-moebius:ceo-corrected -->` metadata 识别为 CEO 修正版
And runner MUST NOT 再对该评论触发 CEO guardrail
And 该识别机制不依赖 runner 内存中的响应通道来源，runner 重启后仍能正确识别

### 场景 36：CEO guardrail — dev 收到收敛指令后无推进按 ceo.md 事故 2 规则处理
Given 同一 issue 的 timeline 中存在 `MAX_SELF_REFLECT` 条 `stage-hook source=dev stage=<stage>` metadata
And 最新一条 reflector hook 评论 body 包含 `[MAX_REFLECT]` 收敛指令
And dev 在最新一轮的响应正文中无实质推进动作（例如不含"归档""提交""PR""下一步""执行"等推进关键词）
And `agents/ceo.md` 的识别场景清单包含事故 2 规则
When runner 调用 CEO guardrail 并传入 `lastReflectorHook = <该 hook body>`
Then CEO 按 `agents/ceo.md` 中事故 2 规则处理并返回相应输出（具体动作由 `agents/ceo.md` 定义）
And runner 按 CEO 返回结果执行后续 post 逻辑（NO_CHANGE / 修正版 / fail-open）

### 场景 37：CEO guardrail — reflector 确定性 hook 评论不走 CEO
Given 最新消息 speaker 是 `dev` 且 body 含 `<!-- agent-moebius:stage=plan-written -->`
And `reflector-stage-trigger` 命中并生成确定性 hook 评论
When runner 准备 post 该 hook 评论
Then runner MUST NOT 对 reflector hook 评论调用 CEO guardrail
And 直接 post 该 hook 评论
And 不记录 `ceo-guardrail-*` 日志

### 场景 37.1：CEO guardrail — product-manager 与 hermes-user 也走 CEO
Given 最新消息 mention 的是 `product-manager` 或 `hermes-user`
And 该 agent 的 codex 响应 `${LAST_RESPONSE}` 无合规 stage marker
When runner 在 `postComment` 之前调用 CEO guardrail
Then CEO 以短上下文（含对应 `agent` 值）被调用
And CEO 按 `agents/ceo.md` 事故 1 规则返回补齐 `in-progress` marker 的修正版
And 后置宽容匹配验证通过
And runner post CEO 修正版

### 场景 38：Stage 契约扩展 — dev in-progress 响应不触发 reflector
Given 最新消息 speaker 是 `dev`
And 最新消息 body 末尾含 `<!-- agent-moebius:stage=in-progress -->`
When 一次轮询取回该 issue
Then `resolveReflectorStageTrigger` 返回 null
And runner 不发布 reflector hook 评论

### 场景 39：Stage 契约扩展 — reflector-stage-trigger 宽容匹配识别大小写与空白变体
Given 最新消息 speaker 是 `dev`
And 最新消息 body 末尾含 `<!--  agent-moebius:stage = code-verified  -->`（marker 内部多余空白 + `=` 前后空白）
When 一次轮询取回该 issue
Then `resolveReflectorStageTrigger` 识别为 `code-verified` stage
And 按现有规则发布 reflector hook 评论

## 可验证行为

`pnpm test` MUST 在原有覆盖基础上增加：

- `src/stages.ts` 的 `Stage` 联合类型、`ReflectorStages`、`AllStages` 常量断言。
- `format-ceo.judge` 在事故 comment [4851370207](https://github.com/tranfu-labs/agent-moebius/issues/10#issuecomment-4851370207) 固化用例上产出合规修正版，后置验证通过。
- `format-ceo.judge` 在 CEO 返回 `NO_CHANGE`（含空白、markdown fence 包裹）时走原文分支。
- `format-ceo.judge` 在 CEO 返回不含合规 marker 的"修正版"、CEO 超时、CEO 返回空、CEO 返回 stage 不在 `AllStages` 时一律 fail-open；CEO 超时时取消底层 Codex 调用。
- `reflector-stage-trigger` 宽容匹配大小写、marker 内部多余空白、`=` 前后空白；`stage=in-progress` 明确不触发；现有 `plan-written` / `code-verified` 触发场景回归通过。
- runner 单测：所有 codex agent 响应（dev / product-manager / hermes-user）都触发 CEO 拦截；含 `<!-- agent-moebius:ceo-corrected -->` metadata 的评论不再触发 CEO；reflector 确定性 hook 评论不触发 CEO；CEO 修正版在 post 前正确追加 `<!-- agent-moebius:ceo-corrected -->` metadata（位于 body 最末尾、role metadata 之后）。

`pnpm typecheck` MUST 通过。

启动真实 runner 前 MUST 满足既有环境要求（`codex` CLI 在 `PATH`、`gh auth login` 完成）。

`pnpm start` 会真实调用 CEO 进行 dev 响应的格式校正；用户 MUST 确认 `agents/ceo.md` 内容符合当前项目预期后再启用。
