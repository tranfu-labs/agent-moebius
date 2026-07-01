# github-issue-runner spec delta

## 修改
- 把「MUST NOT 在调度业务逻辑内设置默认 Codex driver 并发限制；未显式配置 pool `maxConcurrent` 时，driver jobs MAY 在本轮 due work set 和既有窗口边界内无额外 pool 限制地启动。」改为：「MUST 在调度业务逻辑注入 Codex driver pool 时使用默认并发上限 `CODEX_DRIVER_POOL_MAX_CONCURRENT = 5`；`src/driver-pool.ts` 抽象本身仍允许 `undefined` 或 `null` 表示无限制，以便测试注入 fake pool。」

## 新增
- MUST 把 `CODEX_DRIVER_POOL_MAX_CONCURRENT` 写入启动日志 `CONFIG_LOG_FIELDS`（字段名 `codexDriverPoolMaxConcurrent`）。
- MUST 通过编排层导出函数 `createDefaultCodexDriverPool()` 装配默认 driver pool；`DEFAULT_TICK_DEPENDENCIES.driverPool` 由该函数初始化，便于测试直接对默认 pool 断言并发行为。
