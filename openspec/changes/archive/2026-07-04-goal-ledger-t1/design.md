# 设计：goal-ledger-t1

## 方案

### 1. 账本状态模型
新增 `src/goal-ledger.ts`，保持纯业务模块，不访问文件系统、GitHub、Codex 或 shell。

账本顶层：

```ts
interface GoalLedgerState {
  schemaVersion: 1;
  goals: Record<string, GoalRecord>;
  milestones: Record<string, MilestoneRecord>;
  tasks: Record<string, TaskRecord>;
  phases: Record<string, PhaseRecord>;
}
```

核心字段按“能表达关系和质量事实，不实现编排动作”裁剪：

- `GoalRecord`：`id`、`title`、`status`、`summary`、`scope`、`acceptanceStatements`、`dependencies`、`qualityBaseline`、`issueRefs`、`milestoneIds`、`provenance`、`missingFields`、`nextQuestions`、`createdAt`、`updatedAt`。
- `MilestoneRecord`：`id`、`goalId`、`title`、`qualityBaseline`、`taskIds`、`phaseIds`、`issueRefs`、`provenance`、`createdAt`、`updatedAt`。
- `TaskRecord`：`id`、`goalId`、可选 `milestoneId`、`title`、`status`、`scope`、`acceptanceStatements`、`dependencies`、`qualityBaseline`、`phaseIds`、`parentIssueRef`、`childIssueRefs`、`runManifestRefs`、`provenance`、`createdAt`、`updatedAt`。
- `PhaseRecord`：`id`、`owner`（goal / milestone / task）、`name`、`status`、`qualityBaseline`、`startedAt`、`completedAt`、`provenance`。

枚举保持本地、可校验：

- 质量基准：`demo`、`data-correct`、`production`，分别对应路线图的 `demo 级`、`数据正确级`、`成品级`。
- 入账状态：`draft`、`pending`、`ready`。`draft` 表示只部分接收；`pending` 表示已进入澄清但缺字段；`ready` 表示必要字段齐备，可以被后续 T3 编排者消费。
- issue relation 意图：`source`、`parent`、`child`、`acceptance`、`implementation`。

字段不变量：

- 所有 id 非空，并只在本账本内引用已存在实体。
- `TaskRecord.milestoneId` 存在时必须指向同一 `goalId` 下的 milestone。
- `parentIssueRef` / `childIssueRefs` 只保存 owner、repo、number、relation、status，不执行 GitHub 同步。
- `ready` 目标或任务必须具备非空 scope、acceptanceStatements、dependencies 字段、qualityBaseline 和至少一条 provenance。
- `missingFields` 只允许列出受控字段名，不能自由拼写。

### 2. 目标采访入账流程
新增纯函数 `upsertGoalIntakeDraft(state, input)` 与 `markGoalReady(state, goalId, now)`。

`upsertGoalIntakeDraft` 接收已知字段、provenance 与本轮澄清问题，返回新 state 与 computed missing fields：

- 首次只收到部分目标时创建 `draft` goal，保留已知字段与 provenance。
- 后续回答会 merge 到同一 goal，补齐字段并保留新 provenance；不覆盖未被本轮明确更新的已有事实。
- 缺验收语句、范围、依赖或质量基准时，状态保持 `draft` 或 `pending`，并写入 `missingFields` 与 `nextQuestions`。
- 所有必要字段齐备时可转 `ready`；实现上由 `markGoalReady` 做最终 gate，避免调用方绕过缺字段判断。

这解决“部分接收”问题：系统可以先把已确认事实落账，再用缺字段清单驱动下一轮采访，而不是把半截目标散落在 prompt 或文件系统里。

### 3. run manifest 引用关系
采用 product-manager 确认的“引用 run manifest”方案。

`RunManifestRef` 不复制完整 manifest record，只保存可回查 locator 与摘要：

```ts
type RunManifestLocator =
  | { kind: "jsonl-line"; path: ".state/run-manifests.jsonl"; line: number }
  | { kind: "run-dir"; runDir: string };

interface RunManifestRef {
  locator: RunManifestLocator;
  issue: { owner: string; repo: string; number: number };
  role: string;
  completedAt: string;
  stage: "plan-written" | "code-verified" | "in-progress" | "unknown";
  resolution: "linked" | "missing" | "unresolved";
}
```

碰撞处理：

- 单独 `{ issue, role, completedAt }` 不作为合法 locator，因为同一 role 可以在极近时间内多次 run，且时间字符串不能承担唯一性。
- 必须带 `jsonl-line` 或 `run-dir` locator；若调用方只有 issue / role / completedAt，则引用状态必须保存为 `unresolved`，不得伪装成已链接。
- T1 不解析 `.state/run-manifests.jsonl`、不处理坏行、不修复缺失 manifest；这些仍属于 observer / 后续消费者职责。

### 4. 状态 adapter
新增 `src/goal-ledger-state.ts`，负责 `.state/goal-ledger.json` 的 IO：

