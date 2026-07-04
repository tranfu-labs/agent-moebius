# 里程碑 2：稳住机器 · 长完眼睛 · 写下尺子

## 背景

里程碑 1 已在规则层跑通验收闭环（dev 验收语句 → CEO 验收回流 → 验收角色走查 → qa 测试设计门），T4 探针证明本地 worktree + 无头浏览器截图路径可行，并定位了 artifact publisher 的精确 gap。同时真实运行暴露了稳定性问题：gh 网络错误卡死、Codex 媒体死锁（#38）、以及 agent 输出里裸 `@` 误触发与 `#数字` 假引用的交互事故。

本里程碑三条主线：**稳定性**（无人值守系统的价值 = 能力 × 存活率，后续并行编排会把失败率按 issue 数放大）；**运行级验收最后一环**（worktree 验收截图能发布回时间线，配只读观察页）；**里程碑设定标准**（给里程碑 3 的编排者写决策尺子）。

与里程碑 1 不同：**本里程碑允许改运行时代码**，但每个任务只允许触碰其范围列明的模块，越界仍停下等用户。

## 前置欠账（不属于本里程碑，先于本里程碑收尾）

- 里程碑 1 T5 端到端 dogfood 仍未完成，按 M1 文档执行。
- `src/issue-media.ts` 的 SVG 过滤 hotfix 未正规化——已并入本里程碑 T1 范围。

## 成功标准（里程碑级）

1. **故障注入下不卡死**：模拟 gh 网络故障与 Codex 子进程卡死，runner 均在限期内自愈或走死信路径，心跳持续，driver pool 名额不泄漏。
2. **运行级验收证据链端到端**：至少一个真实 issue 上，dev 在 worktree 内生成验收截图 → publisher 自动发布 → 评论含可查看链接 → 验收角色引用该证据完成走查 → 观察页能看到该 issue 的阶段与证据全景。

## 任务清单

约定（同里程碑 1，另加受控并行规则）：
- 默认每轮循环只做一个任务，按依赖顺序取第一个未勾选且未被阻塞的任务。
- **受控并行（实验性）**：仅允许"代码任务 × 纯文档任务"两两并行（如 T1‖T6），上限 2 个在飞。禁止两个改 `src/` 的任务并行——dev worktree 的"main 前进即强制重建"策略会摧毁另一个在飞任务的进行中工作（该策略修订排在里程碑 3 T5）。并行期间任一 PR 出现合并冲突，立即回退串行并记录。
- 涉及 `agents/` 与运行时行为的改动遵守仓库 OpenSpec 纪律：先在 `openspec/changes/` 落方案，实现后归档、更新受影响 spec 与 AGENTS.md。
- 每个任务完成时，把"验收证据"（文件路径、issue 链接或测试输出）追记到本文件对应任务下方，再勾选。
- 标注【人工】的任务需要用户参与，循环应准备好材料后停下等用户，不得伪造完成。
- 验收语句的 rescope / override 须经需求持有者或用户确认（T5 落地前先按此约定执行）。

### - [ ] T1 · runner 稳定性加固

**目标**：系统性消除"卡死"类故障：gh 调用全链路显式超时与熔断（连续失败后冷却，不无限重试）；Codex 子进程 watchdog（超时强杀、按失败路径处理、释放 driver pool 名额）；死信路径补全（所有失败分支最终可达死信或恢复，不存在既不推进也不报告的状态）；`src/issue-media.ts` SVG 过滤 hotfix 正规化（OpenSpec + 测试 + 提交）；以上均配故障注入自动化测试。

**范围**：`src/retry.ts`、`src/github.ts`、`src/codex.ts`、`src/driver-pool.ts`、`src/github-response-intake.ts`、`src/issue-media.ts` 及对应测试；不改 `agents/`。

**验收语句**：
1. 跑注入 gh 网络故障的测试（fake adapter 持续报错）→ 应看到限期内进入死信或恢复，心跳不中断，无无限重试。
2. 跑注入 Codex 卡死的测试（fake driver 永不返回）→ 应看到 watchdog 超时强杀、按失败路径记录、driver pool 名额释放。
3. 跑 `rg -n "svg" tests/` 与 `git log --oneline -- src/issue-media.ts` → 应看到 SVG 过滤已有测试覆盖且已提交，对应 OpenSpec change 已归档。
4. 跑 `pnpm test` 与 `pnpm typecheck` → 应输出退出码 0。

