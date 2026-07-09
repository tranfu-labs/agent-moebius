# 提案：desktop-console-ui

## 背景

[conversation-console](../conversation-console/wireframes.md) 已经把「本地对话操作台」的信息架构、交互规则、视觉风格（[ui-design.md](../conversation-console/ui-design.md)）设计完毕，但**只到设计层、没有任何可运行的界面实现**。此前曾用纯 Tailwind HTML 片段探索过 22 个界面片段，验证了近单色方向；这些片段不是可复用 React 组件、也进不了桌面 app，因此不作为本 change 的交付物保留。

实机验证中还确定了一个**设计基线修订**：原 ui-design.md 把「琥珀」立为「等你」的唯一信号色（注意力层），实测下来页面**偏花、不够 Linear**。已确认新方向——**近单色**：删掉整个「注意力层（琥珀）」，「等你」降级为**普通中性状态**（靠置顶排序 + 顶栏计数 + 等你清单浮层这些**结构手段**承载注意力，不靠色相）；危险色改用 Linear 的红。

现状的两个缺口：
1. 尚无可被 [desktop](../../../desktop/) Electron 桌面壳复用的 React 组件库——壳的 renderer 目前只有一个 vanilla `status-page/`，没有 React、没有前端打包器。
2. ui-design.md 的色彩系统仍写着「琥珀 = 唯一信号色」，与已确认的近单色方向不一致，是失真的设计事实源。

## 提案

把组件库升级为**基于 shadcn/ui 的 React 组件库**，用 **Storybook** 作为开发期展示台，交付一个可在浏览器查看的 React 示例；组件库架构为**可被 Electron renderer 直接消费**的 workspace 包，为后续「桌面对话操作台真实实现」铺好底座。同时把设计基线从「琥珀信号色」修订为「近单色」，让 ui-design.md 重新反映现状。

选型结论（详见 [design.md](design.md)）：**shadcn/ui**（Tailwind + Radix 原语，组件源码进仓库可改）。理由是它可以复用已确认的近单色 Tailwind 令牌，是做 Linear 近单色最短路径；对比过的 Astryx（Meta，基于 StyleX）会推翻 Tailwind 基线且仍在 beta，Mantine/MUI 偏产品感、压近单色成本高。

本次 change 的**交付边界**：
- **交付**：shadcn/ui React 组件库（含共享令牌层）+ Storybook 展示台 + 近单色设计文档修订。
- **不交付**：Electron renderer 里那个「真实对话操作台 app」（状态管理、IPC、与 runner / 状态文件的数据对接）——它是另一个大 change，本次只保证组件库**可被 renderer import** 的架构与目录约定，不搭真实数据流。
- **不宣称交付 22 个 React 组件**：本次只交付 React 组件库底座、7 个 shadcn 风格基础原语和 1 个项目复合样板（验收卡）。22 个对话操作台界面片段如何拆成 React 复合组件，另起后续 change 决策并实现。

## 影响

- **零运行时行为变化**：本次是新增前端工程 + 文档修订，不动 `src/` runner、不动现有 desktop 主进程逻辑。
- **新增 workspace 包**：pnpm 工作区新增一个包（如 `packages/console-ui`），`pnpm-workspace.yaml` 增列；引入 React / Tailwind / shadcn / Storybook 一套前端依赖（仅该包内）。
- **设计事实源修订**：`conversation-console/ui-design.md` 的色彩系统（注意力层、指示值、组件落点、走查清单）按近单色改写；`wireframes.md` 里「配琥珀」类注释同步。因 conversation-console 仍是未归档的进行中 change，这些修订**直接落在它的设计文档里**（作为本 change 的一项任务），不另立 change。
- **静态 HTML 原型去除**：不保留 `component-library/`，避免把历史探索误读为可复用组件库或把 22 个 HTML 片段误读为已完成的 22 个 React 组件。
