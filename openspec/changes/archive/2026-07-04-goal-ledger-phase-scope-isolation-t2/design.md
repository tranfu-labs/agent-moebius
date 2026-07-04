# 设计：goal-ledger-phase-scope-isolation-t2

## 方案

### 1. Phase schema 最小扩展
T1 的 `PhaseRecord` 已有 `owner`、`name`、`status`、`qualityBaseline`、`startedAt`、`completedAt` 与 `provenance`。T2 在同一记录上做向后兼容的最小扩展：

- `objective?: string`：当前阶段目标。context projection 需要它；缺失时 projection fail closed，不回退到 owner scope。
- `acceptanceStatements?: string[]`：当前阶段验收语句。projection 需要它；缺失或空时 projection fail closed。
- `dependencies?: string[]`：当前阶段依赖。允许空数组表示已确认无依赖；缺失时 projection fail closed。
- `artifactRefs?: PhaseArtifactReference[]`：阶段产物引用。每条引用包含 `kind`、`summary` 和受控 locator；不复制完整 run manifest 或外部评论内容。完成旧 active phase 时必须显式提供数组，空数组表示已确认无产物。
- `archiveSummary?: string`、`archivedAt?: string`：阶段完成时留下的归档摘要与归档时间。

新增 `PhaseArtifactReference` 使用 discriminated union：

- `run-manifest`：引用既有 `RunManifestLocator`，只保存 stable locator 与简短摘要。
- `acceptance-evidence`：保存 worktree 相对路径或等价可回查 locator 与摘要，不读取或发布文件。
- `issue-comment`：保存 issue owner/repo/number/commentId 或 URL 级 locator 与摘要，不复制评论全文。
- `path`：保存仓库相对路径与摘要，用于文档、方案或证据文件。
- `other`：保存非空 locator 字符串与摘要，作为未来兼容出口。

兼容策略：保持 `schemaVersion = 1`，新增字段在 parser 层为 optional。旧本地账本不会因缺少新字段而加载失败；只有执行 T2 的 switch/projection helper 时，才对当前 phase 必需字段 fail closed。

### 2. Active phase 不变量与切换函数
新增纯函数 `switchActivePhase(state, input)`，只操作内存中的 `GoalLedgerState`，不访问文件系统、GitHub、Codex 或 shell。

输入包含 owner、targetPhaseId、now、provenance，以及完成旧 active phase 时必需的 `archiveSummary` / `artifactRefs`。规则：

- target phase 必须存在，且 owner 必须与输入 owner 一致。
- target phase 在启动或作为当前 active no-op 返回前，必须具备可投影的当前阶段字段：`objective`、非空 `acceptanceStatements`、`dependencies` 数组和 `qualityBaseline`。
- 同一 owner 下如果已有多个 active phase，直接抛出确定性错误。
- 如果无 active phase，则允许首次启动 target phase，但必须显式给 targetPhaseId；不得隐式选择第一个 pending phase。
- 如果已有一个 active phase 且就是 target phase，则返回原 state 作为 deterministic no-op，保留原 `startedAt`，不重复归档、不写 `completedAt`。
- 如果已有一个 active phase 且不是 target phase，则调用方必须提供非空 `archiveSummary` 和 `artifactRefs` 数组；`artifactRefs: []` 是显式“无产物”归档，缺少 `archiveSummary` 或缺少 `artifactRefs` 数组时抛出确定性错误且返回前 state 不变。
- 正常切换时，旧 active 写 `completedAt = now`、`status = completed`、`archiveSummary`、`archivedAt = now`、`artifactRefs`；target phase 写 `startedAt = now`、`status = active`。
- phase name 保持自由文本；不引入固定流程名或自动流转语义。

`assertGoalLedgerState` 同步增加同 owner 最多一个 active phase 的 fail-closed 校验，防止异常账本继续被消费。

### 3. Context projection
新增纯函数 `projectActivePhaseContext(state, owner)`，返回 discriminated union：

- `{ status: "active", current: ... }`：只包含 active phase 的 `phaseId`、`phaseName`、owner、`objective`、`qualityBaseline`、`acceptanceStatements`、`dependencies`。
- `{ status: "no-active", owner }`：owner 下没有 active phase。调用方必须显式处理，不允许 fallback 到 goal/milestone/task 全局上下文。

投影规则：

- 若同 owner 多个 active phase，抛出确定性错误。
- 若 active phase 缺 `objective`、`acceptanceStatements`、`dependencies` 或 `qualityBaseline`，抛出确定性错误。
- `qualityBaseline` 只取 `PhaseRecord.qualityBaseline`，不与 owner 记录上的 baseline 静默合并。
- current context 不包含任何 completed phase 的 `artifactRefs`、`archiveSummary` 或 owner 全局 artifacts。

### 4. Archived lookup
新增纯函数 `listArchivedPhaseReferences(state, owner)`，返回该 owner 下 completed phases 的归档摘要和 typed references。该函数是显式回查入口，不参与 `projectActivePhaseContext` 的 current 主体。

这样上一阶段产物仍可追溯，但未来执行上下文默认不会把旧产物混入当前阶段。

### 5. 测试设计
本次包含可测业务逻辑，必须新增单元测试：

