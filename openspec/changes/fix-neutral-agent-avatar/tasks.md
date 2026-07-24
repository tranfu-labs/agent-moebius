# 任务:fix-neutral-agent-avatar

- [ ] grep `--ident-` 全库找消费者;记结果决定是解耦 avatar 还是一并删令牌
- [ ] 改 `packages/console-ui/src/console/agent-initial-avatar.tsx:34-37`:走 `bg-card / border-line / text-ink`,删 hash-select 派色
- [ ] (若 `--ident-*` 无其他消费者)从 `packages/console-ui/src/styles/tokens.css` 删令牌
- [ ] 复查 3 个消费点(agent-teams-page.tsx:1081, agent-team-detail.tsx:468, agent-team-detail.tsx:546)对应测试是否有身份色断言,一并改
- [ ] `pnpm typecheck` + `pnpm --filter @moebius/console-ui test`(涉及 agent-teams-page + agent-team-detail 测试)全绿
- [ ] 写 spec-delta 一条 Requirement 进 `openspec/changes/fix-neutral-agent-avatar/spec-delta/console-ui/spec.md` 覆盖「avatar 为中性首字,不用身份色」
- [ ] 写 .task-done.json,phase="implement",status="done"|"failed"|"needs-review"
