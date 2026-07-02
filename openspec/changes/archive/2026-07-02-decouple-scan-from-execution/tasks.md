# 任务：decouple-scan-from-execution

- [x] `src/state-persister.ts`：单写者内存状态 + 串行化可合并原子落盘 + 写失败日志
- [x] `tests/state-persister.test.ts`：同步变换即时可见、连续变更写合并（N 次 update ≤ 2 次写）、写失败不抛出且后续变更重试落盘、flush 等待全部写完成
- [x] `src/issue-dispatcher.ts`：迁入 job 类型与折叠函数；in-flight 集合；dispatch 经驱动池执行、完成即折叠、异常路径移除并记 `issue-job-error`；折叠后执行排除在跑的 active 上限策略
- [x] `tests/issue-dispatcher.test.ts`：在跑同 issue 二次 dispatch 记 `skip-inflight` 且不重复执行；两个 job 先后完成折叠互不覆盖；job 抛异常后从 in-flight 移除、可再次派发；active 超上限时在跑 issue 不被降级
- [x] `src/github-response-intake.ts`：`enforceActiveIssueLimit` 增加 `excludedIssueKeys` 参数（默认空集，既有行为不变）
- [x] `src/scanner.ts`：`runIntakeScan`——due 仓库判定、先异步取列表再纯变换应用、单仓失败继续
- [x] `tests/scanner.test.ts`：changed issues 正确产出；扫描期间穿插的外部 `applyState` 变更不被扫描结果覆盖；单仓失败不影响其余仓库
- [x] `src/runner.ts`：删除 `tick` 一族与全局 `running`；新增 `heartbeat`（防重入仅覆盖扫描派发）、`createRunner` 组装、`start` 改用心跳；`pollActiveIssue` 复用 dispatcher 折叠函数
- [x] `tests/runner.test.ts`：改写 tick 编排用例为心跳用例；新增「A 长跑挂起时下一心跳仍派发 B 并完成折叠落盘」「A 在跑期间心跳不重复派发 A」「批内同 issueKey 去重保留」
- [x] `pnpm test` 全绿、`pnpm typecheck` 通过
- [x] 用真实日志场景自查：模拟 #67 长跑 + #68 新评论，确认无连排 `skip-overlap`、#68 正常处理
