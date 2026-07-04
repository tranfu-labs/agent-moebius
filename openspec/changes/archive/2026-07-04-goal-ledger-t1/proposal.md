# 提案：goal-ledger-t1

## 背景
里程碑 3 的核心缺口是目标、阶段与质量基准还不是一等公民状态。现有 role thread state 记录的是某个 issue + role 的 Codex thread 游标，run manifest 记录的是每次 Codex run 的执行观察；它们都不能表达“用户给出一个长期目标后，系统先部分接收、继续澄清缺失范围，直到目标 ready”的产品账本。

`docs/roadmap/milestone-3-orchestration.md` 明确 T1 要沉淀目标 / 里程碑 / 任务 / 阶段 / 质量基准 / 父子 issue 关系的一等公民本地状态，并在方案阶段明确与 run manifest 的关系。`docs/roadmap/milestone-standards.md` 要求任务具备可机械执行的验收语句与显式质量基准。product-manager 已确认 T1 按“范围最小、先把账本作为可信本地事实源落地”推进，质量档位为数据正确级。

## 提案
新增 `goal-ledger` 行为域和本地状态能力：

1. 新增独立业务模块，表达目标、里程碑、任务、阶段、质量基准、验收语句、依赖、父子 issue 关系、provenance 与 run manifest 引用。
2. 新增目标采访入账纯业务流程：允许目标先以 draft / pending 状态部分入账，记录缺失字段、证据来源和下一步澄清问题；只有验收语句、范围、依赖、质量基准等必要字段齐备后才能转 ready。
3. 新增 `.state/goal-ledger.json` 读写 adapter：缺失文件返回空账本，写入采用临时文件 + rename 原子落盘，并提供 entry-level merge helper 与同文件写串行化，供未来 runner 或 agent prescript 调用。
4. 为状态 adapter 提供可配置 deadline / AbortSignal 包装入口和可注入 IO，确保未来 runner 接入时可以在有界时间内得到 load/save/entry merge 的成功、失败、timeout 或 aborted 结果；T1 通过 fake IO 做故障注入验证。
5. 明确账本与 run manifest 的关系为“引用”而不是扩展：目标账本是目标事实源，run manifest 是执行观察源；账本只保存可回查引用键和引用状态，不复制完整 manifest record，也不负责修复坏 manifest。
6. 更新模块地图、AGENTS 与路线图任务证据。实现完成并验收通过后，在 `docs/roadmap/milestone-3-orchestration.md` 的 T1 下追记验收证据并勾选任务。

## 影响
- `src/goal-ledger.ts`：新增纯业务 schema、校验、入账/ready 判定、run manifest reference shape 和不可变更新 helper。
- `src/goal-ledger-state.ts`：新增 `.state/goal-ledger.json` adapter、原子写入、entry-level merge helper、写串行化、可注入 IO 与可配置 deadline / AbortSignal 包装入口。
- `src/config.ts`：新增 `GOAL_LEDGER_STATE_PATH = ".state/goal-ledger.json"` 常量。
- `tests/goal-ledger.test.ts`、`tests/goal-ledger-state.test.ts`：覆盖 schema 不变量、采访入账、ready gate、兼容加载、原子写入和并发 entry merge。
- `openspec/specs/goal-ledger/spec.md`：实现归档后成为目标账本行为事实源。
- `docs/architecture/module-map.md` 与 `AGENTS.md`：补充新模块边界与状态文件约定。

## 非目标
- 不接入 runner 心跳、不改变 issue 扫描 / mention trigger / Codex driver 路径。
- 不创建、更新或同步 GitHub issue；父子 issue 关系只保存 reference 与意图 / 状态。
- 不改观察页，也不新增账本 UI。
- 不实现 T2 的阶段切换、归档或上下文过滤。
- 不实现 T3 编排者、T5 issue 级 worktree 资源化、T6 圆桌拓扑或 T7 观察页升级。
- 不把 issue 内容拼接进 shell，不把账本状态放进 `agents/`，不让 run manifest 成为目标账本唯一事实源。
