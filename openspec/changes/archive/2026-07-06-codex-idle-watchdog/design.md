# 设计：codex-idle-watchdog

## 方案

### 核心动作：超时控制下沉到 `codex.run()` 内部

`run()`（`src/codex.ts`）已经持有 `child.stdout`，是空闲检测最直接的挂载点——监听数据事件即可，无需轮询 `stdout.jsonl` 文件的修改时间。下沉后每次 `run()` 调用独立计时，resume 尝试与 fallback 全量重跑各自拿完整预算，共享定时器的冤杀问题自然消失。

### `src/config.ts`

- 新增 `CODEX_RUN_IDLE_TIMEOUT_MS = 10 * 60 * 1000`。
- `CODEX_RUN_MAX_DURATION_MS` 改为 `120 * 60 * 1000`。
- 启动日志的 config 对象新增 `codexRunIdleTimeoutMs`。

### `src/codex.ts`

- `CodexRunOptions` 新增可选项 `idleTimeoutMs`、`maxDurationMs`；缺省不启用对应定时器，保持 `run()` 可独立测试、不强迫所有调用方关心超时。
- 定时器控制逻辑抽成独立可测单元（导出），职责：
  - 启动时同时挂空闲定时器与硬上限定时器；
  - `recordActivity()` 重置空闲定时器（硬上限不受影响）；
  - 任一到期触发一次超时回调并携带类型（idle / max-duration）；
  - `clear()` 后不再触发；已触发后重复到期不重复回调。
- `run()` 接线：
  - spawn 后立即启动控制器（进程从头到尾零输出也要能触发空闲超时）；
  - `child.stdout` 每来一块数据调 `recordActivity()`（挂在数据事件上，与现有 `pipe` 到文件并存）；
  - 超时回调复用现有 `handleAbort` 的分级终止：SIGINT → 5 秒 → SIGTERM → 5 秒 → SIGKILL；
  - **有限时间 settle 保障**：任一终止路径（看门狗或用户中断）走完分级终止（SIGKILL 宽限期后）若子进程的 `close` 事件仍未触发（如孙进程继承并持有 stdio 管道），MUST 强制以合成结果 settle `run()` 的返回 promise，不依赖 stdio 关闭——这是旧规则"即使 driver promise 永不 settle 也要合成 timeout failure"的活性保障在下沉后的等价物（旧的 runner 层 race 兜底的是任何形式的挂起，含中断后挂起，所以这里对两条终止路径统一武装），缺了它 driver pool 名额与 issue job 都会被永久占住；
  - 返回 `ok: false`，reason 为 `idle-timeout:<配置毫秒数>ms` 或 `max-duration-timeout:<配置毫秒数>ms`；
  - 优先级：用户中断（signal abort）先发生时维持 `interrupted:*` reason，超时后到的不覆盖；反之超时先发生则 reason 为超时类型；
  - 所有退出路径统一 `clear()` 定时器。

### `src/runner.ts`

- 删除共享看门狗机制（现 850-899 行的 `watchdogResult` Promise、`runCodexWithWatchdog`、`codexWatchdog.fired`、`resolveInterruptedOutcome` 中的 watchdog 分支）。
- 初跑与 fallback 两处 `runCodex` 调用直接传 `idleTimeoutMs: CODEX_RUN_IDLE_TIMEOUT_MS`、`maxDurationMs: CODEX_RUN_MAX_DURATION_MS`。
- 结果分流（在既有 `!result.ok` 处理处）：
  - reason 以 `idle-timeout:` 开头 → 记日志事件 `codex-idle-timeout`（字段对齐现有 `codex-watchdog-timeout`：count、runDir、agent、issueKey、timeoutMs）；
  - reason 以 `max-duration-timeout:` 开头 → 记既有事件名 `codex-watchdog-timeout`；
  - 两者都走 `failedIssueProcessingOutcome`，进既有失败重试链路；
  - `interrupted:*` 的用户插话判定不变。

## 权衡

- **下沉到 codex.ts vs 留在 runner.ts 重置定时器**：留在 runner 层需要 codex 暴露活动回调、且 fallback 分支要手动重置两个定时器，接缝更多；下沉后 per-run 语义天然成立，runner 净删代码。runner 层原有的"即使 driver promise 永不 settle 也能合成超时失败"兜底不是被放弃，而是等价搬入 `run()` 的"有限时间 settle 保障"（见方案）：定时器在进程内、终止升级到 SIGKILL、宽限期后强制合成结果，三段都不依赖子进程配合。spawn 本身失败已有 `spawn-error` 路径。
- **监听 stdout 数据事件 vs 轮询文件 mtime**：数据事件零延迟、无 IO、无轮询间隔参数；放弃 mtime 方案没有损失（stderr 输出不算活动——codex exec 的进展信号都走 stdout jsonl，stderr 只有诊断噪音，若把 stderr 算活动反而会让刷警告日志的卡死进程逃过检测）。
- **超时不复用 AbortController 而由 run() 内部杀进程**：signal 保留给用户插话专用，reason 前缀即可区分三种终止（interrupted / idle-timeout / max-duration-timeout），runner 不再需要 `codexWatchdog.fired` 这种旁路状态。
- **硬上限 120 分钟**：用户显式确认的取值。放弃了"更早发现死循环"，换取长任务（大型重构、慢测试套件）不被误杀；死循环但持续输出的场景最坏浪费 120 分钟 × 5 次重试的算力，可接受。

## 风险

- **codex exec 长时间静默但仍在工作**（如单条命令跑 15 分钟不产生中间事件）会被误判卡死。缓解：codex exec 的 jsonl 事件流按 item 开始/结束持续输出，超过 10 分钟完全无事件的健康场景罕见；阈值是具名常量，误杀率高时调大即可；且失败会重试，不是永久放弃。
- **日志语义变化**：`codex-watchdog-timeout` 从"唯一超时事件"收窄为"硬上限超时"，依赖旧 reason 格式 `codex-run-timeout:<ms>ms` 的日志消费者需知晓。目前该 reason 只进 `issue-retry-scheduled` 的 reason 字段与失败评论文案，无程序化消费者。
- **回滚思路**：改动集中在三个文件且互相独立可回退；极端情况把 `idleTimeoutMs` 传参去掉即回到纯硬上限行为。
