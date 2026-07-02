# github-issue-runner spec delta

## 修改
- 把「MUST 作为常驻进程运行，并在启动时立即跑一轮，然后按配置的 tick 间隔轮询；默认 tick 间隔为 1 分钟，用于承载 active issue 轮询。」改为：「MUST 作为常驻进程运行，并在启动时立即跑一轮心跳，然后按配置的心跳间隔轮询；默认心跳间隔为 1 分钟。心跳只负责仓库扫描、due 判定与 issue job 派发，MUST NOT 等待任何 issue processing job 完成。」
- 把「MUST 保持 tick 级防重入：上一轮 tick 仍在等待 driver pool jobs 时，同一 runner 进程 MUST NOT 启动新 tick。」改为：「MUST 保持心跳级防重入：上一轮心跳的扫描派发阶段尚未返回时，同一 runner 进程 MUST NOT 启动新心跳（记录 `event = "skip-overlap"`）；正在执行的 issue processing jobs MUST NOT 阻止后续心跳的扫描与派发。」
- 把「MUST 在同一 processing phase 内按 `issueKey` 去重 issue processing jobs，避免同一 GitHub issue 在一个 tick 的同一阶段被处理两次。」改为：「MUST 在同一轮心跳内按 `issueKey` 去重 issue processing jobs；并 MUST 维护跨心跳的 in-flight issue 集合：已有 job 在执行的 issue 在后续心跳 MUST NOT 重复派发，MUST 记录 `event = "skip-inflight"` 与 `issueKey`；job settle（成功、失败或异常）后 MUST 从集合移除该 issue。」
- 把「MUST 在 driver jobs 完成后按确定顺序把 job result 折叠回 `.state/github-response-intake.json`，而不是让并发 jobs 各自覆盖完整 intake state snapshot。」改为：「MUST 在每个 driver job 完成时立即把其 result 以纯函数折叠进单写者持有的内存 intake state 并调度落盘；并发完成的 jobs 的折叠 MUST 互不覆盖，MUST NOT 等待同批其他 job 完成后统一落盘。」

## 新增
- MUST 把 intake state 的内存持有与文件落盘分离：所有状态变更通过单写者以纯函数变换同步应用；文件写入 MUST 串行化且可合并（写进行中的新变更合并为最新快照的一次后续写），并保持原子写；写失败 MUST 记录日志且 MUST NOT 中断运行，后续变更 MUST 重试落盘。
- MUST 在 issue job 运行期间不推进该 issue 的 intake state；由 job 完成后的折叠一次性推进，后续心跳依据折叠后的状态重新推导 due 工作（对在跑 issue 的中途变化不排队、不重放，等价于容量为 1、最新快照胜出的信箱）。
- MUST 让 active issue 数量上限策略不降级 in-flight issue；由此产生的瞬时超额由后续折叠收敛。
- MUST 在仓库扫描中先完成异步列表拉取、再以纯变换把扫描结果应用到当前内存状态，MUST NOT 用异步期间的旧状态快照整体覆盖执行侧已折叠的结果。
- 崩溃语义：in-flight job 未折叠的结果随进程丢失后，重启 MUST 依靠 `updatedAt` 比对重新发现待处理工作，MUST NOT 依赖额外持久化的执行中标记。

## 场景修改
- 场景 32.3 标题与内容改为「driver pool — 并发 issue jobs 完成即独立折叠」：
  Given 同一轮心跳中 issue A 与 issue B 都到期
  And 两个 jobs 通过 driver pool 并发执行
  When issue A 的 job 先完成
  Then A 的 outcome 立即折叠进内存 intake state 并调度落盘，不等待 B
  And B 完成后其 outcome 同样折叠，`.state/github-response-intake.json` 同时保留 A 与 B 的处理结果
  And 任一 job 的完成先后顺序不改变各自折叠结果

## 场景新增
- 场景：长跑 job 不阻塞其他 issue
  Given issue #67 的 dev job 正在执行一个长跑 Codex（数分钟未结束）
  And issue #68 在此期间收到包含有效 trigger 的新评论
  When 下一次心跳到来
  Then 心跳正常完成仓库扫描并发现 #68 的变化
  And #68 的 job 被派发并全流程处理完成（评论、折叠、落盘）
  And 日志不出现因 #67 长跑导致的连排 `skip-overlap`
- 场景：in-flight issue 防重复派发
  Given issue #67 的 job 正在执行
  And 后续心跳再次把 #67 判定为 due（`updatedAt` 变化或 active poll 到期）
  When 心跳尝试派发 #67
  Then 系统记录 `event = "skip-inflight"` 与 `issueKey`
  And 不为 #67 启动第二个并发 job
  And #67 的 job 完成折叠后，下一次心跳依据新状态重新推导是否需要再次处理

## 可验证行为修改
- `pnpm test` 覆盖清单中把「runner 通过可注入 driver pool 并发处理 due issue job、同阶段 issue job 去重、并发 job result 后确定性折叠 intake state」替换为「runner 心跳扫描派发不等待 job 执行、长跑 job 不阻塞其他 issue 全流程处理、in-flight issue 跨心跳防重派发、同心跳批内 issue job 去重、并发 job 完成即独立折叠互不覆盖、state persister 写合并与写失败重试、active 上限策略豁免在跑 issue、扫描结果纯变换应用不覆盖执行侧折叠」。
