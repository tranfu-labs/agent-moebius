# 任务：local-console-t5-child-session-orchestration

## 1. SQLite 与 store
- [x] 1.1 给 `sessions` 增加 `parent_session_id` migration 与查询索引。
- [x] 1.2 扩展 `SqliteStateCommand` 与 worker，落地 `local-create-child-session`。
- [x] 1.3 扩展 `LocalConsoleSessionSummary` / normalizeResult，返回 `parentSessionId`。
- [x] 1.4 补单测：旧库兼容、child session 写入、hidden key 重试幂等、首条 message 事务回滚。
- [x] 1.5 补故障单测：store timeout / locked DB 不永久占用、project mismatch 不创建跨 project child、hidden key 多重命中 fail closed。

## 2. Runtime 编排
- [x] 2.1 增加 local child session descriptor 类型和受控 body renderer。
- [x] 2.2 将本地 CEO child descriptors 映射为 `createLocalChildSession()` 调用。
- [x] 2.3 在父 session 写可见 progress system message。
- [x] 2.4 补单测：多子任务目标、重复 orchestration key 恢复、失败不保存 success。
- [x] 2.5 补 L1/S1/V1 单测：child creation hang/timeout 后父会话 visible failed/stuck、session 释放、orchestration success 不保存。

## 3. 桌面台树形侧栏
- [x] 3.1 扩展 desktop renderer state mapping，透传 `parentSessionId`。
- [x] 3.2 在 `OperatorConsole` 内由 flat sessions 构造 tree。
- [x] 3.3 子会话行缩进展示 title/status，并保持 selection 行为。
- [x] 3.4 补 UI 测试：父子树、刷新稳定、missing parent fallback。
- [x] 3.5 补损坏数据 UI 测试：parent cycle、self-parent、损坏 parent 链时每个 session 至多渲染一次，无法归属 child 作为 root fallback。

## 4. 验收
- [x] 4.1 增加 `scripts/acceptance/local-console-t5.ts --case child-session-orchestration`。
- [x] 4.2 增加 `scripts/acceptance/local-console-t5.ts --case child-session-sidebar-tree`。
- [x] 4.3 在验收脚本 evidence 中记录 QA 建议故障用例：store timeout、project mismatch、hidden key collision、corrupt parent chain。
- [x] 4.4 更新 `docs/architecture/module-map.md` 的 local-console 边界：只开放 child session orchestration，仍禁止 CEO fallback、acceptance pre-pass、dead-letter parity、artifact publishing、T6 flag 等未纳入能力。
- [x] 4.5 归档时确认 `openspec/specs/local-console/spec.md` 不再同时保留要求 child session orchestration 的 MUST 与禁止同一能力的 MUST NOT。
- [x] 4.6 运行 `pnpm exec openspec validate local-console-t5-child-session-orchestration --strict`。
- [x] 4.7 记录测试、typecheck 与验收脚本证据，为后续 code-verified 回复准备「验收证据」。
