# 任务：2026-07-03-add-secretary-agent

- [x] 新建 `agents/secretary.md` persona，声明 `src/agent-prescripts/current-repo-workspace.ts`，并写明采访、OpenSpec、CEO 规则维护边界与 `in-progress` 输出契约
- [x] 新建 `src/agent-prescripts/current-repo-workspace.ts`，返回当前 moebius 仓库根目录作为 `codexCwd`
- [x] `src/agent-prescripts/index.ts` 注册 current repo preScript
- [x] `src/format-ceo.ts`：`CEO_APPEND_ROLES` 追加 `"secretary"`
- [x] `agents/ceo.md`：真实可触发 agent 清单、`append.as` 允许集合与 secretary / CEO 职责边界同步更新
- [x] `docs/architecture/module-map.md` 与 `AGENTS.md`：同步 secretary agent 与 current repo preScript 职责边界
- [x] `tests/conversation.test.ts` / trigger 相关测试：覆盖 `@secretary` 能作为普通 mention agent 被选中
- [x] `tests/format-ceo.test.ts`：覆盖 `as=secretary` 合法
- [x] `tests/agent-prescripts` 或新增测试：覆盖 current repo preScript 返回仓库根目录且不写 context state
- [x] `tests/runner.test.ts`：覆盖带 preScript 的 secretary agent 会把 `codexCwd` 传给 Codex
- [x] `pnpm test` + `pnpm typecheck` 全绿
