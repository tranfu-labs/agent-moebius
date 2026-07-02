# 提案：decouple-scan-from-execution

## 背景
当前 `src/runner.ts` 的 `tick()` 是一条单体流水线：加载 intake state → 扫描仓库 → 把 due 的 issue jobs 交给 driver pool → `Promise.all` 等待**全部** job 结束 → 折叠结果 → 保存 state，并用全局 `running` 互斥防重入。

driver pool 的并发上限 5 只在「同一轮 tick 内同时就绪的 job 之间」生效——批内并发、批间串行。任何一个 codex 长跑（真实日志：`tranfu-labs/tranfu-agents-app#67` 的 dev job 从 03:13 跑到 03:22 仍未结束）都会让 tick 无法返回，后续每分钟的 tick 全部 `skip-overlap`。期间：

- 新 issue、新评论完全不被扫描，其他 issue 的响应停摆；
- 同批先完成的 job（#68 用 1 分钟就评论完成）的结果也要等最慢的 job 结束才能落盘。

根因是把「同一 issue 必须串行处理」这个 issue 级约束，用一把全局锁放大成了系统级串行。

## 提案
把「扫描派发」与「codex 执行」解耦，按三条真实约束逐一对应实现：

| 真实约束 | 承载原语 |
|---|---|
| 同一 issue 串行处理 | in-flight 集合：在跑的 issue 不重复派发，靠心跳从状态重推导后续工作 |
| 不同 issue 互相独立 | job 各自经驱动池执行、完成即独立折叠回写，互不等待 |
| 全局 codex 并发 ≤ 5 | 现有 `driver-pool.ts` 原样保留 |

具体改动：

1. 新增 `src/state-persister.ts`：intake state 的**单写者**。内存持有唯一权威状态，所有变更以纯函数变换同步应用，文件写入串行化 + 可合并（连续变更只落盘最新快照），沿用现有原子写；文件格式不变。
2. 新增 `src/scanner.ts`：发现层。把 `tick()` 里的 due 仓库扫描搬出，扫描结果通过 persister 以纯变换应用，返回 changed issues。
3. 新增 `src/issue-dispatcher.ts`：派发层。维护 in-flight issue 集合（在跑的记 `skip-inflight` 跳过）；job 经驱动池执行，**完成即**把结果折叠进 persister 并触发落盘（异常路径同样保证从集合移除）；折叠后执行 active 上限策略且不降级在跑 issue。
4. 重构 `src/runner.ts`：`tick()` 一族（`running` 互斥、`processIssueJobs`、`Promise.all` 等待、tick 末尾统一落盘）删除，替换为**心跳** `heartbeat()`：扫描 → 计算 due active → 批内去重 → 派发，从不等待 job 执行。心跳自身保留防重入（仅覆盖秒级的扫描派发阶段）。
5. `processIssueSource`、trigger、CEO guardrail、self-reflect、中断监控等 issue 处理流水线**不动**；`github-response-intake.ts` 纯函数全部保留，仅 `enforceActiveIssueLimit` 增加「排除在跑 issue」参数。

## 影响
- **业务行为**：长跑 codex 只占驱动池 1 个名额，不再阻塞扫描入口；新 issue / 新评论在下一次心跳（≤1 分钟）即被发现并派发；先完成的 job 结果立即落盘，不等最慢的批友。
- **状态语义**：job 运行期间该 issue 的 intake state 不推进，完成后一次性折叠；心跳依据折叠后的状态重推导 due 工作，事件不排队（等价于容量为 1、最新快照胜出的信箱）。崩溃语义与现在等价：未折叠的 in-flight 结果丢失后，重启靠 `updatedAt` 比对重新发现工作，且落盘频率从每 tick 一次提高到每次变更即调度，崩溃丢失窗口更小。
- **日志**：长跑期间不再出现连排 `skip-overlap`；新增 `skip-inflight` 事件标识在跑防重。`skip-overlap` 保留但仅在扫描阶段本身超过心跳间隔时出现（罕见）。
- **模块边界**：`runner.ts` 进一步瘦身为组装 + 心跳编排；调度纯规则仍集中在 `github-response-intake.ts`；`driver-pool.ts`、`processIssueSource` 及其下游零改动。
- **测试**：`tests/runner.test.ts` 的 tick 编排用例改写为心跳 + dispatcher 用例；新增 persister / scanner / dispatcher 三个单测文件；`processIssueSource`、driver-pool、makeRunDir 等既有用例不受影响。
