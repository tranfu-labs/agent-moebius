# 设计：right-sidebar-change-project-files

## 本 change 负责的验收落点

| 验收 | 落点 | 现状 |
| --- | --- | --- |
| #3 结果卡片一步打开改动标签 | `change-tab.tsx` 接 `OperatorEvidenceOpenIntent{kind:"workspace-diff"}`（结果卡片入口 evidence-outlets 已有） | 入口已有，改动标签内容新建 |
| #4 累计改动基于对话开始基线、非最后一步 | 消费 evidence-outlets 的 `baselineCommit`；`workspace-diff.ts` 以基线为起点 | 基线已有，清单 / 行级读取新建 |
| #5 说明文案不声称改动来自成员（不归因） | `change-tab.tsx` 全部说明文案，主语只能是项目 / 这段对话 | 落点不存在，需新建 |
| #6 说明看的是项目文件夹还是独立工作空间 | `change-tab.tsx` 头部措辞，人话映射（不沿用 `composer-context.tsx` 的「默认工作空间」旧词） | 措辞源已有，右栏专用映射新建 |
| #8 行级区分新增 / 删除 / 未改动 | `file-diff-view.tsx` 解析 `workspace-diff.ts` 的 patch → 行级 hunk | 落点不存在，需新建 |
| #9 只列改动文件；浏览未改动走项目文件类型 | `change-tab.tsx` 文件树只渲染 diff 的 affectedFiles | 落点不存在，需新建 |
| #10 团队工作时说明「截至上一轮」+ 手动刷新 | `change-tab.tsx` 团队工作态 + 刷新按钮；diff 本就一轮结束才生成，恰好匹配 | 落点不存在，需新建 |
| #11 三种空态措辞互不相同 | `change-tab.tsx` 空态分支（对话没开始 / 跑过没改动 / 读取中） | 落点不存在，需新建 |
| #20 阅读文件时刷新不丢位置 | `change-tab.tsx` / `file-diff-view.tsx` 保持文件滚动位 + 新内容 pending 提示 | 落点不存在，需新建 |
| #22 文件内容可选中复制 | `file-diff-view.tsx` 可选中容器（过程输出 / 路径复制在 ④） | 落点不存在，需新建 |

## 本 change 承接的规则句

- **R17「基线是对话开始时的项目状态、全程累计、非最后一步」**：消费 evidence-outlets 的 `baselineCommit`（覆盖两种模式）。**不得**接到「最后一步的 diff」或某个名字相近的现有状态上。
- **R18「必须说明看哪一边；选独立工作空间多说一句后果」**：措辞用「项目文件夹」/「独立工作空间」，**不沿用**现成 `workspaceModeLabel` 的「默认工作空间」旧词；且要绕开 `sanitizeMachineText`（它会把 `direct`/`worktree` 与路径抹成「已隐藏」），走人话映射而非把原始 mode 塞进被 sanitize 的文本。
- **R20「不做改动归因」**：所有说明文案主语只能是项目 / 这段对话；`accept-card.tsx` 那类含成员主语的「改了什么」措辞不得渗入。
- **R21「只列有改动的文件 + 增删行数」**：现有 diff 只有 `--name-only`，**须补 `--numstat`**（增删行数当前无数据）。
- **R22「行级区分」**、**R23「项目文件全树 + 内容、有改动同样标出」**、**R35/R36「选文件保持可见、不新建标签」**、**R37「文件过大 / 非文本说明原因」**、**R39/R40/R41「改动一轮刷新 + 截至上一轮 + 不实时跟随 + 阅读位保持」**、**R47「无还原控件文案」**、**R49「长行横滚 + 行号可见」**、**R50「独立滚动」**、**R52「不跨对话汇总，diff 按 sessionId 为界」**：全部落在 `change-tab.tsx` / `project-files-tab.tsx` / `file-diff-view.tsx` 与读取后端。
- **R13/R19（改动标签可开性守卫）**：非 git 项目不提供改动标签——本片的结果卡片 [查看] / 加号选改动都要被同一 is-git 守卫拦下（类型选择裁剪在 `right-sidebar-shell`，本片补开-guard）。
- **R45/R1（只读白名单）**：改动 / 项目文件标签只允许选文件、复制、关标签、加号、刷新；不得出现编辑 / 保存 / 撤销 / 还原 / git 动作控件。

## 方案

关键决策：

1. **改动数据分两截**：evidence-outlets 已有的 `baselineCommit` + diff 生成负责「基线与跑 diff」；本片在其上加「清单（含 numstat）+ 行级 hunk 解析 + 只读下发路由」。改 `workspace-diff.ts` 的产出语义时**必须回扫调用点**（evidence-outlets 的计数依赖它）——不破坏 fileCount 的既有用途，只增产出。
2. **改动标签与项目文件标签共用 `file-diff-view.tsx`**：文件内容呈现（行级新增 / 删除 / 未改动、长行横滚、sticky 行号、可选中）是同一套组件，改动标签喂它「只有改动文件」，项目文件标签喂它「全树任意文件」。这是两标签合为一片的根本原因——拆开会共写这个组件。
3. **文件树读取两个来源**：改动标签的树 = diff 的 affectedFiles；项目文件标签的树 = 完整目录遍历（新通道）。有改动的文件在项目文件标签里同样带行级标记（查 diff）。
4. **刷新语义**：改动标签不订阅 activeRun 实时流（R40）；团队工作时显示「截至上一轮结束」+ 手动刷新按钮；刷新到来不重挂当前文件滚动位，另给「有新改动」可点提示（R41）。这与 diff「一轮结束才生成」的既有节奏天然对齐。
5. **工作空间措辞走人话映射、绕开 machine-text**：新建右栏专用的「项目文件夹 / 独立工作空间」映射，独立工作空间追加「改动在隔离副本里、你的项目文件夹没被动过」。不把原始 `mode` 字符串塞进会被 `sanitizeMachineText` 处理的文本。

## PRD 失语项与本片默认取值

- **改动规模很大时的表现**（PRD「待讨论」明确不做）：本片按原样照列，不做排序 / 折叠 / 过滤。锁文件、构建产物占满列表是已知后果，本版接受。
- **只看这一轮 vs 全程累计**（PRD「待讨论」明确不做）：只给全程累计，不加「本轮 / 全程」切换。

## 权衡

- **numstat + patch 两次 git 调用 vs 一次**：清单增删行数用 `--numstat`，行级 hunk 用 patch，可能两次 diff。可接受（改动标签不实时、一轮一次）。
- **文件树全量遍历的成本**：项目文件标签遍历完整项目树，大仓库可能慢。本版不做懒加载优化（属「改动规模」失语项范畴），按需再议。

## 风险

- **`workspace-diff.ts` 是 evidence-outlets 的既有文件**：改它的产出语义有回归 evidence-outlets 计数的风险。缓解：只增不改 fileCount 逻辑，callsite_sweep 覆盖所有调用点。
- **`server.ts` 与 ④ 的共享写点**：本片和 `right-sidebar-process-tab` 都往 `server.ts` 加只读路由。缓解：路由是追加式，rebase-before-archive 处理冲突；两片加的是不同路径。
- **`operator-console.tsx` 内容分派缝**：本片替换 shell 的两个占位槽（改动 / 项目文件），只改自己那两个内容组件，不动容器结构（依赖 shell 已定死分派缝）。
