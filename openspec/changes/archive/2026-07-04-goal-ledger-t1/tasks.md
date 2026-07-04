# 任务：goal-ledger-t1

- [x] 新增 `src/goal-ledger.ts`：定义目标、里程碑、任务、阶段、质量基准、父子 issue 关系、provenance 与 run manifest reference schema。
- [x] 在 `src/goal-ledger.ts` 中实现目标采访入账纯函数、缺字段计算、ready gate 与不可变更新 helper。
- [x] 新增 `src/goal-ledger-state.ts` 与 `GOAL_LEDGER_STATE_PATH`：实现 `.state/goal-ledger.json` 缺失加载、shape 校验、原子保存、entry-level merge helper、写串行化、可注入 IO 与可配置 deadline / AbortSignal 包装入口。
- [x] 新增 `tests/goal-ledger.test.ts`：覆盖 schema 不变量、部分接收入账、补齐后 ready、run manifest 引用 locator 与碰撞处理。
- [x] 新增 `tests/goal-ledger-state.test.ts`：覆盖缺失文件、保存后可加载、兼容 / 非法 schema、writeFile 失败旧账本不丢、rename 失败旧账本不丢、慢 IO 串行等待、timeout / abort 后锁释放、并发 entry merge 不覆盖。
- [x] 更新 `docs/architecture/module-map.md`、`AGENTS.md`，并保持本 change 的 `spec-delta/goal-ledger/spec.md` 覆盖新模块边界、状态文件和禁止依赖。
- [x] 跑 `pnpm test -- goal-ledger`、`pnpm test`、`pnpm typecheck`。
- [x] 实现验收全部通过后，在 `docs/roadmap/milestone-3-orchestration.md` 的 T1 下追记验收证据并勾选任务。
