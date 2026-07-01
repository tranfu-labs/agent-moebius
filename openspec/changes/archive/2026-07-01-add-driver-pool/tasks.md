# 任务：add-driver-pool

## 实现
- [x] 新增 `src/driver-pool.ts`：默认无额外并发限制，显式 `maxConcurrent` 时 FIFO 限流
- [x] 修改 `src/runner.ts`：tick 支持注入 driver pool；changed / active issue jobs 通过 pool 执行；job results 按稳定顺序 fold 回 intake state
- [x] 修改 `src/runner.ts`：同一 processing phase 内按 issueKey 去重；保留 tick overlap 防护
- [x] 修改 `src/runner.ts`：`makeRunDir()` 增加 runner 进程内递增后缀，避免并发 runDir 冲突
- [x] 修改 `src/state.ts`：新增 role thread entry 级 merge 保存 helper
- [x] 修改 `src/agent-context-state.ts` 与 `src/agent-prescripts/dev-workspace.ts`：新增并使用 agent context entry 级 merge 保存 helper

## 测试
- [x] `tests/driver-pool.test.ts`：覆盖默认不限制、显式限流、reject 后释放 capacity、非法 maxConcurrent
- [x] `tests/runner.test.ts`：覆盖 tick 注入 pool 后 changed issue jobs 可并发启动、同阶段 duplicate issue job 去重、runDir 唯一
- [x] `tests/state.test.ts`：覆盖并发 role thread entry saves 不互相覆盖
- [x] `tests/agent-context-state.test.ts`：覆盖并发 agent context entry saves 不互相覆盖
- [x] `tests/dev-workspace.test.ts`：同步 pre-script dependency 接口改名

## 验证
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `git diff --check`
