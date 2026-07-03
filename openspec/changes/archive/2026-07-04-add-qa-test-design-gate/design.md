# 设计：add-qa-test-design-gate

## 方案

### 流程变化

```
现状:  dev plan-written ──CEO路由──> 发起角色按验收语句验收 ──> dev 实现 ──> code-verified ──> 发起角色查证据
改后:  dev plan-written ──CEO路由──> @qa 测试设计审查 ─┬─ 不通过 ──> @dev 改方案(补分支/补验收语句) ──> 重出 plan-written 再审
                                                      └─ 通过(验收语句已含QA增补) ──> 发起角色验收 ──> 后续完全不变
```

### 1. `agents/qa.md`（新增，核心交付物）

persona 定位：专业测试思维的操作化——**对着意图测，不对着方案自述测**。方案自述是被测对象，判定标准（oracle）来自 `docs/architecture/invariants.md` 与需求原文。此纪律在 persona 开头显式声明。

**审查方法四步（对每个含运行时行为改动的方案必做）**：

1. **提取经验假设清单**：方案依赖哪些"外部世界会如此表现"的事实性断言（子进程会有界退出、磁盘状态跨 tick 存在、API 有限流上界等）。每条标注：方案验证过吗？
2. **过故障矩阵**：外部依赖（子进程 / 网络 / 磁盘状态 / 长任务）× 故障形态（快速失败 / 永久挂起 / 慢成功 / 状态丢失）× 流水线阶段。逐格问：方案有答案吗？输出只列**有问题的格**，不铺全矩阵。
3. **用例二分**：
   - *静态可裁决*——方案对某格没有答案（缺分支），当场判不通过，这类不进验收语句；
   - *需故障注入实测*——方案有答案但正确性依赖经验假设，写成可机械执行的验收语句增补（`做 X 注入故障 → 系统应在 Y 内表现 Z`）。
4. **对抗性审查已有验收语句**：逐条判是否可机械执行、是否只覆盖 happy path。

**豁免判据**：方案不触碰运行时代码、外部依赖、状态机、agent 协作协议（纯文档 / 文案 / 注释类）→ 一句话豁免（注明理由）直接转发起角色，不产出矩阵长文。

**输出契约**：结构化评论，字段固定——审查对象（哪条 plan-written）、经验假设清单、矩阵未覆盖格、已有验收语句问题、验收语句增补 delta、结论行。结论行固定格式便于 CEO 文本识别：`QA 结论：通过` 或 `QA 结论：不通过`。每条不通过缺陷 MUST 挂靠到具体矩阵格或 invariants.md 条目编号，泛泛而谈视为无效缺陷。

**mention 协议**（遵守"一轮只触发一个 mention"）：不通过 → mention `@dev` 逐条列静态缺陷与增补要求；通过 → mention 发起需求角色请其按验收语句（含 QA 增补，正文注明）验收。

**stage 契约**：恒 `<!-- agent-moebius:stage=in-progress -->`，阶段语义用正文结论行表达，不新增 stage（遵守 spec"其他 Codex agent 默认 stage MUST 为 in-progress"）。

**回流机制**：审查中发现清单外的新故障类 / 新不变量 → 在评论中提出 `docs/architecture/invariants.md` 补丁建议，交人类确认后合并（仿 product-manager 对 hermes-user.md 的模式），不直接改文件。

**终止条件**：同一需求的方案最多两轮不通过；第三轮仍有分歧时列明分歧点、判"有保留通过"并交人类裁决，防止 qa↔dev 空转烧 thread。

### 2. `docs/architecture/invariants.md`（新增）

系统级不变量事实源。定位说明 + 种子三条：

- **L1（liveness）**：任何单点故障（外部调用挂起、崩溃、慢）不得使心跳循环或任一 issue 的推进永久停转。推论：每个外部调用（子进程 / 网络 / 文件系统）必须有界时或有看门狗兜底。
- **S1（safety）**：用户指令不丢——intake 游标 `updatedAt` 只在 GitHub 上留下可见结果之后推进（源自 `2026-07-03-at-least-once-issue-intake`，此处提升为系统级）。
- **V1（visibility）**：系统放弃或降级任何任务必须在 GitHub 上留下可见痕迹；且该痕迹的发布路径本身受 L1 / S1 约束（"我放弃了"的信号不能因为同一场故障而沉默）。

维护规则写在文件内：新增 / 修订不变量走 openspec change；qa 只提议，人裁决。

### 3. `agents/ceo.md`（修改）

