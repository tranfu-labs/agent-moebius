# 提案：codex-idle-watchdog

## 背景

当前单次 codex run 的唯一防线是 `CODEX_RUN_MAX_DURATION_MS = 30 分钟`的总时长硬上限看门狗（`src/runner.ts`），存在两个已被线上运行证实的问题：

1. **活跃运行被冤杀**：看门狗只看总时长、不看有无输出。2026-07-06 的 count=47 运行（tranfu-labs/tranfucom#10）中，codex 正在跑测试、tsc 全部通过、持续产出 stdout，仍在到点后被硬掐，issue 被判失败进入重试。
2. **fallback 共享定时器**：看门狗定时器在整个 issue 处理开始时启动一次，resume 尝试失败（同次运行中耗时 17 分钟）后进入 fallback 全量重跑时不重置，fallback 只拿到剩余 13 分钟预算就被杀。

## 提案

把超时控制从 runner 层的"整个 issue 处理共享一个定时器"下沉到 `src/codex.ts` 的 `run()` 内部，每次 codex 运行独立计时，并引入空闲检测：

- **空闲看门狗（主防线）**：连续 10 分钟无 stdout 输出才判定卡死，杀进程并返回 `idle-timeout` 失败。每来一条输出重置倒计时。
- **总时长硬上限（兜底）**：从 30 分钟调大到 120 分钟，防止持续输出但陷入死循环的 agent 永久占住 issue；每次 run（含 fallback）独立计满。
- **超时后的处理保持现状**：走既有 `failedIssueProcessingOutcome` → `issue-retry-scheduled` 失败重试链路（`failureRetryLimit = 5`），仅日志事件与 reason 区分空闲超时与硬上限超时。
- **阈值配置化**：新增 `CODEX_RUN_IDLE_TIMEOUT_MS`（默认 10 分钟），与既有 `CODEX_RUN_MAX_DURATION_MS` 同级，均出现在启动日志的 config 对象中。不扩 `config.toml` 的 schema（它目前只承载 `watchRepositories`）。

## 影响

- `src/config.ts`：新增空闲阈值常量；硬上限 30 → 120 分钟；启动日志 config 对象新增 `codexRunIdleTimeoutMs` 键。
- `src/codex.ts`：`run()` 新增可选超时参数与内部双定时器；新增两类失败 reason：`idle-timeout:<ms>ms`、`max-duration-timeout:<ms>ms`。
- `src/runner.ts`：删除共享看门狗机制（`Promise.race` + `resolveWatchdogResult` + `codexWatchdog.fired`）；新增日志事件 `codex-idle-timeout`；既有事件 `codex-watchdog-timeout` 语义收窄为仅硬上限超时。
- 对外行为：GitHub 侧无可见变化；日志消费者会看到新事件名与新 reason 前缀。
- 用户插话中断（interrupt monitor + AbortController）机制不动，`interrupted:*` 语义不变。
