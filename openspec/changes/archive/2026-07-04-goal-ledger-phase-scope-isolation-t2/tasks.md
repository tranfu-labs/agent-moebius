# 任务：goal-ledger-phase-scope-isolation-t2

- [x] 在 `src/goal-ledger.ts` 中扩展 phase schema：`objective`、`acceptanceStatements`、`dependencies`、通用 typed artifact references、归档摘要与归档时间。
- [x] 在 `src/goal-ledger.ts` 中实现 active phase 唯一性校验、`switchActivePhase`、`projectActivePhaseContext` 与 `listArchivedPhaseReferences`，保持纯业务模块边界。
- [x] 新增 / 扩展 `tests/goal-ledger.test.ts`，覆盖阶段切换、缺归档输入 fail-closed、重复切到当前 active 的 no-op、归档引用、projection 排除旧产物、phase baseline 优先级、旧 T1 phase 兼容加载、不同 owner active phase 隔离、typed artifact reference 边界、无 active 与多个 active 的 fail-closed 行为。
- [x] 更新本 change 的 `spec-delta/goal-ledger/spec.md`，覆盖 T2 新行为与非目标。
- [x] 跑 `pnpm test -- goal-ledger --reporter=verbose`、`rg -n "node:fs|from 'fs'|child_process|src/github|src/codex|shell" src/goal-ledger.ts`、`pnpm test`、`pnpm typecheck`。
- [x] 按实现后的事实更新 `docs/architecture/module-map.md`、`AGENTS.md` 中受影响的 goal-ledger 描述。
- [x] 实现验收全部通过后，在 `docs/roadmap/milestone-3-orchestration.md` 的 T2 下追记验收证据并勾选任务。
