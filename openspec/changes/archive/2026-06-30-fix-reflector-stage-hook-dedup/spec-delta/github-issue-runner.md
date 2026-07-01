# github-issue-runner spec delta

## 修改

替换 specs/github-issue-runner/spec.md 中的下面这条 MUST：

> - MUST 对同一 `source + stage + sourceIndex` 只发布一次 stage hook 评论；重复防护基于共享时间线中的 `stage-hook` metadata。

改为：

- MUST 对同一 issue timeline 中同一 `(source, stage)` 累计发布的 stage hook 评论数限制为 `MAX_SELF_REFLECT` 次；重复防护基于共享时间线中的 `stage-hook` metadata 中的 `source` 与 `stage` 字段（`sourceIndex` 仅用于人 / 日志追溯，不参与去重）。

同时替换:

> - MUST 在自反循环中复用 `resolveReflectorStageTrigger` 既有的 stage-hook 去重逻辑（`source + stage + sourceIndex`），NEVER 为同一 hook 重复发布评论。

改为：

- MUST 在自反循环中复用 `resolveReflectorStageTrigger` 既有的 stage-hook 去重逻辑（同 `(source, stage)` 累计 < `MAX_SELF_REFLECT`），NEVER 为已达上限的 (source, stage) 再次发布 hook 评论。

## 新增场景

### 场景 26：trigger 自反 — 跨 tick 同 (source, stage) 达上限后停止
Given 同一 issue 的 timeline 中已存在 `MAX_SELF_REFLECT` 条 `stage-hook source=dev stage=plan-written` metadata（无论 `sourceIndex` 是否相同）
And dev 在最新一轮再次发出包含 `<!-- agent-moebius:stage=plan-written -->` 的评论
When 一次轮询取回该 issue
Then `resolveReflectorStageTrigger` 返回 null
And 系统不再发布 reflector hook 评论
And 跨 tick 循环触发的发散被闭环

## 修改场景

### 场景 7（修改）：通用反思者 — agent 输出 stage 时触发反思接力

将原场景中"And comment body 包含 `<!-- agent-moebius:stage-hook source=dev stage=plan-written sourceIndex=<latest-index> -->`"保持不变；新增一行约束：

> And 同一 issue timeline 中同 `(source, stage)` 累计 hook 数小于 `MAX_SELF_REFLECT`

### 场景 8（修改）：stage hook 去重

原场景"And 最新消息 body 包含 `<!-- agent-moebius:stage-hook source=dev stage=plan-written sourceIndex=1 -->`"对应的去重断言含义变更：去重不再基于 `sourceIndex` 精确匹配，而是基于同 `(source, stage)` 累计计数 ≥ `MAX_SELF_REFLECT`。

## 可验证行为

`pnpm test` MUST 在原有覆盖基础上增加：

- 当前 issue timeline 已有 1 条 `(dev, plan-written)` hook 时，dev 新发同 stage 消息 → `resolveReflectorStageTrigger` 返回 `post-comment`。
- 当前 issue timeline 已有 `MAX_SELF_REFLECT` 条 `(dev, plan-written)` hook 时，dev 新发同 stage 消息 → `resolveReflectorStageTrigger` 返回 `null`。
- 不同 `sourceIndex` 不再天然去重——hook 数才是判据。
