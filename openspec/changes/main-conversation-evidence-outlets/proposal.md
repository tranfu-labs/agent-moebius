# 提案：main-conversation-evidence-outlets

## 需求基线

产品事实源锚点：`docs/product/pages/main-conversation.md`。本次**没有新的产品决策**——两条要求已由 `461fa7a` 在建立 `docs/product/pages/main-right-sidebar.md` 时写入会话区 PRD，本 change 只是让实现追上它。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-conversation.md` | 页面结构 · 一轮结束 / 区域与信息 · 结果卡片 / 验收标准 #22 | 新增结果卡片：一轮结束时说明有几个文件发生改动并能一步打开右侧栏 | 已写入（`461fa7a`） |
| `docs/product/pages/main-conversation.md` | 页面结构 · 团队推进中 / 区域与信息 · 运行中的操作条 / 时间线 / 验收标准 #11 | 操作条增加「完整输出」，这一步结束后仍保留在历史记录上；成员只轮播当前最新的一句 | 已写入（`461fa7a`） |
| `docs/product/pages/main-right-sidebar.md` | 入口与去向 | 规定这两个入口点击后的结果（新建改动标签 / 过程标签）；明确入口本身的位置与文案由会话区定义 | 已写入（`461fa7a`） |

## 背景

`main-conversation-timeline-truth`（C 片）声称覆盖验收 #11，但当时 PRD 的 #11 还不含「完整输出」——那句是 `461fa7a` 加的。里程碑 5 第 85 行又把「出问题时按需展开的原始错误输出」列入不承诺，这句豁免措辞盖住了一条并不属于「待讨论」的正文强制项（PRD 待讨论里只有「卡住的判据」与「重试语义」两条）。两个原因叠加，导致：

1. **完整输出入口不存在**。`run-block.tsx` 与 `run-outcome.tsx` 都接收了 `rawOutput`，然后收成 `_rawOutput` 直接丢弃。时间线里唯一的按钮是操作台故障时的开发者诊断「查看日志」，那是另一件事。
2. **结果卡片零实现**。全仓没有「这段对话期间有几个文件改动」的计数、读接口或渲染。后端只有 worktree 模式且带 `code-verified` 标记时才生成 `affectedFiles`，覆盖不到默认工作空间，也没有 HTTP 路由。

这两条是会话区通往证据的两个出口。缺了它们，PRD「本版不服务离开一段时间后回来快速读懂全部经过」的取舍就失去了配套——时间线只留最新一句，而完整内容无处可去。

## 提案

补齐会话区侧的两个出口，并把「点击后打开什么」收敛成一个明确的移交接口。

1. **对话级改动计数**（后端）：以「这段对话开始时项目所在的提交」为基线，统计这段对话期间项目文件夹里发生改动的文件数。默认工作空间统计项目文件夹，独立工作空间统计隔离副本；非 Git 项目返回不可用。计数随会话快照下发。
2. **结果卡片**（前端）：一轮工作结束且没有成员继续接力时，时间线末尾出现卡片，只给数量与查看入口，不铺开文件清单。零改动如实说明，不省略；非 Git 项目不出现卡片。措辞不声称改动由团队成员造成。
3. **完整输出入口**（前端）：运行中的操作条提供「完整输出」，与「停下」并列；这一步结束后「停下」消失、「完整输出」保留在历史记录上，历史记录随时可以重新展开。四种事实的记录同样提供该入口。
4. **右侧栏移交接口**：两个入口都不自己实现内容，只发出「打开右侧栏的某类标签」的意图（改动标签 / 该步骤的过程标签）。右侧栏的标签条、改动视图与过程视图由 `docs/product/pages/main-right-sidebar.md` 定义，不属本片。

## 关于右侧栏的边界（重要）

`main-right-sidebar.md` 已经存在但**尚无里程碑承接**。会话区 PRD 只规定「卡片何时出现、显示什么、点击后打开什么」，右侧栏 PRD 也明确「该入口的位置和文案由主页面会话区定义，本页只规定点击后的结果」。因此本片的交付在会话区职责内是**完整的，不是打折的**。

点击后的落地按 `main-conversation-subsession-cards`（D 片）的先例处理：右侧栏多标签能力就绪前，意图先接现有的 `sub-session-panel.tsx` 做单标签降级显示。本片 MUST NOT 顺手为右侧栏发明标签条、类型选择或文件树——那会与右侧栏 PRD 抢定义权，制造第二个事实源。

**建议**：为 `main-right-sidebar.md` 单独建立里程碑，把降级显示替换掉。这一步不在本片范围内。

## 影响

受影响模块：

- `src/local-console/workspace-diff.ts`（新增或扩展现有 diff 逻辑）：对话级改动计数，覆盖 direct 与 worktree 两种模式，非 Git 返回不可用。
- `src/sqlite-state-worker.ts`、`src/local-console/store.ts`、`types.ts`：持久化对话开始时的基线提交；计数随快照下发。
- `src/local-console/runtime.ts`：一轮结束（无成员接力）时产出结果卡片所需事实；现有 `affectedFiles` 只在 worktree + `code-verified` 下生成，需扩展覆盖面。
- `src/local-console/server.ts`：计数随会话快照下发；本片不新增改动清单路由（清单属右侧栏）。
- `packages/console-ui/src/console/result-card.tsx`：新增，含共置测试与 Story。
- `packages/console-ui/src/console/run-block.tsx`、`run-outcome.tsx`：恢复 `rawOutput` 的出口，改为发出打开过程标签的意图。
- `packages/console-ui/src/console/operator-console.tsx`：结果卡片接线；区分「操作台故障→开发者诊断」与「某一步的完整输出」两个不同入口，不复用同一个回调。
- `packages/console-ui/src/index.ts`：导出结果卡片与打开意图类型。
- `desktop/src/console-page/app.tsx`、`state-sync.ts`：接通计数读取与打开意图；右侧栏就绪前接现有面板降级显示。
- `tests/local-console-workspace-diff.test.ts`（新增）、`tests/local-console.test.ts`、`desktop/tests/console-state-sync.test.ts` 及组件共置测试。

对外行为：

- 一轮工作结束后时间线末尾出现结果卡片，说明有几个文件发生改动并提供查看入口；零改动如实说明；非 Git 项目不出现。
- 运行中的操作条多一个「完整输出」；步骤结束后它保留在历史记录上。

保持不变的核心语义：时间线仍不堆积全量输出，成员仍只轮播当前最新的一句；C 片交付的四种事实、机器信息收口与状态点判据不动。

## 验收语句

对应 `docs/product/pages/main-conversation.md`「验收标准」#11 #22：

1. 正在工作的成员记录末尾同时提供「停下」和「完整输出」且不显示计时；这一步结束后「停下」消失，「完整输出」保留在历史记录上并可重新展开。
2. 一轮工作结束后时间线末尾出现结果卡片，说明有几个文件发生改动并能一步打开右侧栏的改动标签；没有文件改动时如实说明；措辞不声称改动由团队成员造成；非 Git 项目不出现结果卡片。
