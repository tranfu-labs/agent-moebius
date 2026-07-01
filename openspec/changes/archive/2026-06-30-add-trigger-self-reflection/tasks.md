# 任务：add-trigger-self-reflection

- [x] 新增 `src/triggers/self-reflect.ts`：`appendPostedComment` 与 `decideNextSelfReflectStep` 两个纯函数。
- [x] `src/config.ts`：新增 `MAX_SELF_REFLECT = 3`，加入 `CONFIG_LOG_FIELDS`。
- [x] 修改 `src/runner.ts` `processIssueSource` mention-codex 分支：在 `postComment` 与 `saveRoleThreadStateStore` 之后插入自反循环；返回 `triggered-success` 前完成 0..MAX_SELF_REFLECT 次自反。
- [x] 新增 `tests/self-reflect.test.ts`：覆盖 `appendPostedComment`（末尾追加、index 续号、入参不可变）与 `decideNextSelfReflectStep`（4 个分支：post-comment 未到上限、post-comment 达上限、run-agent、skip）。
- [x] 补充 `tests/triggers.test.ts`：用 `appendPostedComment` 拼接 dev codex post 后的 timeline，断言 `resolveTrigger` 命中 `resolveReflectorStageTrigger`。
- [x] 跑 `pnpm typecheck` 与 `pnpm test`，全绿（74 tests pass）。
- [x] 反思代码符合度：对照 design.md 与 spec-delta 核每条 MUST 是否落地。
