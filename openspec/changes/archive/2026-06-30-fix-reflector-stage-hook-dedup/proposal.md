# 提案：fix-reflector-stage-hook-dedup

## 背景

`resolveReflectorStageTrigger` 的去重 key 是 `(sourceRole, stage, sourceIndex)`（[src/triggers/reflector-stage-trigger.ts:96-107](../../../src/triggers/reflector-stage-trigger.ts)）。`sourceIndex` 来自最新消息的 timeline index，所以 dev 每次新发一条带相同 stage marker 的评论，sourceIndex 必然变化、查不到旧 hook、再次触发 reflector。

issue #57 的实际表现：

- dev 发 `<!-- moebius:stage=plan-written -->` (idx=3) → reflector 触发，post `stage-hook source=dev stage=plan-written sourceIndex=3`。
- dev 收到反思请求，反思后仍处于 plan-written 阶段，又写一次同 stage marker (idx=5) → reflector 查 `(dev, plan-written, 5)` 没有 → 再次触发。
- 跨 active poll 循环不止。

`MAX_SELF_REFLECT = 3` 只挡 runner **同 tick 的 in-process 自反循环**（[src/triggers/self-reflect.ts](../../../src/triggers/self-reflect.ts)）；跨 tick 触发时 runner 重新启动循环、计数清零，挡不住跨轮发散。

## 提案

把 reflector stage hook 的去重判据从「同一条消息精确匹配」改为「**同一 issue 下同一 (sourceRole, stage) 累计触发次数 < MAX_SELF_REFLECT**」：

- `reflector-stage-trigger.ts` 用 `countExistingStageHooks(timeline, sourceRole, stage)` 替换 `hasExistingStageHook(...)`；命中阈值即返回 null。
- 阈值复用现有 `MAX_SELF_REFLECT = 3`，让 in-tick 与跨 tick 共享同一上限。
- timeline 由 runner 按 issueKey 构造并传入，per-issue 边界天然成立，不引入额外维度。

## 影响

- `src/triggers/reflector-stage-trigger.ts`：替换去重函数；引入 `MAX_SELF_REFLECT` import。
- `tests/triggers.test.ts`：原"不为同一消息重复触发"用例升级为"未到上限可再触发 / 达上限停止"两个用例。
- `src/triggers/self-reflect.ts` `decideNextSelfReflectStep` 的 `iteration > maxIterations` 分支变成冗余（trigger 层已经基于 timeline 计数），**保留作为双保险**——trigger 出 bug 时仍能停。
- `openspec/specs/github-issue-runner/spec.md`：更新 stage hook 去重规则的描述，由"同 source + stage + sourceIndex 只发一次"改为"同 (source, stage) 累计 ≤ MAX_SELF_REFLECT 次"；新增一个"上限到达后停止"的场景。
- 不改 stage marker / stage-hook metadata 格式；不改 reflector / dev agent prompt；不改 active poll 节奏；不改 `MAX_SELF_REFLECT` 数值。
- 修复 issue #57 报告的 reflector 循环触发。
