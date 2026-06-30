# 任务：fix-reflector-stage-hook-dedup

- [x] `src/triggers/reflector-stage-trigger.ts`：用 `countExistingStageHooks(timeline, sourceRole, stage)` 替换 `hasExistingStageHook(...)`；在 `resolveReflectorStageTrigger` 引入 `MAX_SELF_REFLECT` 上限判断。
- [x] `tests/triggers.test.ts`：把原 "does not post duplicate stage hooks for the same source message and stage" 用例升级为两个 case：
  - 当前 timeline 已有 1 条同 (sourceRole, stage) hook + dev 新发同 stage 消息 → 期望返回 post-comment（未到 MAX，允许再触发）。
  - 当前 timeline 已有 MAX_SELF_REFLECT 条同 (sourceRole, stage) hook + dev 新发同 stage 消息 → 期望返回 null（达上限）。
- [x] 跑 `pnpm typecheck` 与 `pnpm test`，全绿。
- [x] 反思代码符合度：对照 design.md 与 spec-delta 核每条 MUST 是否落地。
