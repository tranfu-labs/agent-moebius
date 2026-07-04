# 提案：goal-ledger-phase-scope-isolation-t2

## 背景
里程碑 3 T2 要解决长期任务进入新阶段后，agent 仍被上一阶段产物或旧质量基准污染的问题。T1 已把 `PhaseRecord` 和 `qualityBaseline` 纳入目标账本，但 T1 规格明确不执行 phase switching、phase artifact archival 或 context filtering。因此当前账本能记录阶段，却还不能表达阶段边界，也不能给未来执行上下文提供“只看当前阶段”的数据视图。

product-manager 已确认 T2 按范围最小处理：只做 `goal-ledger` 业务层、必要 schema、上下文投影、测试与 spec/docs；不接 runner、observer、worktree、CEO 编排，不实现 T3/T5/T7。

## 提案
在 `goal-ledger` 域内新增阶段作用域隔离能力：

1. 最小扩展 `PhaseRecord` 的阶段工作字段，支持当前阶段目标、验收语句、依赖，以及通用 artifact reference 与归档摘要。
2. 新增纯函数 phase switch：同一 owner 下最多一个 active phase；切换时旧 active phase 标记 completed、写 `completedAt`，并把上一阶段产物以摘要和 typed references 留在账本中；新 phase 标记 active、写 `startedAt`。
3. 新增纯函数 context projection：只返回当前 active phase 的目标、阶段质量基准、验收语句、依赖和必要 owner 标识；上一阶段 artifact 主体不得混入 current context。
4. 新增 archived phase lookup：上一阶段归档摘要与 references 可单独回查，但与 current context 主体分离。
5. 对异常账本 fail closed：多个 active phase 必须报错；projection 遇到无 active 不 fallback 到 owner 全局上下文，而是返回 no-active/missing-active 结果；phase switch 遇到多个 active 也报错。
6. 保持账本 phase 与执行评论 stage marker 分层：不修改 `src/stages.ts`，不复用 `plan-written` / `code-verified` / `in-progress` 作为账本 phase 状态或名称。

## 影响
- `src/goal-ledger.ts`：新增阶段 artifact reference 类型、阶段目标/验收/依赖/归档字段校验、phase switch、context projection、archived lookup 和 active phase 不变量。
- `tests/goal-ledger.test.ts`：新增阶段切换、归档引用、投影过滤、质量基准优先级和异常 fail-closed 测试。
- `openspec/specs/goal-ledger/spec.md`：实现归档后补充 T2 行为事实。
- `docs/architecture/module-map.md`、`AGENTS.md`：若公共职责或状态字段描述受影响，随实现同步更新。
- `docs/roadmap/milestone-3-orchestration.md`：实现验证通过后，在 T2 下追记验收证据并勾选任务。

## 非目标
- 不接入 runner 心跳、mention trigger、Codex prompt 构造或 CEO guardrail。
- 不改 `src/stages.ts`，不改变执行角色评论的 stage marker 语义。
- 不移动 worktree 文件，不发布 release artifact，不复制完整 run manifest record。
- 不新增固定 phase 名称、自动流转、状态机编排语义或 owner 概念。
- 不改 observer UI，不创建或同步 GitHub issue。
