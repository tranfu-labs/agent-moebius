# 任务：goal-intake-t8

- [x] 更新 CEO persona 与新增 `agents/ceo-scripts/goal-intake.md`，明确目标形状兜底、interview/propose/confirm 契约、支付宝类 demo disclaimer 与 switch_phase 契约边界。
- [x] 扩展 `src/ceo-scripts.ts` 与测试，支持 required `goal-intake` script 和 `goal_intake` action。
- [x] 扩展 `src/agent-prescripts/ceo-ledger-context.ts`，在正常新目标入口提供 intake bootstrap context，同时保留 malformed ledger / 多 active phase fail-closed。
- [x] 扩展 `src/ceo-orchestration.ts` 与测试，解析并校验 `goal_intake.interview/propose/confirm`。
- [x] 在 `src/goal-ledger.ts` 新增 goal-intake pending proposal 与 confirm 纯 helper，并补齐幂等 / 冲突 / phase active 测试。
- [x] 重构 runner 的 CEO spawn executor 以供 `spawn_child_issues` 与 `goal_intake.confirm` 共享。
- [x] 扩展 runner 无 mention 兜底路由，分别覆盖明显目标形状的 issue body digest key 与 latest comment id key，并保持 route decision 幂等。
- [x] 在 runner 接入 `goal_intake` 三种 mode：interview 只评论；propose 写 pending + 评论；confirm ready/active + 复用 spawn。
- [x] 增加目标 handoff 发布失败测试：fallback route 决定 append 但 route comment timeout 时返回 failed、不推进 intake `updatedAt`、不记录成功 append decision。
- [x] 增加 runner fail-closed 测试：非法 JSON、proposal key 冲突、ledger 保存失败、proposal comment 发布失败、spawn 部分失败、fail-closed 评论发布失败、confirm 重试不重复创建 child。
- [x] 增加 confirm 半成功恢复测试：createIssue 成功但 child-ref save timeout 后，重试同一 proposal 按 hidden key 找回 child、补写 child ref、保持 phase one 只有一个 active。
- [x] 增加模拟“我想要做一个支付宝”测试，验证无 mention 路由、采访上限、demo disclaimer、pending 入账、确认后 child issue body 含质量基准与验收语句，且不做真实外部 dogfood。
- [x] 运行 `pnpm test`、`pnpm typecheck`、`git diff --check`。
- [x] 实现完成后归档 change，合并 spec-delta，更新 `docs/architecture/module-map.md` 与 roadmap T8 验收证据并勾选 T8。
