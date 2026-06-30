# github-issue-runner spec delta

## 修改

- MUST 在每个 issue 处理周期内，agent 通过 mention trigger 完成 codex 评论 post 后立即把该评论拼回本地 timeline，并再次调用 trigger 解析；NEVER 仅依赖跨轮 active poll 触发 reflector stage hook。
- MUST 仅在自反时再次解析命中 reflector stage hook（`kind === "post-comment"`）时继续自反并直接发布 hook 评论；若再次解析命中 mention（需要再跑 codex），MUST 停止自反、将该 mention 留给下一轮 active poll 处理。
- MUST 限制同轮自反次数为 `MAX_SELF_REFLECT = 3`；达到上限即停止本轮自反、留给下一轮 active poll。
- MUST 在自反循环中复用 `resolveReflectorStageTrigger` 既有的 stage-hook 去重逻辑（`source + stage + sourceIndex`），NEVER 为同一 hook 重复发布评论。
- MUST 保留每分钟 active poll 与 5 次无变化降级 idle 的现有节奏；自反失败或外部 actor 写带 stage marker 评论时，下一轮 active poll 仍负责兜底。
- MUST 在自反每一步发布 hook 评论时记录 `event = "self-reflect-hook-commented"`、`iteration`、`stage`、`sourceRole`、`sourceIndex` 与 `issueKey`；自反停止时记录 `event = "self-reflect-stopped"`、`iteration`、`reason`、`issueKey`。
- MUST 在自反循环中拼接本地 timeline 时使用 `formatAgentComment` 包过的 agent 评论 body（与 GitHub 实际写回的 comment body 一致），保证 `normalizeComment` 与 stage marker 解析在自反时与跨轮 poll 时行为一致。
- MUST 把 `MAX_SELF_REFLECT` 与现有 tick / poll 参数一同写入启动日志的 `CONFIG_LOG_FIELDS`。

## 新增场景

### 场景 23：trigger 自反 — dev 写出 plan-written 后同轮触发 reflector stage hook
Given 最新消息包含 `@dev`
And `agents/dev.md` 与 `agents/reflector.md` 都存在
And dev codex 本轮返回的 `${LAST_RESPONSE}` 含 `<!-- agent-moebius:stage=plan-written -->`
When 一次轮询取回该 issue
Then 系统先按 mention trigger 发布 dev 评论
And 在本轮内把刚发布的 dev 评论拼回本地 timeline 再调用 `resolveTrigger`
And 命中 reflector stage trigger 并立即发布 reflector hook 评论
And 不等下一轮 active poll
And 日志包含 `event:self-reflect-hook-commented` 与 `iteration:1`

### 场景 24：trigger 自反 — 命中 mention 时停止自反
Given dev codex 本轮返回的 `${LAST_RESPONSE}` 不含 stage marker 但包含 `@product-manager`
And `agents/product-manager.md` 存在
When 一次轮询取回该 issue
Then 系统按 mention trigger 发布 dev 评论
And 自反时再次解析命中 product-manager mention
And 系统停止本轮自反，不在本轮调用 product-manager 的 codex
And 日志包含 `event:self-reflect-stopped` 与 `reason:"mention-not-self-reflected"`
And 下一轮 active poll 仍按 mention trigger 处理 product-manager

### 场景 25：trigger 自反 — 达到 MAX_SELF_REFLECT 上限退出
Given 自反循环中连续 3 次 `resolveTrigger` 都返回新的 stage hook 结果（理论极端场景）
When 第 `MAX_SELF_REFLECT + 1` 次循环开始
Then 系统停止本轮自反
And 日志包含 `event:self-reflect-stopped` 与 `reason:"max-iterations"`
And 未发布的 hook 评论留给下一轮 active poll 兜底

## 可验证行为

`pnpm test` MUST 在原有覆盖基础上增加：

- `appendPostedComment` 在 timeline 末尾追加 speaker 为传入 role 的消息，index 续号，原数组不变。
- `decideNextSelfReflectStep` 对 `post-comment`（未达上限 / 达上限）、`run-agent`、`skip` 四种 trigger 结果分别返回 `continue-hook` / `stop:max-iterations` / `stop:mention-not-self-reflected` / `stop:trigger-skip`。
- 拼接 dev 的 plan-written 评论后调用 `resolveTrigger`，命中 `resolveReflectorStageTrigger`，返回 `kind = "post-comment"` 且 `stage = "plan-written"`。
