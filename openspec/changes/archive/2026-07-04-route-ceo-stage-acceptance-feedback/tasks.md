# 任务：route-ceo-stage-acceptance-feedback

- [x] 修改 `agents/ceo.md`，将“阶段反思强制介入”升级为“阶段验收回流路由”
- [x] 在 `agents/ceo.md` 中补充缺验收语句时要求 `@dev` 补齐的分支
- [x] 在 `agents/ceo.md` 中补充识别发起需求 agent 角色并 mention 其逐条验收的分支，保持 `as=ceo`
- [x] 更新 `tests/format-ceo.test.ts`，覆盖 persona 文本合约、`hermes-user` 发起的验收回流 append、缺验收语句补齐 append
- [x] 更新 `AGENTS.md`，同步 CEO 阶段验收回流与缺清单补齐描述
- [x] 运行 `pnpm test -- tests/format-ceo.test.ts`
- [x] 运行 `pnpm test`
- [x] 运行 `pnpm typecheck`
- [x] code-verified 后按验收结果追记证据到 `docs/roadmap/milestone-1-acceptance-loop.md` T2 并勾选