**依赖**：无。

### - [ ] T2 · 全局 GitHub 交互协议

**目标**：制定单一事实源的 GitHub 交互协议并让所有角色遵守，CEO 发布前兜底。协议至少覆盖：**`@` 语义 = 移交控制权**——每条消息最多一个 `@`，只在明确移交下一步时使用，纯提及一律裸写角色名（触发器只认最新消息第一个合法 mention，误 `@` 会真实移交控制权并占用 driver 名额）；**`#数字` 只用于真实引用 issue**——任务编号用 `T3` 类前缀形式，禁止裸 `#N` 表达非 issue 编号（GitHub 会在被引用 issue 生成反向引用，制造通知噪音与假关联）；每条规则附正例与反例。各 persona 同步该协议；`agents/ceo.md` 增加违规纠正规则（用 append 要求改正，或经方案论证后启用 replace 直接纠正——执行方决策并记录理由）。

**范围**：新增 `docs/protocols/github-interaction.md`；`agents/*.md` 同步；可选运行时加固：mention 解析忽略反引号 / 代码块内的 `@`（`src/conversation.ts` + 测试），做不做由方案阶段论证。

**验收语句**：
1. 打开 `docs/protocols/github-interaction.md` → 应看到 `@` 移交语义与 `#数字` 使用规则，且每条附正例反例。
2. 跑 `rg -l "github-interaction|交互协议" agents/` → 每个 persona 文件均应命中协议引用或内嵌要求。
3. 构造一条含裸 `@dev` 纯提及与 `#3` 任务编号的 agent 响应跑 CEO 校正 → CEO 应介入指出违规并给出合规写法。
4. （若做运行时加固）构造代码块内 `@dev` 的时间线 → 不应触发 dev。

**依赖**：无。

### - [ ] T3 · artifact publisher 发现 worktree 验收截图 + run manifest 契约

**目标**：修复 T4 spike 定位的 gap：dev 在 issue 独占 worktree 内生成的验收截图，在最终回复按约定契约引用后，能被 `discoverOutputArtifacts` 稳定发现并经现有 artifact publisher 发布，评论含可查看链接。同时把每轮 run 的结构化记录落成 **run manifest**（issue、role、stage、产物路径、发布链接、时间），作为观察页（T4）与未来目标账本（里程碑 3）的数据契约。引用契约写入协议文档与 `agents/dev.md`。

**范围**：`src/media-assets.ts`、`src/codex.ts` / `src/runner.ts` 中 artifact 发现与发布路径、manifest 落盘位置（`.state/` 或 runDir，方案阶段定）；`agents/dev.md` 与 `docs/protocols/github-interaction.md` 的引用契约条目；对应测试。

**验收语句**：
1. 构造 dev worktree 内含 PNG 且最终回复按契约引用的场景（可复用 `scripts/spike-preview-oracle/` 产物）→ 跑发现逻辑 → 应看到该 PNG 进入 `output-artifacts/` 并走发布路径，评论体含链接。
2. 任一 Codex run 完成后 → 打开 manifest 文件 → 应看到 issue、role、stage、产物、发布链接、时间字段齐全。
3. 打开 `agents/dev.md` → 应看到验收截图的引用契约（放哪、怎么引用、何时发布）。

**依赖**：T1（发布链路依赖 gh 调用加固后的错误语义）。

### - [ ] T4 · 只读观察页 v0

**目标**：一个本地只读页面回答"系统现在在干嘛、每个 issue 走到哪、验收证据长什么样"：读 `.state/*.json`（intake 状态、role threads、agent contexts）与 T3 的 run manifest，渲染白名单 issue 列表、阶段状态、每轮 run 的产物与发布链接。**只读**：不写任何状态、不加操作按钮；观察页进程与 runner 零耦合，崩溃或关闭不影响 runner。

**范围**：新增独立入口（如 `src/observer/` 或 `scripts/observer/`，方案阶段定）；不改 runner 主链路；`AGENTS.md` 补运行命令。

**验收语句**：
1. 本地启动观察页 → 打开浏览器 → 应看到白名单 issue 的列表与各自阶段状态。
2. 选一个有截图发布记录的 issue → 页面应显示其截图或发布链接。
3. 强杀观察页进程后触发一轮 runner 心跳 → runner 日志无错误，处理不受影响。

