# 任务：split-runner-coordination-modules

## A · 拆出验收 pre-pass
- [x] 新增 `src/runner/acceptance-prepass.ts`，迁移验收 pre-pass、child task acceptance fact、parent integration acceptance、closed child join blocked、integration repair child 协调逻辑
- [x] 为该模块定义窄依赖接口，避免从新模块 import `src/runner.ts`
- [x] 新增 `tests/acceptance-prepass.test.ts`，覆盖 child fact 入账、格式提醒封顶、closed child blocked 防重、repair child 创建 / 找回失败路径
- [x] 在 `tests/acceptance-prepass.test.ts` 注入 never-resolve ledger write / delayed dependency，断言既有 timeout 内 settle，不会永久 in-flight
- [x] 在 `tests/acceptance-prepass.test.ts` 注入 ledger write、blocked report、format reminder、repair child create / lookup 的快速失败，断言不保存虚假 fact / reference，且发布失败不被视为可见完成

## B · 拆出外部路由与 roundtable recovery
- [x] 新增 `src/runner/external-route.ts`，迁移 external no-mention fallback route、agent-authored route gate、roundtable no-handoff recovery
- [x] 新增 `tests/external-route.test.ts`，覆盖 append/no_action/fail_open、防重、ledger-task-closed、roundtable recovery
- [x] 在 `tests/external-route.test.ts` 注入 append comment 快速失败，断言不记录成功 route decision，runner 可重试同一 route key
- [x] 在 `tests/external-route.test.ts` 注入 route formatter / ledger gate 慢成功或 never-resolve，断言受既有 timeout 约束

## C · 拆出 Codex execution reaction
- [x] 新增 `src/runner/codex-execution-reaction.ts`，迁移 reaction target 解析与 best-effort 添加
- [x] 新增 `tests/codex-execution-reaction.test.ts`，覆盖 issue body target、comment target、缺 comment target、addReaction failure
- [x] 在 `tests/codex-execution-reaction.test.ts` 覆盖 addReaction delayed resolve / failure 不阻断 Codex driver 的主流程顺序

## D · 保持 runner 主流程与发布边界
- [x] 调整 `src/runner.ts` 只保留主流程调用与依赖装配，删除已迁移 helper
- [x] 保留或补充 `tests/runner.test.ts` 主流程顺序断言：acceptance pre-pass 在 trigger 前、external route 在 trigger skip 后、reaction 在 Codex driver 前
- [x] 保留或补充 `tests/runner.test.ts` S1 发布边界断言：首条可见评论发布前失败返回 failed，发布后失败不重复发帖
- [x] 保留或补充 `tests/runner.test.ts` L1 in-flight 断言：never-resolve 子依赖经 timeout / watchdog 后 job settle 并释放 in-flight
- [x] 确认 `src/runner.ts` 行数实质下降，且没有新增同等混杂巨文件

## E · 文档与规格
- [x] 更新 `docs/architecture/module-map.md` 的 `github-issue-runner` 小节，补充 `src/runner/*` 子模块职责与禁止依赖
- [x] 更新 `docs/architecture/module-map.md` 时明确 runner 子模块仍属于 GitHub issue runner 副作用边界，且必须遵守 L1/S1/V1
- [x] 实现完成归档时合并 `spec-delta/github-issue-runner.md` 到 `openspec/specs/github-issue-runner/spec.md`

## F · 验证
- [x] 跑 `pnpm test`，退出码 0
- [x] 跑 `pnpm typecheck`，退出码 0
