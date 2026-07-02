# 任务：add-dev-manager-agent

- [ ] 新建 `agents/dev-manager.md` persona（通用、自包含：角色 / 技术决策与架构方法论 / 质量保证 / 工作流程 / 与对话对象协作 / 输出契约 + 两个输出模板；stage marker 固定 `in-progress`）
- [ ] `src/format-ceo.ts`：`CEO_APPEND_ROLES` 追加 `"dev-manager"`
- [ ] `agents/ceo.md`：生态认知章节"真实可触发 Codex agent 清单"追加 `dev-manager`
- [ ] `tests/conversation.test.ts`：`selectMentionedAgent("@dev-manager …")` 命中、dev-manager 评论归一化为 `speaker=dev-manager`
- [ ] `tests/`（format-ceo 契约）：`isCeoAppendRole("dev-manager") === true`
- [ ] `tests/runner.test.ts`：CEO guardrail 循环纳入 `dev-manager`
- [ ] `pnpm test` + `pnpm typecheck` 全绿
