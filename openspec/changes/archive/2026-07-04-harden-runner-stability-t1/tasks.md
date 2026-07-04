# 任务：harden-runner-stability-t1

## 实现

- [x] `src/github.ts`：为 gh spawn 增加单次调用 timeout / abort 终止，保持读与 reaction 有限 retry、写评论与 release upload 不自动重试。
- [x] `src/retry.ts`：核对 timeout / abort 错误分类与有限 retry 行为，必要时补充 timeout 相关分类签名。
- [x] `src/codex.ts`：核对 abort 后子进程终止与 promise settle 行为，必要时补充强杀宽限测试支撑。
- [x] `src/driver-pool.ts`：保持 pool 只在 job settle 后释放名额的职责边界；若需改动，仅限增强现有释放测试，不引入 GitHub / Codex domain 依赖。
- [x] `src/github-response-intake.ts`：核对持续失败、恢复、dead-lettered 的折叠是否满足 spec-delta；若现有行为已满足则不改实现。
- [x] `src/issue-media.ts`：核对 SVG issue 输入过滤覆盖所有语法；若现有实现已满足则只补测试。

## 测试

- [x] `tests/github.test.ts` / `tests/retry.test.ts`：fake gh 挂起或持续网络失败时，单次调用有 timeout，retry 有限，最终上抛而不是无限等待。
- [x] `tests/runner.test.ts` / `tests/github-response-intake.test.ts`：fake GitHub adapter 持续报错时，限期内进入失败记账并最终死信或恢复，心跳不等待 job 完成。
- [x] `tests/runner.test.ts` / `tests/codex.test.ts` / `tests/driver-pool.test.ts`：fake Codex 子进程卡死时，watchdog abort 后按 failed 路径记录，job settle 后 driver pool 名额释放。
- [x] `tests/issue-media.test.ts`：SVG URL 在 Markdown image、Markdown link、HTML、bare URL 中均被过滤；非 SVG 媒体仍被提取。
- [x] 若 Codex 卡死故障注入证明授权范围内无法满足“fake driver promise 永不 settle 也释放名额”，停止实现并在 issue 中报告需扩 scope 到 `src/runner.ts` 的具体原因。
  - 结论：已先报告需 runner 编排层 timeout race；loop watcher 授权最小触碰 runner.ts 后，已实现并补测试覆盖逐字路径。

## 验证

- [x] 跑注入 gh 网络故障的测试，确认限期内进入死信或恢复，心跳不中断，无无限重试。
- [x] 跑注入 Codex 卡死的测试，确认 watchdog 超时强杀、按失败路径记录、driver pool 名额释放。
  - `tests/runner.test.ts` 覆盖 fake driver promise 永不返回时 watchdog 触发、failed outcome 折叠、queued driver pool job 启动；`tests/codex.test.ts` 覆盖真实 adapter 忽略温和信号后升级 `SIGKILL` 并 settle。
- [x] 跑 `rg -n "svg" tests/` 与 `git log --oneline -- src/issue-media.ts`，确认 SVG 过滤有测试覆盖且 hotfix commit 可见，本 change 已归档。
- [x] 跑 `pnpm test` 与 `pnpm typecheck`，确认退出码 0。

## 收尾

- [x] 合并 spec-delta 到 `openspec/specs/github-issue-runner/spec.md` 并归档本 change。
- [x] 把每条验收语句的证据追记到 `docs/roadmap/milestone-2-stability-oracle.md` T1 下方，并勾选 T1。
- [x] 提交本次变更；若存在 remote，提交后等待用户决定是否 push。
