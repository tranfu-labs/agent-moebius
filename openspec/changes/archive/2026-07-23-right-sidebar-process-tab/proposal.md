# 提案：right-sidebar-process-tab

## 需求基线

产品事实源锚点：`docs/product/pages/main-right-sidebar.md`。本 change 交付右侧栏的**过程标签**——单个成员单个步骤的完整原始输出。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-right-sidebar.md` | 区域与信息 · 过程标签 | 完整输出含原始错误、追加不摘要、多次重试分段、只读可复制、路径可复制 | 已写入 |
| `docs/product/pages/main-right-sidebar.md` | 区域与信息 · 标签条 | 过程标签标题就是成员名、同成员追加序号、不得自编描述 | 已写入 |
| `docs/product/pages/main-right-sidebar.md` | 已知隐患 · 过程标签的「完整输出」可能不完整 | 输出超上限允许截断，但必须让用户看出被截断 | 已写入 |

## 背景

`main-conversation-evidence-outlets`（已落 main）提供了过程标签的**入口与数据源**：`OperatorEvidenceOpenIntent{kind:"run-output", sessionId, runId, role, fallbackOutput}`（由主对话区「完整输出」按钮触发），以及 `GET /api/local-console/sessions/:sessionId/runs/:runId/output` → `runtime.runOutput()`，返回 `{sessionId, runId, role, stdout, stderr, fallback}`。

但 `runOutput` 有三个约束直接卡住 PRD 的要求：① 它读的 `runDir` 在 `/tmp`（`TMP_ROOT`），跨重启不保真——runDir 被清后 `stdout/stderr` 为 null，只剩 `fallback`；② 它按**单个 runId** 取，而 PRD 要求「同一步骤被重试时每次执行在同一标签内依次追加并标明第几次」——需要按 (成员, 步骤) 聚合多个 run；③ 现状无「截断可见」呈现。右侧栏骨架已给过程内容标签留了占位槽，本片把它填上。

## 提案

在 evidence-outlets 的 `runOutput` 入口之上，建过程标签：完整原始输出的呈现 + 多次重试分段 + 标题取成员名 + 截断可见 + 可复制。

1. **完整输出呈现**：消费 `runOutput` 的 `stdout`/`stderr`（完整文件内容，非摘要），含原始错误输出。按时间顺序**追加，不做摘要、不做折叠、不做美化改写**（不走会话区 run-block 的 markdown 美化通道）。正在工作的步骤实时追加；结束后内容定格、标签继续可看。
2. **多次重试分段**：同一步骤被重试时，每次执行在同一标签内**依次追加并标明第几次**，不覆盖上一次。需要按 (成员, 步骤) 聚合多个 run 的输出（`runOutput` 单 runId → 本片做聚合）。
3. **标题 = 成员名**：过程标签标题取自意图里的 `role`（映射成成员名，走既有 role→名映射族），**不得从步骤 summary / 实时 Markdown 派生描述性标题**；同一成员在这段对话里的第二个及以后追加序号（开发 / 开发 2 / 开发 3）。
4. **截断可见**：输出超出留存上限时允许截断，但**必须让用户看出这里被截断了**（把底层的截断信号转成用户可见标记），不静默丢弃后让用户以为看到了全部。
5. **只读可复制**：过程标签只读，但内容必须可选中复制，**文件路径同样可以复制**——过程标签的原始输出通道**绕开** `sanitizeMachineText`（它会把路径抹成「已隐藏」），保留原文。runDir 已被清（`stdout/stderr` 为 null）时降级用 `fallback`，并说明这一步没有可用的原始输出 / 输出为空的不同措辞。

## 影响

受影响模块：

- `src/local-console/runtime.ts`：`runOutput` 扩展为「按步骤聚合同一成员的多次执行」，或新增聚合入口；处理 runDir 缺失降级。**改其语义需回扫调用点**（evidence-outlets 的单视图降级也调它）。
- `src/local-console/output-tail.ts` / 留存侧：把「截断」从机器串诊断转成可下发的可见信号；若要跨重启保真需评估把 runDir 迁出 `/tmp` 或另存（属已知隐患，本片至少保证「读不到就明说、不假装完整」）。
- `src/local-console/server.ts`、`types.ts`：过程输出（多次执行分段 + 截断标记）的下发类型与路由。
- `packages/console-ui/src/console/process-tab.tsx`（新增）：过程标签渲染，替换 `right-sidebar-shell` 的过程占位槽——纯追加、不美化、多次执行分段、截断可见、可选中、标题取成员名 + 序号。
- `packages/console-ui/src/console/operator-console.tsx`（成员名映射）：过程标签标题复用既有 role→名映射，不新造描述。
- `packages/console-ui/src/index.ts`、`desktop/src/console-page/app.tsx`、`state-sync.ts`：接通过程输出读取与实时追加。
- 相关共置测试 + `tests/local-console-*.test.ts`（完整输出 / 多次重试分段 / runDir 缺失降级 / 截断可见 / 空输出）。

对外行为：从主对话区「完整输出」入口打开过程标签，看到该步骤含原始错误的完整输出；同一步骤重试后多次执行依次可见并标第几次；标题是成员名（第二个起带序号）；输出被截断时能看出来；内容与路径可选中复制。

**明确不做**：不碰改动 / 项目文件 / 子任务标签、右侧栏容器骨架。不改「完整输出」入口本身（evidence-outlets 已有，位置与文案由主对话区定义）。不做摘要 / 折叠 / 美化。