- `loadGoalLedgerState(filePath = GOAL_LEDGER_STATE_PATH)`：文件不存在返回空账本；存在则 JSON parse + shape 校验；支持 schemaVersion 兼容入口。
- `saveGoalLedgerState(state, filePath = GOAL_LEDGER_STATE_PATH)`：`mkdir -p dirname`，写 `${filePath}.tmp`，再 rename 到目标路径。
- `saveGoalLedgerEntry(kind, id, mutate, filePath?)`：同文件锁串行；每次读取最新文件、只合并目标 entry，再原子写回，避免并发保存不同目标 / 任务互相覆盖。

不引入 intake 那种长生命周期 `StatePersister`，因为 T1 只要求 adapter/helper 供未来 runner 调用，不接入心跳。

### 5. 有界 IO 与故障注入入口
QA 审查指出：状态 adapter 将来被 runner 调用时，如果文件系统 promise 永久不 settle，entry-level merge 的同文件锁会阻塞后续账本写入。T1 不接 runner，但 adapter 需要提供可测的有界入口，避免把无限等待设计成默认前提。

调整 `goal-ledger-state` 公共 API：

```ts
interface GoalLedgerStateIo {
  mkdir(path: string, options?: { signal?: AbortSignal }): Promise<void>;
  readFile(path: string, options?: { signal?: AbortSignal }): Promise<string>;
  writeFile(path: string, data: string, options?: { signal?: AbortSignal }): Promise<void>;
  rename(from: string, to: string, options?: { signal?: AbortSignal }): Promise<void>;
}

interface GoalLedgerStateIoOptions {
  io?: GoalLedgerStateIo;
  timeoutMs?: number;
  signal?: AbortSignal;
}
```

规则：

- `loadGoalLedgerState`、`saveGoalLedgerState`、`saveGoalLedgerEntry` 接收可选 `GoalLedgerStateIoOptions`。
- 每个公共 IO 操作通过 `runGoalLedgerIoOperation(label, operation, options)` 包装，支持 caller 传入 `timeoutMs` 与 `AbortSignal`。
- timeout / abort 返回确定性错误，例如 `goal-ledger-io-timeout:<label>` 或 `goal-ledger-io-aborted:<label>`；调用方可以把它折叠为普通失败，不会永久等待。
- `saveGoalLedgerEntry` 的同文件锁必须在成功、快速失败、timeout 或 abort 后释放；等待中的后续 entry save 不能永久卡在已失败操作之后。
- 默认 Node fs adapter 仍使用既有 `fs.promises`；测试通过 injected fake IO 覆盖快速失败、慢成功和 timeout 分支。
- 原子性仍由 temp file + rename 负责：`writeFile` 失败时目标文件保持旧账本；`rename` 失败时目标文件也必须保持旧账本，临时文件不得被当作正式状态读取。

### 6. 测试设计
本次包含可测逻辑，必须落单元测试：

- schema 校验：空账本、有效 goal/milestone/task/phase、非法引用、非法 ready 缺字段。
- 采访入账：部分目标创建 draft/pending，缺字段与 nextQuestions 可见；后续补齐字段后可转 ready。
- run manifest 引用：合法 jsonl-line / run-dir locator 通过；只有 issue / role / completedAt 的引用被判 unresolved 或拒绝 linked。
- state adapter：缺失文件返回空账本；保存产生可再次加载的 JSON；无 schemaVersion 的兼容输入按设计迁移或报明确错误；写失败 / rename 失败时旧账本仍可加载；entry-level 并发保存不覆盖彼此；慢 IO / timeout / abort 分支有 fake IO 测试。
- AI 验证流程：跑 `pnpm test -- goal-ledger`、`pnpm test`、`pnpm typecheck`。

## 权衡
- 选独立 `goal-ledger` domain，而不是并入 `github-issue-runner`：T1 尚不接 runner，目标账本是产品事实源，不应被 issue runner 的执行细节牵引。
- 选 JSON 本地状态，而不是 JSONL：账本需要按目标 / 任务更新当前事实，append-only 更适合观察记录；run manifest 已承担 run 观察 JSONL。
- 选引用 run manifest，而不是扩展 manifest：run manifest 是执行观察源，扩展它会把“目标事实”绑死在 Codex run 上，无法表达未执行但已澄清的目标。
- 选 entry-level merge helper，而不是单写者 persister：当前不接 runner 心跳，无需长期内存权威；串行 read-modify-write 加 deadline / abort 包装已能满足数据正确级。

## 风险
- schema 过早变成编排者设计。控制方式：T1 只表达实体和关系，不加入调度决策、扇出、join 或 worktree capability。
- run manifest 引用 locator 可能以后调整。控制方式：引用 shape 使用 discriminated union，后续可新增 locator kind；T1 不复制完整 record，降低迁移成本。
- 并发 entry-level merge 如果锁实现错误会覆盖状态或卡死。控制方式：专门单测两个并发保存写入不同 entry，验证最终文件同时保留两者；再用 fake IO 覆盖快速失败、慢成功和 timeout / abort 后锁释放。
- 状态兼容规则不清会导致后续迁移困难。控制方式：schemaVersion 从 1 开始，loader 对未知版本 fail closed，对缺失文件返回空账本。
