# 提案：desktop-console-ui

## 背景

[conversation-console](../conversation-console/wireframes.md) 已经把「本地对话操作台」的信息架构、交互规则、视觉风格（[ui-design.md](../conversation-console/ui-design.md)）设计完毕，但**只到设计层、没有任何可运行的界面实现**。并行地，我们在 `component-library/` 做了一版**纯 Tailwind HTML 组件库**（22 个组件），把这些线框「画活」并校验视觉；它是静态原型（HTML 片段 + Tailwind Play CDN），**不是可复用的 React 组件、也进不了桌面 app**。

实机验证中还确定了一个**设计基线修订**：原 ui-design.md 把「琥珀」立为「等你」的唯一信号色（注意力层），实测下来页面**偏花、不够 Linear**。已确认新方向——**近单色**：删掉整个「注意力层（琥珀）」，「等你」降级为**普通中性状态**（靠置顶排序 + 顶栏计数 + 等你清单浮层这些**结构手段**承载注意力，不靠色相）；危险色改用 Linear 的红。

现状的两个缺口：
1. 组件库是 HTML 原型，无法被 [desktop](../../../desktop/) Electron 桌面壳复用——壳的 renderer 目前只有一个 vanilla `status-page/`，没有 React、没有前端打包器。
2. ui-design.md 的色彩系统仍写着「琥珀 = 唯一信号色」，与已确认的近单色方向不一致，是失真的设计事实源。

## 提案

把组件库升级为**基于 shadcn/ui 的 React 组件库**，用 **Storybook** 作为开发期展示台，交付一个可在浏览器查看的 React 示例；组件库架构为**可被 Electron renderer 直接消费**的 workspace 包，为后续「桌面对话操作台真实实现」铺好底座。同时把设计基线从「琥珀信号色」修订为「近单色」，让 ui-design.md 重新反映现状。

选型结论（详见 [design.md](design.md)）：**shadcn/ui**（Tailwind + Radix 原语，组件源码进仓库可改）。理由是它几乎 100% 复用我们已建的近单色 Tailwind 令牌与 22 组件标记，是做 Linear 近单色最短路径；对比过的 Astryx（Meta，基于 StyleX）会推翻 Tailwind 基线且仍在 beta，Mantine/MUI 偏产品感、压近单色成本高。

本次 change 的**交付边界**：
- **交付**：shadcn/ui React 组件库（含共享令牌层）+ Storybook 展示台 + 近单色设计文档修订。
- **不交付**：Electron renderer 里那个「真实对话操作台 app」（状态管理、IPC、与 runner / 状态文件的数据对接）——它是另一个大 change，本次只保证组件库**可被 renderer import** 的架构与目录约定，不搭真实数据流。
- **待定**：22 个组件做成 React 的**粒度**（原子=shadcn 原语 + 复合=组合件 / 全部可复用 / 只做展示）——用户明确「等一会决定」，在 design.md 里列为**开放决策**，实现前敲定。

## 影响

- **零运行时行为变化**：本次是新增前端工程 + 文档修订，不动 `src/` runner、不动现有 desktop 主进程逻辑。
- **新增 workspace 包**：pnpm 工作区新增一个包（如 `packages/console-ui`），`pnpm-workspace.yaml` 增列；引入 React / Tailwind / shadcn / Storybook 一套前端依赖（仅该包内）。
- **设计事实源修订**：`conversation-console/ui-design.md` 的色彩系统（注意力层、指示值、组件落点、走查清单）按近单色改写；`wireframes.md` 里「配琥珀」类注释同步。因 conversation-console 仍是未归档的进行中 change，这些修订**直接落在它的设计文档里**（作为本 change 的一项任务），不另立 change。
- **旧 HTML 组件库去留**：`component-library/`（Tailwind HTML 版）保留为轻量原型 / 视觉参照，还是被 React 版取代——在 design.md 列为开放决策，默认保留、双方共享同一份令牌值。
- 归档推迟到实现完成；本 change 落盘后停留在 `openspec/changes/`。