- **协作生态认知**：可触发 agent 清单加 `qa`。
- **阶段验收回流路由 `plan-written` 分支**：验收语句齐全后，回流目标从发起需求角色改为 `append as=ceo` mention `@qa`，要求按测试设计流程审查本轮方案。不查历史 qa 结论——CEO 的阶段回流只在 `latestResponse` 带 `plan-written` marker 时触发，此时任何历史结论都早于这条最新方案；dev 每次重出 `plan-written` 都重审，幂等且天然防"拿旧结论放行新方案"。缺验收语句分支不变（仍先要求 dev 补齐）。
- **qa 交棒兜底守护（新增场景）**：真实的交棒由 qa 评论里的 mention 完成，CEO 只兜漏交——qa 的 `latestResponse` 含 `QA 结论：通过` 但正文没有 mention 发起需求角色 → CEO `append as=ceo` mention 发起角色要求验收；含 `QA 结论：不通过` 但没有 mention `@dev` → CEO `append as=ceo` mention `@dev` 要求修正。qa 交棒正常时 `no_change`。
- **`code-verified` 分支不变**（发起角色查证据，QA 增补用例已在验收语句内被顺带核查）。
- **输出格式**：`as` 枚举加 `qa`。
- **免确认操作放行**第 3 条措辞同步：「方案经 qa 测试设计审查通过且发起角色验收通过后进入实现」。

### 4. 同步义务

- `src/format-ceo.ts`：`CEO_APPEND_ROLES` 加 `"qa"`（spec 既有 MUST：新增 driver agent 必须同步 `as` 允许集合与该白名单）。无逻辑变化。
- `docs/roadmap/milestone-task-issue-template.md` 协作方式节：插入「方案 plan-written 后由 qa 做测试设计审查（CEO 自动路由），审查通过后 product-manager 再验收；qa 增补的故障注入用例由 dev 在实现阶段执行并附证据」。

### 测试

纯 persona / 文档改动 + 一行常量，无可测逻辑，豁免单测（`pnpm test` 回归既有用例须绿）。**AI 验证用例**（persona 是 prompt，需回归验证）：

1. **能抓真洞（回归基准）**：把 `openspec/changes/archive/2026-07-02-harden-github-cli-transient-failures/design.md` 原文作为待审方案干跑 qa persona，其矩阵必须点名「gh 子进程 × 永久挂起」为未覆盖格并判不通过——本次事故即标准答案。
2. **豁免不误伤**：喂一个纯文档方案，应输出一句话豁免并转发起角色。
3. **CEO 路由与兜底**：构造三份上下文干跑 CEO——dev 的 `plan-written`（验收语句齐）→ mention `@qa`；qa 的 `QA 结论：通过` 但漏 mention 发起角色 → CEO 兜底 mention 发起角色；qa 的 `QA 结论：不通过` 且已 mention `@dev` → `no_change`。

## 权衡

- **QA 只守 plan-written，不守 code-verified**：增补用例并入验收语句后，证据核查由既有发起角色回流覆盖；双关卡会把每个任务拖长两轮。放弃的是 QA 亲自核证据的严格性，换取流程零新增回路。
- **oracle 独立成 `invariants.md` 而非写死进 qa.md**：dev / dev-manager 设计方案时也能引用；可通过回流生长；qa persona 将来重写不丢资产。放弃的是单文件自包含。
- **不新增 stage，CEO 靠正文固定结论行识别**：遵守既有 spec 约束（非 dev agent 恒 in-progress），零 `src/stages.ts` 改动。文本识别弱于结构化 marker，误判方向刻意设计为幂等——宁可重派 qa 一轮，不会漏掉发起角色验收。
- **QA 只设计不执行故障注入**：执行权在 dev（有 worktree 与运行环境），qa 无执行环境；设计与执行分离也便于用例被逐条核查。放弃的是 QA 独立复现证据的能力。

## 风险

- **流程变慢**：每个含运行时改动的方案多一轮 qa。缓解：豁免判据放走纯文档类；两轮不通过上限防空转。极端时回滚阀：把 qa 关卡收窄为仅 `src/` 方案触发。
- **qa 误报 / 过度苛刻**：要求每条缺陷挂靠矩阵格或不变量编号，泛泛而谈无效；分歧超两轮交人类。
- **CEO 文本识别 qa 结论误判**：fail 方向为重派 qa（幂等，多花一轮），不会跳过验收环节。
- **回滚思路**：删 `agents/qa.md` + 还原 `agents/ceo.md` 路由段与模板即可恢复现状；`CEO_APPEND_ROLES` 中的 `qa` 可保留（无触发者时无害）；`invariants.md` 独立有价值，回滚也保留。
