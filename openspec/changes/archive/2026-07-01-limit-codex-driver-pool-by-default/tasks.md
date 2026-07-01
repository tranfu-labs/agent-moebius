# 任务：limit-codex-driver-pool-by-default

- [ ] TDD Red：`tests/runner.test.ts` 新增 describe「codex driver pool default limit」
  - [ ] 断言 `CODEX_DRIVER_POOL_MAX_CONCURRENT === 5`
  - [ ] 断言 `createDefaultCodexDriverPool()` 跑 7 个 hang 住的 job 时同时运行数不超过 5
  - [ ] 断言 `createDefaultCodexDriverPool()` 里 1 个 hang job 不阻塞其他 4 个槽正常完成，且第 6 个 job 能在 hang job 之外的槽腾出后启动
- [ ] TDD Red：跑 `pnpm test`，确认上面 3 条新增测试挂红（`CODEX_DRIVER_POOL_MAX_CONCURRENT` / `createDefaultCodexDriverPool` 尚未导出）
- [ ] TDD Green：`src/config.ts` 新增 `CODEX_DRIVER_POOL_MAX_CONCURRENT = 5`，塞进 `CONFIG_LOG_FIELDS`（字段名 `codexDriverPoolMaxConcurrent`）
- [ ] TDD Green：`src/runner.ts` 导出 `createDefaultCodexDriverPool()`；`DEFAULT_TICK_DEPENDENCIES.driverPool` 改用它初始化
- [ ] TDD Green：跑 `pnpm test`，确认新增测试全绿、历史测试无回归
- [ ] TDD Green：跑 `pnpm typecheck` 确认类型无回归
- [ ] 更新 `AGENTS.md` line 68 附近关于 driver pool 默认行为的描述，改为"默认限制 5 并发（`CODEX_DRIVER_POOL_MAX_CONCURRENT`），可通过 `createDriverPool({ maxConcurrent })` 显式覆盖"
