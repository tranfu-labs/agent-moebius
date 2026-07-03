# 提案：add-qa-test-design-gate

## 背景

2026-07-03 事故复盘暴露了开发流程的结构性缺口。事故本身有两条线：gh 子进程无超时，网络黑洞时挂起 → job 永不 settle → `busy` 永占 / 心跳空转；`missing-repo-cache` 按设计烧完重试预算走死信，但死信评论恰在断网期发不出去，系统的"我放弃了"信号本身也沉默。

回溯方案文档发现：`2026-07-02-harden-github-cli-transient-failures` 的 proposal **已经用文字写出了这个故障类**（"若 codex run 永不返回，则该 issue 永久 skip-inflight"），却只给 codex run 加了看门狗，gh 子进程这个同类调用没有覆盖。缺陷不是没被发现，而是**发现后没有被泛化成不变量并全局排查**。

结构性缺口有二：

1. **系统级不变量没有事实源**。健壮性以事故驱动的补丁序列演进，每个 change 有正确的局部不变量（如 at-least-once 的游标推进规则），但 liveness（循环不得永久停转）这类全局性质无人持有。没有独立于方案自述的判定标准（oracle），任何评审只能验证"方案做到了它自己说的"，而两次 harden change 恰恰都做到了自己说的。
2. **方案阶段没有测试设计角色**。「验收语句」由 dev 自产自审，天然验证"我做了什么"而非"需要什么"；方案里的经验假设（如"gh 失败会报错退出"）无人标记为待实测。

## 提案

在 `plan-written` → 发起角色验收 之间插入一道 QA 测试设计关卡，QA 的增补用例并入「验收语句」，下游验收机制原封不动：

1. **新增 `agents/qa.md`**：测试设计 driver agent。方法论四步——提取方案经验假设清单；过故障矩阵（外部依赖 × 故障形态 × 流水线阶段）；用例二分（静态可裁决缺陷当场判不通过 / 经验假设写成可机械执行的故障注入验收语句）；对抗性审查已有验收语句。只设计不执行，不写实现代码。
2. **新增 `docs/architecture/invariants.md`**：系统级不变量清单，QA 的 oracle、dev 方案设计的约束。种子为本次事故沉淀的三条：liveness / safety / visibility。QA 发现新故障类时以补丁建议回流，人确认后合并。
3. **修改 `agents/ceo.md`**：阶段验收回流路由在 `plan-written` 分支先派 `@qa` 审查，QA 结论通过后再回流发起角色；生态认知与 `as` 集合加入 `qa`；免确认清单同步措辞。
4. **同步义务**：`src/format-ceo.ts` 的 `CEO_APPEND_ROLES` 白名单加 `qa`（spec 既有 MUST：新增 driver agent 必须同步该白名单）；`docs/roadmap/milestone-task-issue-template.md` 协作方式插入 QA 环节，避免模板指令与 CEO 路由打架。

刻意取舍：QA 只守方案关口，不在 `code-verified` 加第二道关——增补用例已并入验收语句，证据核查由既有发起角色回流机制顺带覆盖。

## 影响

- **业务域**：`github-issue-runner`（persona 生态、CEO 阶段验收回流路由）。
- **模块**：`agents/qa.md`（新增）、`docs/architecture/invariants.md`（新增）、`agents/ceo.md`、`docs/roadmap/milestone-task-issue-template.md`、`src/format-ceo.ts`（仅 `CEO_APPEND_ROLES` 一行常量）。
- **对外行为变化**：dev 输出 `plan-written` 后，CEO 先派 `@qa` 做测试设计审查（纯文档类方案由 QA 一句话豁免直通），审查通过才回流发起角色验收；发起角色验收的「验收语句」从此包含 QA 增补的故障注入用例，dev 在实现阶段执行并附证据。
- **不做**：不改 runner 运行时逻辑（gh 超时等 liveness 修复是另一个 change 的事）；QA 不自动执行故障注入；不新增 stage 枚举。
