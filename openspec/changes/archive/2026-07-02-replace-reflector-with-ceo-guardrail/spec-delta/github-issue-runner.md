# github-issue-runner spec delta

## 删除

- 删除 reflector 角色相关规则：
  - 不再要求提供 `agents/reflector.md` 作为通用反思接力展示身份。
  - 不再要求 `@reflector` 普通 mention 被特殊跳过；删除 reflector 后它只是未知 mention。
  - 不再支持 reflector stage trigger。
  - 不再定义 `ReflectorStages`。
  - 不再发布 `<!-- moebius:role=reflector -->` 与 `<!-- moebius:stage-hook ... -->` 的确定性 hook 评论。
  - 不再维护同一 `(source, stage)` 的 `MAX_SELF_REFLECT` 计数、最终收敛指令和自反日志。
  - 不再要求 agent comment post 后同轮 self-reflect。

- 删除 CEO 输入中的 `lastReflectorHook` 稳定字段；完整 issue comments 已包含历史公开上下文。

## 修改

- 更新既有规则「MUST 支持 reflector stage trigger：最新非 `reflector` agent 消息包含 stage metadata 且 stage 在白名单内时，runner 直接发布 reflector 评论」为：

  MUST 让 CEO guardrail 承担阶段反思入口。所有 Codex agent 生成的评论在发布前 MUST 走 CEO guardrail；当 `latestResponse` 尾部 stage marker 为 `plan-written` 或 `code-verified` 时，`agents/ceo.md` MUST 要求 CEO 返回 `append`，默认 `as=ceo`，正文按上下文 `@<agent>` 要求反思、纠偏或继续推进。

- 更新既有规则「MUST 让 `AllStages = ["plan-written", "code-verified", "in-progress"]`，`ReflectorStages = ["plan-written", "code-verified"]`」为：

  MUST 让 `AllStages = ["plan-written", "code-verified", "in-progress"]`，并继续由 `src/stages.ts` 集中定义 stage 枚举与尾部 marker 解析；不再定义 reflector-only stage 子集。

- 更新既有规则「MUST 让 `agents/ceo.md` 承载协作生态认知，至少包含 reflector 的真实机制说明」为：

  MUST 让 `agents/ceo.md` 承载当前协作生态认知，至少包含：真实可通过 mention 触发的 Codex agent 清单（当前为 `dev`、`product-manager`、`hermes-user`、`tranfu-agents-manager`）；系统中不存在 reviewer、manager、reflector 等可交互对象；历史 `<reflector>` 评论只作为旧公开上下文，不代表当前仍有可触发角色。

- 更新既有规则「`append.as` MUST 在 `{ceo, dev, product-manager, hermes-user, reflector}` 集合内」为：

  `append.as` MUST 在 `{ceo, dev, product-manager, hermes-user}` 集合内；`reflector` 不再是合法 append role。

- 更新既有规则「runner 在 Codex agent post 后把评论拼回本地 timeline 并再次调用 trigger」为：

  runner MUST NOT 在 Codex agent post 后进入 self-reflect loop。若 CEO append 评论中包含有效 Codex agent mention，后续 MUST 由下一轮 active poll 按普通 mention trigger 处理。

- 更新既有规则「MUST 把 `MAX_SELF_REFLECT` 与现有 tick / poll 参数一同写入启动日志」为：

  启动日志不再包含 `maxSelfReflect` 字段。

## 新增场景

### 场景：CEO guardrail — plan-written 强制 append

Given 最新消息包含 `@dev`
And dev Codex 本轮返回的 `${LAST_RESPONSE}` 末尾为 `<!-- moebius:stage=plan-written -->`
When runner 在 `postComment` 前调用 CEO guardrail
Then `agents/ceo.md` 要求 CEO 返回 `{"action":"append","as":"ceo","body":"..."}`
And body 应说明这是 `plan-written` 阶段反思或推进裁决，并按上下文 `@dev`
And runner 先 post dev 原文，再 post `<ceo>` append 评论
And runner 不发布 `<reflector>` 评论
And runner 不记录 `self-reflect-hook-commented`

### 场景：CEO guardrail — code-verified 强制 append

Given 最新消息包含 `@dev`
And dev Codex 本轮返回的 `${LAST_RESPONSE}` 末尾为 `<!-- moebius:stage=code-verified -->`
When runner 调用 CEO guardrail
Then `agents/ceo.md` 要求 CEO 返回 `{"action":"append","as":"ceo","body":"..."}`
And body 应要求最终交付检查、PR/规范纠偏或明确下一步
And runner 先 post dev 原文，再 post `<ceo>` append 评论
And runner 不发布 `<reflector>` 评论

### 场景：mention — @reflector 不触发

Given 最新 issue body 或 comment 包含 `@reflector`
And 仓库中不存在 `agents/reflector.md`
When 一次轮询取回该 issue
Then mention trigger 不选择任何 agent
And 系统不调用 Codex、不发表评论

### 场景：CEO guardrail — append.as=reflector fail-open

Given runner 调用 CEO guardrail
When CEO 返回 `{"action":"append","as":"reflector","body":"..."}`
Then `format-ceo.ts` post-validate 拒绝该 role
And `FormatCeoResult.action = "FAIL_OPEN"` 且 `reason = "unknown-as"`
And runner fail-open 直接 post 原 agent 响应
