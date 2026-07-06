# github-issue-runner spec delta：codex-idle-watchdog

## 修改行为规则

### 替换（原「总时长看门狗」规则）

原规则：

> - MUST 为单次本地 codex run 设置总时长看门狗上限 `CODEX_RUN_MAX_DURATION_MS`；超时 MUST 通过既有 `AbortController` 中止该 run；即使 driver promise 永不 settle，runner 也 MUST 先合成 timeout failure 让 issue job settle，记录 `event = "codex-watchdog-timeout"` 并将该次处理判为 `failed`（区别于收到新消息的 `interrupted`），以兜底 in-flight job 永不返回导致的 `skip-inflight` 死锁。

替换为：

> - MUST 让 `src/codex.ts` 的 `run()` 在每次 codex 运行内部独立计时两类看门狗，兜底 in-flight job 永不返回导致的 `skip-inflight` 死锁：
>   - **空闲看门狗（主防线）**：连续 `CODEX_RUN_IDLE_TIMEOUT_MS`（默认 10 分钟）无 stdout 输出即判定卡死；每收到一块 stdout 数据 MUST 重置空闲倒计时；stderr 输出 MUST NOT 算作活动。
>   - **总时长硬上限（兜底）**：单次 run 总时长达到 `CODEX_RUN_MAX_DURATION_MS`（默认 120 分钟）即终止，无视输出活动，防止持续输出的死循环 agent 永久占住 issue。
> - MUST 让 resume 尝试与 resume 失败后的 fallback 全量重跑各自作为独立 run 计时，MUST NOT 共享同一个看门狗预算。
> - 看门狗到期 MUST 在 `run()` 内部以分级方式终止子进程（SIGINT → SIGTERM → SIGKILL），MUST NOT 占用用户中断专用的 `AbortController`；返回 `ok: false` 且 reason 分别为 `idle-timeout:<ms>ms` / `max-duration-timeout:<ms>ms`。
> - 任一终止路径（看门狗或用户中断）触发后 MUST 保证 `run()` 的返回 promise 在有限时间内 settle：分级终止走完后即使子进程 `close` 事件不触发（如孙进程持有 stdio 管道），也 MUST 强制合成结果返回——承接原规则"即使 driver promise 永不 settle 也 MUST 先合成 timeout failure 让 issue job settle"的活性保障（旧的 runner 层 race 兜底任何形式的挂起，含中断后挂起），避免 driver pool 名额与 issue job 被永久占住。
> - 用户中断（signal abort）与看门狗竞争时，先发生者决定 reason：先 abort 则维持 `interrupted:*`，先超时则为超时类型；两类超时 reason MUST NOT 以 `interrupted:` 开头，避免被误判为用户插话。
> - runner MUST 按 reason 前缀分流日志：`idle-timeout:*` 记 `event = "codex-idle-timeout"`，`max-duration-timeout:*` 记 `event = "codex-watchdog-timeout"`（语义收窄为仅硬上限超时），两者均含 `timeoutMs` 字段并将该次处理判为 `failed`，走既有失败重试链路（区别于收到新消息的 `interrupted`）。

### 替换（原启动日志字段规则）

原规则：

> - MUST 把 `GITHUB_CLI_RETRY_POLICY` 与 `CODEX_RUN_MAX_DURATION_MS` 写入启动日志 `CONFIG_LOG_FIELDS`。

替换为：

> - MUST 把 `GITHUB_CLI_RETRY_POLICY`、`CODEX_RUN_MAX_DURATION_MS` 与 `CODEX_RUN_IDLE_TIMEOUT_MS` 写入启动日志 `CONFIG_LOG_FIELDS`。

## 新增场景

### 场景 W1：活跃运行不被硬上限之前的空闲看门狗误杀
Given 一次 codex run 持续产出 stdout 事件（任意两次输出间隔小于 `CODEX_RUN_IDLE_TIMEOUT_MS`）
And 总时长未达 `CODEX_RUN_MAX_DURATION_MS`
When 运行继续
Then 两类看门狗均不触发，run 正常结束并按 `ok: true` 处理

### 场景 W2：静默进程被空闲看门狗终止
Given 一次 codex run 先有输出、随后连续 `CODEX_RUN_IDLE_TIMEOUT_MS` 无任何 stdout 数据
When 空闲倒计时到期
Then `run()` 分级终止子进程并返回 `ok: false, reason = "idle-timeout:<ms>ms"`
And runner 记录 `event = "codex-idle-timeout"`（含 `timeoutMs`）
And 该次处理判为 `failed`，进入 `issue-retry-scheduled` 失败重试链路

### 场景 W3：持续输出的死循环被硬上限兜底
Given 一次 codex run 持续产出 stdout 但总时长达到 `CODEX_RUN_MAX_DURATION_MS`
When 硬上限到期
Then `run()` 返回 `ok: false, reason = "max-duration-timeout:<ms>ms"`
And runner 记录 `event = "codex-watchdog-timeout"` 并判 `failed`

### 场景 W4：fallback 重跑拿到独立看门狗预算
Given resume 尝试运行了任意时长后以非中断原因失败
When runner 进入 fallback 全量重跑
Then fallback 的 run 从零开始计时空闲与硬上限看门狗
And 不继承 resume 尝试已消耗的预算

### 场景 W5：用户插话优先于看门狗
Given 一次 codex run 因 interrupt monitor 观察到新消息而被 abort
And abort 发生在任一看门狗到期之前
When run 结束
Then reason 保持 `interrupted:*`，处理结果为 `interrupted` 而非 `failed`
