# 设计：observer-ledger-ui-t7

## 方案

### 1. observer 只读输入扩展
在 `src/observer/read-state.ts` 中新增 `.state/goal-ledger.json` tolerant reader：

- 读取路径固定为项目根 `.state/goal-ledger.json`。
- ledger read 必须经过 observer 本地 timeout wrapper；默认 timeout 用 observer 内部常量，测试可注入 fake reader / fake FS。若 read 永不 settle 或超时，返回 `timeout` diagnostic 和 ledger unavailable 状态，HTTP request 仍在配置超时内返回，现有 issue/run 区域继续渲染。
- 文件缺失返回空账本和 `missing` diagnostic。
- JSON 损坏、schemaVersion 非 1、顶层 collections 缺失或整体不可解析，属于全局 ledger unavailable；页面显示 ledger read-failure 空态，但 legacy issue/run 区域继续渲染。
- multiple-active phase 不属于全局 read failure。observer 不直接复用会全局 fail-closed 的 `assertGoalLedgerState` / `projectActivePhaseContext` 作为主树入口；实现时复用 T2 projection 的 owner / phase / quality baseline / current-context 类型口径，但在 observer 内实现 owner 级 tolerant evaluator。
- reader 只读文件，不调用 `saveGoalLedgerState`、entry merge helper 或任何写状态 helper。

`ObserverStateSnapshot` 增加：

- `goalLedger`: 全局可读时的 sanitized ledger tree input；缺失时为空账本；全局不可用时为空。
- `goalLedgerStatus`: `ok` / `missing` / `timeout` / `error`。
- `goalLedgerDiagnostics`: 账本过滤计数、timeout / 损坏原因、owner 级 phase error、无法定位闸口原因等诊断。

### 2. 账本树纯模型
在 `src/observer/model.ts` 中把 ledger 到 UI 的映射放进纯函数，便于 fixture 级单测：

- `buildLedgerTree(snapshot)`：输出 watched goals、filtered goal count、unlinked runs、ownerErrors 和 diagnostics。
- watched 判定：goal / milestone / task / phase 的 provenance 或 issue refs 中任一引用命中 watched repo，则纳入该 goal。纳入后树内的非白名单 issue ref 继续展示，但置灰并标注 `not watched / no live poll status`。
- goal 下按 ledger milestone 顺序展示 milestone；`milestoneId` 缺失的 task 放进固定分组 `未归属里程碑任务`。
- phase 摘要按 owner 归属到 goal / milestone / task 节点。active phase 高亮；pending/completed 折叠展示；owner 无 active 时显示 `no active phase`；同一 owner 多 active 时只在该 owner 节点输出 ledger error，主树仍渲染，不合并、不猜当前上下文。
- task detail 从 `computeReadyMissingFields`、task 字段、child refs、latest acceptance fact、phase integrationAcceptance 和 explicit runManifestRefs 计算，不读取 GitHub。需要 current-context 时使用 observer-local owner evaluator；当 owner 多 active 时该 task 的 active phase projection 显示 owner 级错误而不是全局 fallback。

### 3. gate / join / evidence 映射
gate 展示遵守 T4/T7 的数据正确口径：

- child gate：某个 task child ref 没有最新 passed acceptance fact，显示等待验收角色确认该 child issue，并给出 child issue ref 作为下一步评论地点。
- failed child gate：最新 fact 为 failed 时显示等待修复或重新验收，依据指向 latest fact 的 issue/message/comment。
- integration gate：observer-local owner evaluator 找到唯一 active phase、该 phase 的 child facts 全 passed、且 integrationAcceptance 最新事件缺失或 status 为 `requested` / `failed` / `blocked` 时，显示等待父级 integration acceptance，并指向 parent issue ref；缺 parent ref 时显示“闸口不可定位：ledger 缺 parent/child issue reference”。
- blocked reason：无 active phase、多个 active phase、缺 target acceptance statements、无 child refs、cross-repository child 等只展示为 blocked/waiting 原因，不自动触发任何 action。
- roundtable child ref 只在 bounded note 含精确 `agent-moebius-roundtable-key:[a-f0-9]{32}` 时显示 `roundtable child` badge；渲染前必须脱敏/移除 hidden key 原文。普通 provenance 文本、近似但非 roundtable key 文本不得显示 badge。roundtable completion 不参与 acceptance pass 或 integration pass 计算。
- task evidence 只匹配 `TaskRecord.runManifestRefs` 中的 locator。`.state/run-manifests.jsonl` 的其他有效 records 展示在 `Unlinked local runs`，作为诊断而非任务证据。

敏感 / 不该展示内容：

- 不展示完整 issue body/comment body。
- 不展示完整 run manifest JSON。
- 不展示 hidden orchestration key、hidden integration key、hidden roundtable key 原文。
- bounded note 只截断展示短 provenance 摘要；命中 hidden key 形态时只转为 badge。
- 不展示 token、密钥或无关本机细节。

### 4. 页面布局
主屏改为 ledger-first：

- 左侧导航：watched goal 列表、active/waiting/error counters、unlinked local runs 计数。
- 主内容顶部：Diagnostics。
- 主内容主体：目标 → 里程碑 → 任务树；task detail 直接内联展示，不再让 legacy issue list 成为主页面。
- 底部/二级区域：`Unlinked local runs` 与 legacy issue/run records，默认折叠。ledger 损坏时该区域仍可用。

页面继续使用 server-side HTML + CSS，不引入前端构建链路。所有交互限于 `<details>` 展开/折叠和锚点跳转，不提供写按钮。

### 5. 测试设计
可测逻辑必须单测覆盖：

