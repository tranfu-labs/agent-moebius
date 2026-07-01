# 提案：limit-codex-driver-pool-by-default

## 背景
当前 `src/runner.ts` 通过 `createDriverPool()` 无参构造 driver pool，`src/driver-pool.ts` 在 `maxConcurrent` 未传时走 `runImmediately` 直通壳——等于没有并发上限。tick 内部又用 `Promise.all` 把所有 due 的 issue 一次性扔给 pool，任何一个 `runCodex` 或 `startAgentRunInterruptMonitor` hang 住都会：

- 独占一个 job promise 永不 resolve；
- 让整个 tick 无法结束；
- 后续 tick 全部走 `skip-overlap`，所有 issue 一起停摆。

上一次事故 `tranfu-labs/tranfu-agents-app#64` 就是 `gh reactions` 网络 EOF 后 codex 阶段疑似 hang 住，`reaction-failed` 只是表象，真正的问题是 pool 从未真正限流。

同时项目里 driver pool 的语义模糊——它其实只包"可能调用 codex driver 的 issue job"，术语上应统一叫 **codex driver pool**。

## 提案
1. 新增运行参数 `CODEX_DRIVER_POOL_MAX_CONCURRENT = 5`，写入 `src/config.ts` 与启动日志 `CONFIG_LOG_FIELDS`。
2. 在 `src/runner.ts` 新增并导出 `createDefaultCodexDriverPool()`，其实现用 `createDriverPool({ maxConcurrent: CODEX_DRIVER_POOL_MAX_CONCURRENT })`；`DEFAULT_TICK_DEPENDENCIES` 用它初始化 `driverPool`。
3. `src/driver-pool.ts` **不改**——保留 `undefined` / `null` 表示无限制的语义，方便测试注入 fake pool；默认限流决策在 runner 编排层完成，不下沉到抽象层。
4. 更新 `AGENTS.md` 中关于 driver pool 默认策略的描述。
5. 更新 `openspec/specs/github-issue-runner/spec.md` 里对应规则：把「MUST NOT 默认限流」改为「MUST 默认 5」，并新增写入 `CONFIG_LOG_FIELDS` 的规则。
6. 更新 `docs/architecture/runner-driver-pool.svg` 事实源图，反映"5 slot 限流 + 排队"的新形状。

## 影响
- **业务行为**：单 runner 进程内，同时运行的 codex driver job 上限从"无限"降为 5。低负载下无感；高负载下部分 issue 会短暂排队，避免机器被撑爆或 gh CLI 抢连接互相拖累。
- **hang 隔离**：一个 codex hang 现在只吃掉 1 个槽而不是整个 tick——tick 仍可结束（其余 4 槽的 job 完成即可），后续 tick 不再被无限期 `skip-overlap` 全体锁死。
- **测试与注入**：`driver-pool.ts` 抽象层未变，现有 4 条 `driver-pool.test.ts` 全部保留；runner 层新增 2 条测试断言默认 pool 真的限流到 5 且 hang job 不阻塞其他槽。
- **配置扩展面**：目前 5 是硬编码常量，未通过 `config.local.toml` 覆盖；未来需要机器差异化并发时再另立 change 引入。
- **模块边界**：`src/driver-pool.ts` 仍无 `src/config.ts` 依赖；`src/runner.ts` 作为编排层承担"注入默认 pool"的决策。
