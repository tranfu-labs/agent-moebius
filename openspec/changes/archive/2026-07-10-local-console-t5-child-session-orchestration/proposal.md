# 提案：local-console-t5-child-session-orchestration

## Why
Issue #113 是 T5 runtime/SQLite 冲突组中的“CEO 开子会话编排”子任务。#110 已把 T5 基础方案、MUST 矩阵与本地 T5 store 基线合入 `main`，其中 `src/local-console/t5-store.ts` 已提供 `createLocalChildSession()` 等本地 T5 command wrapper。本 change 不重开 T5 全量范围，而是在 #110 基线上把 CEO child issue orchestration 的本地映射落成可实现的窄方案：

- GitHub child issue → local child session。
- child issue parent reference → `sessions.parent_session_id`。
- GitHub issue list navigation → desktop sidebar session tree。

## What Changes
本 change 规划三个功能点：

1. **本地 child session 持久化路径**：扩展 SQLite `sessions` schema、worker command 与 local store summary，使 `createLocalChildSession()` 在事务中创建 child session、写入 `sessions.parent_session_id`、保留 project 归属、隐藏 orchestration key 与首条 initial handoff message；同时覆盖 store timeout、project mismatch、hidden key 多重命中的 fail-closed 分支。
2. **CEO 编排到本地子会话 executor**：在 local runtime 增加窄 executor，将本地 CEO `spawn_child_issues` / `goal_intake.confirm` 的 child descriptors 映射为 `createLocalChildSession()`；按 parent session id + workflow id + ledger task id 去重，重试时先恢复既有 child session，不重复创建。
3. **桌面台父子层级展示**：扩展 state API 与 `@moebius/console-ui` controlled props，让 sidebar 按 `project -> parent session -> child session` 稳定渲染；刷新后从 SQLite 关系恢复树形层级；损坏 parent 链或 cycle 时有限渲染且不丢 session。
4. **事实源边界解除**：显式修改 `local-console` 规格中对 T5-only child session orchestration 的禁止项，并把 `docs/architecture/module-map.md` 的 local-console 边界更新列入实现收尾；只开放本 change 的 child session orchestration，仍禁止 CEO fallback、acceptance pre-pass、dead-letter parity、artifact publishing、T6 flag 等未纳入能力。

## Out of Scope
- 不实现 T5 dead-letter、acceptance pre-pass、repair child、worktree diff return、local role-thread resume 或 full CEO guardrail。
- 不改变 GitHub runner 的 child issue 编排、issue intake、reaction、artifact 或 worktree 行为。
- 不做 T6 GitHub/local 互斥启动 flag。
- 不在本 change 里归档 #110 的 `local-console-t5-full-parity` 总方案。

## Impact
受影响模块：

- `src/sqlite-state.ts` / `src/sqlite-state-worker.ts`：补齐 `local-create-child-session` command 与 `sessions.parent_session_id` migration、查询、幂等恢复。
- `src/local-console/store.ts` / `src/local-console/types.ts` / `src/local-console/t5-store.ts`：让 session summary 暴露 `parentSessionId`，并保证 child creation 走同一 SQLite。
- `src/local-console/runtime.ts`：增加本地 CEO child descriptors 到 child session 的窄 executor，不触碰 GitHub adapter。
- `src/local-console/server.ts` / desktop renderer state mapping：把 parent session id 透传给 UI。
- `packages/console-ui/src/console/operator-console.tsx`：将平铺 session list 渲染为稳定树形。
- `openspec/specs/local-console/spec.md` 与 `docs/architecture/module-map.md`：归档 / 实现收尾时解除 child session orchestration 禁止边界，避免事实源自相矛盾。
- `tests/local-console.test.ts`、`packages/console-ui/src/console/operator-console.test.tsx`、`scripts/acceptance/local-console-t5.ts`：覆盖 child session persistence 与 sidebar tree。

## QA Review Repairs
QA 审查指出的四类缺口已并入方案设计和测试任务：

- `local-create-child-session` 慢成功、locked DB 或 worker hang 必须在既有 store timeout 内 settle；runtime 记录 visible failed/stuck，不保存 orchestration success，并释放 session。
- child creation 输入 `projectId` 与父 session 持久化 project 不一致时，命令不得创建跨 project child；实现可选择强制使用父 session project 或 fail closed，但必须可测试、可见。
- hidden orchestration key 多重命中时必须 fail closed 并留下可见错误，不得任选一个 child 当作恢复成功。
- sidebar 遇到 parent cycle 或损坏 parent 链时，每个 session 至多渲染一次，无法安全归属的 child 作为 root fallback 可见，不得挂起或丢失。
- `local-console` 当前事实源和 module-map 的 T5-only 禁止边界必须被本 change 显式修改：归档后不得同时存在“必须实现 child session orchestration”与“禁止实现 child session orchestration”。

## Acceptance Statements
原 issue 已给出两条验收语句，本方案默认沿用其验收目标，并将表达细化为可机械执行的检查：

1. 跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case child-session-orchestration` → 应输出本地 CEO 编排多子任务目标后创建 child sessions，且 SQLite `sessions.parent_session_id` 均等于父会话 id。
2. 跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case child-session-sidebar-tree` → 应输出桌面台侧栏在刷新前后都按 `parent_session_id` 渲染父会话下的树形子会话层级。

细化理由：issue 原文是用户验收目标；这里只补充命令入口与观察口径，未改变验收范围。

QA 增补建议尚未由需求持有者或真人用户明确接受为正式验收语句，因此不并入上方正式验收清单；本方案仍把这些建议落为设计约束、spec 场景与测试任务，用于方案质量审查和后续实现自测。