**依赖**：T3（manifest 契约）。

### - [ ] T5 · 验收治理规则

**目标**：堵上里程碑 1 T4 暴露的治理口子：验收语句是需求侧资产——执行方或 loop watcher 不得自行 rescope 验收语句或 override 验收结论；变更须由需求持有者（agent 角色）或用户确认后生效，确认记录须出现在 issue 时间线。CEO 增加识别规则：发现未经确认的验收语句变更或 override 时介入要求补确认。

**范围**：`docs/protocols/github-interaction.md`（或独立治理条目）、`agents/ceo.md`、`agents/dev.md`、验收角色 persona；不改运行时代码。

**验收语句**：
1. 打开协议 / persona 文件 → 应看到"验收语句变更须需求持有者或用户确认"的规则与确认落时间线的要求。
2. 构造执行方擅自改写验收语句并自判通过的时间线跑 CEO 校正 → CEO 应介入指出变更未经确认，要求需求持有者表态。

**依赖**：T2（挂在协议文档上）。

### - [ ] T6 · 里程碑设定标准文档

**目标**：产出 `docs/roadmap/milestone-standards.md`，作为人和未来编排者（里程碑 3）共用的决策尺子。至少包含：**垂直切片原则**（里程碑 = 一次能力解锁或最大风险消除，收尾必须是可被角色端到端验收的垂直切片；反例：水平分层——先做完所有数据库再做所有接口，每层都无法验收）；**风险优先排序**（最不确定的先用 spike 消除，引用 M1 T4 为范例）；**显式质量基准**（demo 级 / 数据正确级 / 成品级是里程碑的显式属性，写进里程碑文档，不靠执行方悟）；**任务粒度标准**（一个任务 = 一组可机械执行的验收语句 + 与兄弟任务最小文件重叠）；**worked example**：以"做一个支付宝式项目"为例给出 M0（假账扫码支付通路 demo）→ M1（单用户真实 happy path）→ M2（账户安全与异常路径）→ M3（商户侧）的完整拆解示范，每级标注质量基准与验收方式。

**范围**：`docs/roadmap/milestone-standards.md`；`docs/roadmap/milestone-task-issue-template.md` 增加对标准的引用。

**验收语句**：
1. 打开 `docs/roadmap/milestone-standards.md` → 应看到垂直切片、风险优先、显式质量基准、任务粒度四原则，均附正反例。
2. 文档内应看到支付宝式项目的多级里程碑 worked example，每级含质量基准与验收方式。
3. 打开 `docs/roadmap/milestone-task-issue-template.md` → 应看到对标准文档的引用。

**依赖**：无。

### - [ ] T7 ·【人工】端到端演练

**目标**：在一个真实 issue 上验证本里程碑成果协同生效：dev 按契约在 worktree 生成验收截图 → publisher 自动发布 → 验收角色引用截图证据完成走查 → 用户在观察页核对该 issue 全景；演练期间注入一次 gh 故障（如临时断网）验证自愈。记录卡点，规则缺陷回流为新任务，不现场改规则。

**范围**：不改代码；演练记录追记到本文件。

**验收语句**：
1. 打开演练 issue → 时间线应包含带截图链接的 `code-verified` 评论与验收角色引用该证据的逐条走查结论。
2. 打开观察页 → 应看到该 issue 的阶段与证据全景。
3. 本文件应追记演练记录，含故障注入的自愈观察与卡点清单（可为空）。

**依赖**：T1、T2、T3、T4。

## 非目标

- **不做目标账本 / 编排者 / issue 拆解**：里程碑 3 主题；本里程碑只交付其数据地基（run manifest）与决策尺子（milestone-standards）。
- **不脱离 GitHub 作为对话与执行介质**：观察页是只读旁路，不是替代基座。
- **不做 Figma 对齐流程**；**不上 PR 预览基建**（触发条件见 `docs/roadmap/spike-preview-oracle.md`，未满足）。
- **观察页不写状态、不加交互**：v0 只回答"看得见"，操作能力留给里程碑 3 论证。

## 里程碑收尾

T1–T7 全部勾选后：把成功标准达成证据（演练 issue 链接、故障注入测试输出）写入本文件头部；依据 run manifest 实际形态与 milestone-standards，细化 `docs/roadmap/milestone-3-orchestration.md` 的任务验收语句，等用户裁决后启动。
