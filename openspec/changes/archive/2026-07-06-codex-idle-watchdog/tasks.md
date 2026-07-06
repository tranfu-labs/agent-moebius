# 任务：codex-idle-watchdog

- [x] `src/config.ts`：新增 `CODEX_RUN_IDLE_TIMEOUT_MS`（10 分钟）；`CODEX_RUN_MAX_DURATION_MS` 调为 120 分钟；启动日志 config 对象补 `codexRunIdleTimeoutMs`。
- [x] `src/codex.ts`：抽出可测的双定时器控制单元（空闲 + 硬上限，`recordActivity` / `clear` / 单次超时回调）。
- [x] `src/codex.ts`：`CodexRunOptions` 增 `idleTimeoutMs` / `maxDurationMs`；`run()` 接线 stdout 活动重置、分级终止、超时 reason、退出清理、与 abort 的优先级。
- [x] `src/runner.ts`：删除共享看门狗机制；两处 `runCodex` 调用传超时参数；按 reason 前缀分流日志事件（`codex-idle-timeout` / `codex-watchdog-timeout`）并保持失败重试链路。
- [x] 测试 `tests/codex.test.ts`：定时器控制单元四例（空闲到期触发、活动重置、硬上限无视活动、清理后不触发）。
- [x] `src/codex.ts`：看门狗路径的有限时间 settle 保障——分级终止走完后不依赖 `close` 事件，强制合成超时结果返回。
- [x] 测试 `tests/codex.test.ts`：假 codex 二进制集成两例（先输出后静默 → `idle-timeout:*` 且进程被杀；持续输出超硬上限 → `max-duration-timeout:*`）。
- [x] 测试 `tests/runner.test.ts`：`idle-timeout:*` 记 `codex-idle-timeout` 事件并判 failed；resume 失败进 fallback 时两次 `runCodex` 调用均携带完整超时参数。
- [x] AI 验证：`npm test` 全绿；`npm run check`（tsc）通过。