- goal 纳入 watched repo 的 provenance / issue ref 规则，以及完全无白名单关联 goal 的过滤计数。
- 非白名单 issue ref 在已纳入 goal 内置灰展示。
- milestone task 与 `未归属里程碑任务` 分组。
- active / pending / completed phase 映射、无 active、多个 active 错误。
- otherwise valid ledger 中 owner A 无 active phase、owner B 多 active phase 时，主树仍渲染；owner A 显示 `no active phase`，owner B 显示 owner 级 ledger error，不进入全局 ledger read-failure fallback。
- task readiness、quality baseline、dependencies、scope 摘要、acceptance statements 数量与 latest fact 结果。
- child acceptance、integration event、blocked / waiting gate 映射。
- `.state/goal-ledger.json` read 永不 settle / 慢成功故障注入：observer HTTP request 在配置超时内返回 timeout 诊断，legacy issue/run 区域仍可见，fake `gh` / `codex` 调用日志为空。
- roundtable bounded note 同时覆盖真实 hidden key、普通 provenance 文本、近似但非 roundtable 文本：只真实 roundtable child 显示 badge，不显示 hidden key 原文，不误标非 roundtable ref，并且不计入 acceptance pass / integration pass。
- explicit runManifestRefs 匹配 task evidence；未显式引用 runs 进入 `Unlinked local runs`。
- ledger 缺失、损坏 fallback；现有 observer issue/run 视图继续渲染。
- fake `gh` / `codex` 零调用与无文件修改边界。

AI 验证流程：

1. 用临时 fixture 写入 `config.local.toml`、`.state/goal-ledger.json`、`.state/run-manifests.jsonl` 和既有 observer state，构造含 watched goal、非 watched goal、milestone task、未归属 task、active/pending/completed phase、child facts、integration event、roundtable child、explicit run refs 与 unlinked runs 的数据。
2. 运行 `pnpm observer`，打开本地页面，检查目标树、gate 文案、非白名单 ref badge、task evidence 和 `Unlinked local runs`。
3. 用可注入 reader / fake FS 让 `.state/goal-ledger.json` read 永不 settle，刷新页面，确认请求在配置超时内返回 ledger timeout 诊断，legacy issue/run 区域仍显示。
4. 损坏 `.state/goal-ledger.json`，刷新页面，确认 ledger 树为读取失败空态，legacy issue/run 区域仍显示。
5. 删除 `.state/goal-ledger.json`，刷新页面，确认账本树显示空态/缺失诊断，不误报为读取失败。
6. 准备 otherwise valid ledger，其中 owner A 无 active phase、owner B 有两个 active phase，刷新页面，确认主树仍渲染，owner A 显示 `no active phase`，owner B 显示 owner 级 ledger error。
7. 准备 bounded note 同时包含真实 roundtable hidden key、普通 provenance 文本、近似但非 roundtable 文本，刷新页面，确认只真实 key 显示 badge，hidden key 原文不渲染，近似文本不误标。
8. 在 `PATH` 前置记录调用的 fake `gh` / `codex`，刷新 observer 页面，确认 fake 调用日志为空。
9. 对 fixture 目录记录文件列表和内容哈希，启动 observer、刷新多次、展开 details、停止 observer，确认 watched config、`.state/*.json`、`.state/run-manifests.jsonl` 与 artifact/release 目录无新增、无修改。

常规验证：

- `pnpm vitest run tests/observer.test.ts --reporter=verbose`
- `pnpm test`
- `pnpm typecheck`
- `git diff --check`

### 6. 不做范围
- 不做 goal-intake、phase switch、GitHub 写评论、runner 写接口、fan-out/join 原语或人工 dogfood。
- 不新增 observer 操作按钮、确认按钮、file watcher、GitHub/Codex 调用或 release/artifact 发布能力。
- 不改变 existing acceptance governance 或 GitHub issue 交互协议。

## 权衡
- 选择只读 gate 可见，不做页面点击确认：符合 PM 裁决和 observer 模块边界，避免在 T7 未定义写路径时让本地页面绕过 GitHub 对话介质。
- 选择复用 T2 projection 语义与 goal-ledger 类型口径，而不是直接复用 `assertGoalLedgerState` / `projectActivePhaseContext`：后者必须全局 fail-closed，适合 runner / ledger 严格路径；observer 需要在 multiple-active 这类 owner 局部错误下继续展示主树。
- 选择 explicit runManifestRefs 作为 task evidence 唯一依据：避免按 child issue 反查 run manifest 后伪装成任务证据，未关联 records 作为 legacy diagnostics 保留。
- 选择 server-side HTML + `<details>`：足够支持树状只读观察，且不引入构建工具和前端 runtime。

## 风险
- 账本 schema 后续扩展可能让 observer 忽略新字段。缓解：只读取 T7 验收需要的字段，未知字段忽略；shape 非法时诊断而不是崩溃。
- bounded note 中 roundtable hidden key 形态可能变化。缓解：只匹配当前代码事实源的精确 `agent-moebius-roundtable-key:[a-f0-9]{32}` 形态；近似文本不标 badge；若未来 key 形态变化，observer 宁可不标 badge，也不得泄露 key 或误计 acceptance。
- 页面信息密度提高后可读性下降。缓解：goal-first 树 + task details + legacy runs 折叠，保留诊断和 counters 辅助扫描。
- 多 active phase 是 owner 级账本错误，不是全局 UI 不可恢复状态。缓解：owner 节点显式标红，不推断 active，不切换到全局 read-failure fallback，避免数据正确级下伪造状态。
