# 提案：add-driver-pool

## 背景

当前 runner 的 repository scan 与 active issue poll 都在 `tick()` 内顺序执行。只要某个 issue 进入 Codex driver 路径，本轮后续 issue 就必须等待它完成；这让调度业务逻辑、GitHub intake state 推进、Codex driver 执行耦合在同一个顺序循环里。

用户期望不是给 Codex 加一个默认并发限制，而是引入一个专门的 Codex / driver pool 概念，让 runner 调度业务数据逻辑可以独立测试，driver 并发策略可以单独替换。

## 提案

- 新增 `src/driver-pool.ts`，只接收 `() => Promise<T>` job；默认不施加额外并发限制，显式 `maxConcurrent` 为正整数时才队列限流。
- runner 在每轮 tick 中把 due changed issues 与 due active issues 转成 issue processing jobs，交给 driver pool 执行。
- 并发 job 不直接写完整 intake state；job 只返回 outcome，runner 主流程按稳定顺序折叠结果，保持 `.state/github-response-intake.json` 的确定性。
- 同一 processing phase 内按 `issueKey` 去重，避免同一个 issue 在同一阶段被处理两次。
- role thread state 与 agent context state 增加 issue + role entry 级 merge helper，避免并发成功结果覆盖彼此。
- Codex run directory 增加 runner 进程内递增后缀，保证同 timestamp / 同 message count 的并发 runs 也不会写到同一目录。

## 影响

- **新增模块**：`driver-pool`。
- **修改模块**：`github-issue-runner`、`role-thread-state`、`agent-context-state`、`agent-prescripts`。
- **对外行为**：默认不会额外限制 Codex driver 并发；如果未来把 `maxConcurrent` 接到配置，只会影响 driver pool 队列，不改变 intake / trigger / prompt 业务规则。
- **状态文件结构**：`.state/role-threads.json`、`.state/agent-contexts.json` 与 `.state/github-response-intake.json` shape 不变。
- **架构事实源**：新增 `docs/architecture/runner-driver-pool.svg`。
