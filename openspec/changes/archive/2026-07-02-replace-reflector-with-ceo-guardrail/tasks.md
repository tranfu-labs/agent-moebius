# 任务：replace-reflector-with-ceo-guardrail

- [x] 更新 `agents/ceo.md`：加入 `plan-written` / `code-verified` 强制 append 规则，删除旧 reflector 机制的现存角色表述。
- [x] 删除 `agents/reflector.md`。
- [x] 删除 reflector trigger 与 self-reflect 辅助，并让 `src/triggers/index.ts` 只保留 mention trigger。
- [x] 简化 `src/runner.ts`：移除 post 后 self-reflect loop、相关日志与 `lastReflectorHook` 传参。
- [x] 更新 `src/format-ceo.ts`：删除 `reflector` append role，移除 `lastReflectorHook` prompt 字段。
- [x] 清理 `src/config.ts`、`src/stages.ts` 中仅服务 reflector/self-reflect 的常量与导出。
- [x] 更新单元测试：trigger、runner、format-ceo、stages、config 相关期望与旧 reflector 行为移除。
- [x] 更新 `AGENTS.md`、`docs/architecture/module-map.md` 与相关事实说明。
- [x] 运行 `pnpm test`。
- [x] 运行 `pnpm typecheck`。
