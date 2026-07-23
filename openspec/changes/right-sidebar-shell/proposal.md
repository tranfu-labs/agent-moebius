# 提案：right-sidebar-shell

## 需求基线

产品事实源锚点：`docs/product/pages/main-right-sidebar.md`。本 change 承载右侧栏的**容器与标签条骨架**——三类内容标签（改动 / 过程 / 子任务）由后续 change 填入，本片只负责把它们挂上来的框架。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-right-sidebar.md` | 入口与去向 / 页面结构 · 空白标签·标签全部关闭·标签溢出·窄窗口 | 右侧栏默认关闭、开关与标签条持久化、加号空白标签、类型选择写死两种、窄窗覆盖 | 已写入 |
| `docs/product/pages/main-right-sidebar.md` | 区域与信息 · 标签条 / 空白标签与类型选择 | 去重规则、关最后一个标签留空白、类型枚举边界 | 已写入 |
| `docs/product/pages/main-right-sidebar.md` | 操作与反馈 · 打开与关闭右侧栏 / 内容更新 | 开合不影响会话区、有新内容不切换当前标签 | 已写入 |

## 背景

`main-conversation-evidence-outlets`（已落 main）已经给出了右侧栏的**入口契约**：`OperatorEvidenceOpenIntent`（`{kind:"workspace-diff"...}` / `{kind:"run-output"...}`）经 `onOpenEvidence` 触发，当前被临时接到 `sub-session-panel.tsx` 做**单视图降级显示**（`OperatorEvidenceView`）。它明确写死「标签条、类型选择、文件树属右侧栏 PRD 的范围，本片不长出来」。

因此现状是：入口有了、意图有了，但真正承载它们的**多标签右侧栏容器不存在**。开关状态、拖拽宽度、标签条都没有落点（连左栏宽度 `sidebarWidth` 都只是内存 `useState`，未持久化）。三类内容标签也无处可挂。

## 提案

建立右侧栏的容器与标签条骨架，替换掉 evidence-outlets 的单视图降级，成为后续三类内容标签的宿主。

1. **右侧栏容器**：`OperatorConsole` 的 `<main>` 同级新增右侧栏区，接管 `onOpenEvidence`，把意图转成「打开 / 聚焦一个标签」。三栏并排、可拖拽调宽；窄窗覆盖会话区并给独立关闭按钮 + 回到会话区的出口。
2. **开关与偏好持久化**：右侧栏开关（默认关闭）、拖拽宽度、每对话的标签条状态，全部跨对话切换 + 跨应用重启保留，沿用 `draft-store.ts` 的 `xxx:${sessionId}` localStorage 范式（开关 / 宽度为全局键，标签条为按对话键）。显示 / 隐藏按钮在主内容区右上角，任何时候可用。
3. **标签条与标签模型**：定义统一的**标签类型枚举**（改动 / 项目文件 / 过程 / 子任务 / 空白），全部可关闭、无常驻标签。主对话区点击来源的标签**去重**（聚焦已有），加号产生的空白标签**不去重**。关掉最后一个标签不收起右侧栏，留一个空白标签。标签条横向滚动、加号始终可达；有新内容不自动切换用户当前所在标签。
4. **空白标签与类型选择**：加号新开空白标签，内容是一句提问 + **写死的两种类型**（改动 / 项目文件）；项目文件夹不是 git 仓库时类型选择只剩「项目文件」并说明原因（读 evidence-outlets 已有的 is-git 信号）。空白标签明说「成员完整输出与子任务从主对话区点开」，且**终端 / 预览 / 浏览器不得从类型选择长出来**。
5. **内容标签的挂载缝**：容器按标签类型分派到内容渲染组件；改动 / 项目文件 / 过程 / 子任务四类内容组件是**占位空槽**，由后续三个 change 各自填入。本片只保证「意图→标签→分派」这条链，以及非内容标签（空白）的完整行为。

## 影响

受影响模块：

- `packages/console-ui/src/console/right-sidebar.tsx`（新增）：右侧栏容器、标签条、空白标签、类型选择、窄窗覆盖，含共置测试与 Story。
- `packages/console-ui/src/console/operator-console.tsx`：`<main>` 同级挂右侧栏；`onOpenEvidence` 从「接 sub-session-panel 单视图」改为「打开 / 聚焦标签」；新增右侧栏开关 / 宽度 props（对照现有左栏 `sidebarOpen` / `sidebarWidth`）；建立内容标签的分派缝（四类占位组件的插槽）。
- `packages/console-ui/src/console/right-sidebar-tabs.ts`（新增或内嵌）：标签类型枚举、标签模型、去重键、持久化序列化白名单。
- `packages/console-ui/src/index.ts`：导出右侧栏容器与标签类型。
- `desktop/src/console-page/right-sidebar-preference.ts`（新增）：开关 + 宽度 localStorage（对照 `sidebar-preference.ts`）。
- `desktop/src/console-page/right-sidebar-tabs-store.ts`（新增）：每对话标签条 localStorage（对照 `draft-store.ts` 的 `draft:${sessionId}`）。
- `desktop/src/console-page/app.tsx`、`state-sync.ts`：接通右侧栏开关 / 宽度 / 标签条读写；把 is-git 信号透传进类型选择。
- 相关共置测试 + `desktop/tests/` 里的接线测试。

对外行为：右侧栏默认关闭、界面两栏；用户可从右上角按钮或主对话区入口打开；标签条随对话切换、跨重启恢复；空白标签只给两种类型且非 git 时裁剪并说明。

**明确不做**（留给后续 change）：改动 / 项目文件的文件树与行级对比、过程标签的原始输出、子任务标签的对话推进。本片对这四类只提供空槽与分派，不实现内容。
