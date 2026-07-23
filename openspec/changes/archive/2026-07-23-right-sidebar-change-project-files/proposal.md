# 提案：right-sidebar-change-project-files

## 需求基线

产品事实源锚点：`docs/product/pages/main-right-sidebar.md`。本 change 交付右侧栏的**改动标签**与**项目文件标签**，以及它们共用的读取后端。两者共用同一套文件内容呈现（PRD 明说），故合为一片。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-right-sidebar.md` | 区域与信息 · 改动标签 | 累计改动、说明看哪一边、不归因、只列改动文件 + 增删行数、行级对比 | 已写入 |
| `docs/product/pages/main-right-sidebar.md` | 区域与信息 · 项目文件标签 | 完整文件树 + 内容、改动文件同样标出变化 | 已写入 |
| `docs/product/pages/main-right-sidebar.md` | 操作与反馈 · 选择文件 / 内容更新 | 选文件不新建标签、刷新不丢阅读位、截至上一轮 + 手动刷新 | 已写入 |
| `docs/product/pages/main-right-sidebar.md` | 页面结构 · 改动为空 | 三种空态措辞互不相同 | 已写入 |

## 背景

`main-conversation-evidence-outlets`（已落 main）提供了改动标签的**数据底座**：每会话 `baselineCommit`（对话开始基线，覆盖项目文件夹 / 独立工作空间两种模式）、`workspace-diff.ts` 的 diff 生成、`LocalConsoleWorkspaceDiffSummary`（**只有 fileCount 计数，没有文件清单**）、以及 `OperatorEvidenceOpenIntent{kind:"workspace-diff", sessionId, fileCount}` 入口。它明确写死「改动清单属右侧栏」，因此清单、行级对比、文件树、每文件增删行数、文件内容读取**全部尚不存在**，是本片的活。

右侧栏骨架由 `right-sidebar-shell` 提供改动 / 项目文件两类内容标签的空占位槽；本片把这两个槽填上。

## 提案

在 evidence-outlets 的基线 + diff 生成之上，补齐「改动清单 + 行级对比 + 文件树 + 文件内容」的读取通道与 UI。

1. **改动清单读取后端**：以 `baselineCommit` 为起点，产出**有改动的文件清单 + 每文件增删行数**（现有 diff 只有 `--name-only`，需补 `--numstat`）与**行级 hunk**（解析 `git diff` 的 patch，逐行标新增 / 删除 / 未改动）。覆盖项目文件夹与独立工作空间两种模式，口径一致；非 git 项目返回不可用。新增 HTTP 只读路由把清单 / 行级内容下发给 renderer。
2. **项目文件读取后端**：列**完整项目文件树** + 读**任意文件内容**的只读通道（当前完全不存在）。有改动的文件同样带行级变化标记（与改动标签共用一套呈现）。文件过大 / 非文本时说明原因，不静默留白。
3. **改动标签 UI**：文件树在上、选中文件行级对比在下。顶部一句话说明「这段对话期间项目发生了这些改动」；**说明看的是项目文件夹还是独立工作空间**（选独立工作空间多说一句「改动在隔离副本里、你的项目文件夹没被动过」）；**不做改动归因**（主语只能是项目 / 这段对话，不出现「成员 / 团队改了」）；只列改动文件；三种空态（对话还没开始 / 跑过没改动 / 读取中）措辞互不相同；团队正在工作时说明「列表截至上一轮结束」并给手动刷新；改动不实时跟随。
4. **项目文件标签 UI**：完整文件树 + 文件内容，含未改动文件；有改动的文件同样以行为单位标出变化；同样说明看的是哪一边。
5. **阅读态保持**：选文件不新建标签、当前选中文件在树中保持可见；刷新时不跳走 / 不丢阅读位置，有新改动给可点击提示由用户决定何时看。长行横向滚动、行号列滚动时保持可见；文件树 / 文件内容各自独立滚动。**全片只读**——不提供任何编辑 / 保存 / 撤销 / 还原 / git 动作，内容可选中复制。

## 影响

受影响模块：

- `src/local-console/workspace-diff.ts`：扩展产出「文件清单 + 每文件增删行数（`--numstat`）+ 行级 hunk」；保持覆盖两种工作空间模式、非 git 返回不可用的既有口径。**这是 evidence-outlets 已有文件，本片改其语义需回扫调用点**。
- `src/local-console/file-read.ts`（新增或并入 workspace-diff）：列项目文件树 + 读任意文件内容，含大小 / 二进制判定。
- `src/local-console/server.ts`：新增只读路由——改动清单 / 行级内容、项目文件树、文件内容（对照 evidence-outlets 已加的 `/runs/:runId/output` 路由范式）。
- `src/local-console/runtime.ts`、`store.ts`、`types.ts`：改动清单 / 文件内容的读取入口与类型。
- `packages/console-ui/src/console/change-tab.tsx`（新增）：改动标签（文件树 + 行级对比 + 空态 + 刷新 + 工作空间措辞），替换 `right-sidebar-shell` 的改动占位槽。
- `packages/console-ui/src/console/project-files-tab.tsx`（新增）：项目文件标签，替换项目文件占位槽；与 `change-tab` 共用文件内容呈现组件（`file-diff-view.tsx`）。
- `packages/console-ui/src/console/file-diff-view.tsx`（新增）：行级新增 / 删除 / 未改动呈现 + 长行横滚 + sticky 行号，改动 / 项目文件共用。
- `packages/console-ui/src/index.ts`、`desktop/src/console-page/app.tsx`、`state-sync.ts`：接通读取与刷新；工作空间措辞用人话映射（项目文件夹 / 独立工作空间），不露路径、不沿用「默认工作空间」旧词。
- 相关共置测试 + `tests/local-console-*.test.ts`（清单 / 行级 / 文件树 / 大文件 / 非文本 / 非 git / 两种模式口径）。

对外行为：从主对话区结果卡片 [查看] 或加号选「改动」打开改动标签，看到改动文件树 + 行级对比；加号选「项目文件」浏览完整项目树 + 任意文件内容。团队工作时改动标签说明截至上一轮并给刷新。全部只读、可复制。

**明确不做**：本片不碰过程标签、子任务标签、右侧栏容器 / 标签条骨架（属其他 change）。不改基线采集（evidence-outlets 已有）。不提供任何还原 / git 动作。
