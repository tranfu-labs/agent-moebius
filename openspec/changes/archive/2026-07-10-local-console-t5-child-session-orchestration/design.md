# 设计：local-console-t5-child-session-orchestration

## 基线
#110 已合入 `main`，提供两类基线：

- OpenSpec 总方案：`openspec/changes/local-console-t5-full-parity/` 已把 T5 本地全功能等价拆成能力面，并明确 child session orchestration 是其中一个能力面。
- Store wrapper：`src/local-console/t5-store.ts` 已定义 `createLocalChildSession()`，调用 `runSqliteStateCommand()` 的 `local-create-child-session` command。

本 change 只把这个 wrapper 背后的 SQLite command、runtime executor 与 UI tree 接起来。

## 事实源边界
当前归档事实源仍在两个位置禁止 `local-console` 实现 T5-only child session orchestration：

- `openspec/specs/local-console/spec.md` 的“边界”规则。
- `docs/architecture/module-map.md` 的 `local-console` 禁止依赖。

本 change 必须显式解除这一项禁止，否则归档后会同时存在新增 child session orchestration MUST 与既有 MUST NOT。解除边界只限本 change：

- 允许：local child session orchestration、`sessions.parent_session_id`、sidebar tree。
- 仍禁止：CEO no-mention fallback、full acceptance pre-pass、dead-letter parity、artifact publishing、T6 GitHub/local mode flag、修改 GitHub issue runner 语义。

实现完成前必须更新 `docs/architecture/module-map.md`，让 module-map 和归档后的 `openspec/specs/local-console/spec.md` 对齐。

## 数据模型

### sessions.parent_session_id
SQLite `sessions` 增加 nullable `parent_session_id`：

- root session：`parent_session_id IS NULL`。
- child session：`parent_session_id = <parent session id>`。
- 所有 child session 仍属于同一个 `project_id`，避免跨 project 树。
- `listProjects()` / `listSessions()` 返回 `parentSessionId`，但不改变 `sessionId` 主键。
- child creation command 必须以父 session 的持久化 `project_id` 为准；如果实现不选择自动校正，则必须 fail closed，禁止 caller 传入的错误 `projectId` 生成跨 project child。

迁移需要兼容旧库：

- `ALTER TABLE sessions ADD COLUMN parent_session_id TEXT NULL` 在列不存在时执行。
- 可加索引 `idx_sessions_parent_session_id`，用于 sidebar tree 与 child lookup。

### orchestration key
`local-create-child-session` command 需要稳定幂等：

- 输入包含 `parentSessionId`、`childSessionId`、`projectId`、`title`、`relation`、`hiddenKey`、`initialBody`、`initialRole`、`now`。
- command 在一个事务中先查 hidden orchestration key；唯一命中时返回既有 child session summary。
- hidden orchestration key 查询如果命中多条 child session，command 必须 fail closed，并返回可记录的确定性错误；不得任选其中一条恢复。
- 未命中时插入 child session，并插入首条 child session message。首条 body 包含 hidden key，speaker 为 `user` 或本地受控 system-to-user handoff；role 为空，后续 trigger 从 body 中的 initial handoff mention 解析。
- 如果 session 插入成功但 message 插入失败，事务回滚，避免孤儿 child session。

### bounded store behavior
`local-create-child-session` 走现有 `runSqliteStateCommand()` worker 与 `storeCall()` timeout 口径：

- SQLite locked、worker 永久挂起或慢成功不得让 local session drain 永久占用。
- timeout 后 runtime 必须把父会话本轮记录为 visible failed/stuck，释放 session，并且不得保存 orchestration success。
- 如果 visible failure/stuck 写入本身失败，沿用现有 local runtime 失败记录路径，不把该 orchestration 伪装成成功。

## Runtime executor
本地 runtime 增加一个窄 executor，不引入完整 GitHub orchestration adapter：

1. 接收已经由本地 CEO 结构化输出解析出的 child descriptors。
2. 校验 workflow id、ledger task id、initial role、acceptance statements、quality baseline 与 provenance。
3. 生成 deterministic child session id，例如 `local-child:<parent-session-id>:<task-id>` 的安全 slug 或哈希形式。
4. 调用 `createLocalChildSession()`。
5. 父 session 写一条可见 system progress message，列出创建或恢复的 child session id。

错误边界：

- child creation 失败时不推进本地 orchestration success 状态。
- child creation timeout、worker hang 或 locked DB 视为失败，必须释放本地 session。
- 重试恢复到既有 child session 时不得重复插入首条 message。
- project mismatch 与 hidden key 多重命中必须在 executor 层转成可见错误，而不是吞掉或任选恢复目标。
- 已创建的 child session 不做删除补偿，保持与 GitHub child issue 编排一致。

## Sidebar tree
API 仍返回 project summary + flat sessions，UI 层按 `parentSessionId` 构造树：

- root sessions 按现有排序显示。
- child sessions 挂到 parent session 下；每个 child 行更紧凑，缩进一级。
- parent 缺失时 child 作为 root fallback 显示，并保留状态，不静默丢失。
- parent cycle、self-parent 或损坏 parent 链用 visited set / bounded traversal 处理；每个 session 至多渲染一次，无法安全归属的 row 作为 root fallback 可见。
- refresh 后只依赖 `parentSessionId` 关系恢复树，不依赖内存状态。
- active selection 仍用 `selectedSessionId`，点击 child 先选 project 再选 child session。

字符图：

```text
Projects
└─ agent-moebius
   ├─ T5 parent goal                         running
   │  ├─ task-t5-child-session-orchestration waiting
   │  └─ task-t5-local-routing-bus           completed
   └─ Scratch session                        idle
```

## 测试策略

- Store 单测：migration 后旧 session `parentSessionId === null`；child session create 写入 `sessions.parent_session_id`；同 hidden key 重试返回同一 child session 且不重复 message；project mismatch 不创建跨 project child；hidden key 多重命中 fail closed。
- Runtime 单测：fake CEO descriptors 创建多个 child sessions；失败路径不保存 success；重试恢复既有 child session；worker hang/timeout 释放 session 并记录 visible failed/stuck。
- UI 单测：flat sessions 输入渲染为 parent -> child；刷新等价输入保持层级；missing parent fallback 可见；cycle/self-parent/损坏链有限渲染且不丢 session。
- 验收脚本：在 `scripts/acceptance/local-console-t5.ts` 增加 `child-session-orchestration` 与 `child-session-sidebar-tree` cases，输出 JSON evidence。

## 风险与取舍

- #110 的 T5 总方案仍包含更大能力面。本 change 明确不实现 dead-letter、验收 pre-pass、repair child 与 worktree diff，避免与相邻 runtime PR 并行冲突。
- 当前事实源的禁止边界不能靠 #110 未归档 change 隐式解除；本 change 自己修改 child session orchestration 这一项，保证 PR diff 自洽。
- UI tree 在当前方案中由 flat sessions 构造，而不是要求 API 返回嵌套结构；这样对 server/desktop renderer 侵入最小，也方便测试刷新稳定性。
- `parent_session_id` 只表达树关系，不承载 ledger task 状态。task 状态仍应由后续 local ledger projection 能力负责。
