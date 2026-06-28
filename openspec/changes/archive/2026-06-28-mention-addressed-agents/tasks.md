# 任务：mention-addressed-agents

- [x] 更新 `src/config.ts`，用 `AGENTS_DIR` 替代固定 `AGENT_MD_PATH`。
- [x] 在 `src/conversation.ts` 增加最新消息、mention 解析和 agent 选择纯函数。
- [x] 更新 `src/runner.ts`，扫描 `agents/*.md` 并按最新消息中的有效 mention 选择 persona。
- [x] 增加 conversation 单元测试覆盖有效 mention、未知 mention、最新消息优先、偶数 count 仍可触发和多 agent 确定选择。
- [x] 运行 `pnpm test` 与 `pnpm typecheck`。