- 切换：同一 task owner 从 active phase 切到 target phase，旧 phase completed 并带 `completedAt` / `archivedAt` / artifact references，新 phase active 并带 `startedAt`。
- 归档缺输入：完成旧 active phase 时缺 `archiveSummary` 或缺 `artifactRefs` 数组会 fail closed；`artifactRefs: []` 表示显式无产物归档。
- 重试幂等：target phase 已是唯一 active phase 时，切换函数返回 deterministic no-op，保留既有 `startedAt`。
- 归档：run manifest、验收证据路径、issue comment 等 typed references 只作为摘要和 locator 保存，不复制完整运行记录。
- 投影：active projection 只返回当前 phase 目标、阶段质量基准、验收语句、依赖和 owner 标识，不包含旧 phase artifact 主体。
- 质量基准：owner baseline 与 phase baseline 不同时，projection 使用 phase baseline。
- 异常：多个 active phase 在 assert/projection/switch 中 fail closed；无 active phase projection 返回 no-active，不 fallback 到全局上下文。
- 通用 owner：逻辑沿用 T1 的 goal/milestone/task owner shape；测试至少覆盖 task owner，并补一个非 task owner 的轻量断言防止 task-only 假设。

验证命令：`pnpm test -- goal-ledger --reporter=verbose`、`pnpm test`、`pnpm typecheck`。

## 权衡
- 选择扩展 `goal-ledger` 纯业务模块，而不是接 runner prompt：T2 的目标是让账本具备阶段边界能力，未来 T3/T5/T7 才决定如何消费它。
- 选择 optional schema fields 而不是 bump schemaVersion：`.state/goal-ledger.json` 是本地 ignored 状态，T2 只需向后兼容旧 phase 记录；projection helper 对缺字段 fail closed 已能避免隐式污染。
- 选择 typed references 而不是专用 run manifest 字段：product-manager 明确要求归档产物不是只存 run manifest；typed reference 能覆盖 run manifest、验收证据路径和 issue comment，同时避免复制完整外部记录。
- 选择 no-active 结果而不是异常：无 active phase 是首次启动前的合法状态；多个 active 或 active 字段缺失才是异常账本。

## 风险
- optional fields 可能让调用方误以为旧 phase 可直接投影。控制方式：projection 对当前 phase 必需字段做严格 fail closed，并用单测覆盖。
- artifact locator 过早设计过宽。控制方式：kind 使用受控枚举，每种 locator 只保存最小可回查字段和 summary，不执行 IO。
- `assertGoalLedgerState` 增加 active 唯一性后，手工构造的坏状态会加载失败。控制方式：这是 T2 明确要求的 fail closed；测试覆盖错误信息和锁定行为。

## 验收语句
- 跑 `pnpm test -- goal-ledger --reporter=verbose` → 应看到阶段切换测试证明旧 active phase 变为 completed 且写入 `completedAt` / 归档摘要 / typed artifact references，新 target phase 变为 active 且写入 `startedAt`。
- 跑 `pnpm test -- goal-ledger --reporter=verbose` → 应看到旧 active phase 切到新 target 时缺少 `archiveSummary` 或缺少 `artifactRefs` 数组会确定性失败且 state 不变，并看到 `artifactRefs: []` 被记录为显式无产物归档。
- 跑 `pnpm test -- goal-ledger --reporter=verbose` → 应看到 target phase 已是唯一 active phase 时再次切换为 deterministic no-op，保留原 `startedAt` 且不重复归档。
- 跑 `pnpm test -- goal-ledger --reporter=verbose` → 应看到 context projection 测试证明 current context 只包含当前 active phase 的目标、阶段质量基准、验收语句、依赖和 owner 标识，不包含上一阶段 artifact 主体。
- 跑 `pnpm test -- goal-ledger --reporter=verbose` → 应看到 archived lookup 测试证明 completed phase 的归档摘要与 typed artifact references 可单独回查，且不进入 current context 主体。
- 跑 `pnpm test -- goal-ledger --reporter=verbose` → 应看到质量基准测试证明 owner baseline 与 phase baseline 不同时，projection 使用 `PhaseRecord.qualityBaseline`。
- 跑 `pnpm test -- goal-ledger --reporter=verbose` → 应看到异常账本测试证明多个 active phase 会 fail closed，无 active phase projection 返回 no-active 且不 fallback 到全局上下文。
- 跑 `pnpm test -- goal-ledger --reporter=verbose` → 应看到旧 T1 phase record 缺少 `objective` / `acceptanceStatements` / `dependencies` / archive 字段时仍可 parse，且 active projection 对缺当前阶段必需字段给出确定性错误。
- 跑 `pnpm test -- goal-ledger --reporter=verbose` → 应看到不同 owner 各有一个 active phase 可通过校验，同一 owner 两个 active phase 才 fail closed。
- 跑 `pnpm test -- goal-ledger --reporter=verbose` → 应看到 typed artifact reference 只接受 summary + locator，拒绝空 locator、越界路径或把完整 run manifest / comment body 塞进 generic fallback 的输入。
- 跑 `rg -n "node:fs|from 'fs'|child_process|src/github|src/codex|shell" src/goal-ledger.ts` → 应无匹配，证明 `goal-ledger` 纯业务边界未被破坏。
- 打开 `openspec/specs/goal-ledger/spec.md` → 应看到 T2 归档后的行为事实包含 phase switch、artifact archival、context projection、phase baseline 优先级、账本 phase 与执行 stage marker 分层。
- 打开 `docs/roadmap/milestone-3-orchestration.md` → 应看到 T2 在实现验收通过后被勾选，并在任务下方记录方案、实现、测试与 typecheck 证据。
