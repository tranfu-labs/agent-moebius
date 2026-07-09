# 设计：desktop-console-ui

> 本文件不含字符图。版式线框见 [conversation-console/wireframes.md](../conversation-console/wireframes.md)，视觉风格见其 [ui-design.md](../conversation-console/ui-design.md)（本 change 会按近单色修订它）。

## 方案

### 1. 框架选型：shadcn/ui

对比四条路线，代入约束「复用近单色 Tailwind 令牌 + 22 组件标记 / 进 Electron renderer / Storybook 展示 / Linear 近单色」：

| 方案 | 底层样式 | 复用现有 Tailwind 令牌 | 成熟度 | 结论 |
|---|---|---|---|---|
| **shadcn/ui** | Tailwind + Radix 原语 | ≈100% | 事实标准，组件源码入库可改 | **选它** |
| Astryx（Meta） | StyleX（非 Tailwind） | 几乎不复用 | beta v0.1.x，API 会变 | 弃：推翻 Tailwind 基线 + StyleX 构建链与 esbuild 壳摩擦 + beta 风险 |
| Mantine / MUI | 各自 CSS-in-JS | 不复用 | 成熟 | 弃：偏产品感，压近单色成本高、体积大 |
| 无框架 · Radix + 我们的 Tailwind | Tailwind | 100% | 自维护 | 次选：等于 shadcn 去掉脚手架，无社区范例红利 |

shadcn 不是「装一个 npm 包」，而是**把组件源码 `add` 进项目**（`components/ui/*`），配 `components.json` + Tailwind 预设。它天然吃 CSS 变量主题（`--background/--foreground/--primary/--border/--muted/--destructive/--ring`），与我们 `tokens.css` 的近单色变量**一一映射**即可，Radix 只补 Popover / DropdownMenu / Dialog 这类无障碍原语。

### 2. 工程形态：pnpm workspace 新增前端包

```
packages/console-ui/            # 新增，React 组件库
  package.json                  # react / tailwindcss / radix / shadcn / storybook
  components.json               # shadcn 配置
  src/
    styles/tokens.css           # 近单色令牌（CSS 变量，浅/深）——单一事实源
    styles/globals.css          # tailwind base + 把 tokens 映射到 shadcn 变量名
    ui/                         # shadcn 原语（button/badge/avatar/input/card/popover…）
    console/                    # 本项目专属复合组件（粒度待定，见 §开放决策）
  .storybook/                   # Storybook 配置
  stories/                      # 每个组件一组 story（?only= 的 React 对应物）
```

- `pnpm-workspace.yaml` 增列 `packages/*`（当前只有 `.` 与 `desktop`）。
- **令牌单一事实源**：`tokens.css` 的变量值直接沿用 `component-library/tokens.css` 现有近单色取值（灰阶 + indigo + 绿/红，无琥珀、无 `-soft` 填充）。旧 HTML 库若保留，改为引用同一份值，避免两处漂移。

### 3. 展示：Storybook

- 每个组件一个 `*.stories.tsx`，用 args/controls 暴露状态（如运行块的三态、验收卡的逐条裁决），取代 HTML 版的 `?only=` 手动过滤。
- 全局 decorator 提供浅/深主题切换（切 `:root` class，令牌变量翻转），与 HTML 版一致。
- `pnpm --filter @agent-moebius/console-ui storybook` 起本地站——即用户要的「可在浏览器查看的 React 示例」。

### 4. Electron renderer 消费路径（本次只铺路，不搭真实 app）

- desktop renderer 现为 vanilla `status-page/`（esbuild 只打包主进程，静态文件 copy）。真实对话操作台是一个 React 应用，需要给 renderer 加一套前端打包（**Vite** 最顺，或沿用 esbuild 打 renderer bundle）。
- 约定：`@agent-moebius/console-ui` 作为 workspace 依赖被 renderer import；令牌 `globals.css` 在 renderer 入口引入。
- **本 change 边界**：只保证「组件库是一个可被 import 的包 + 令牌可被 renderer 复用」，**不**建 renderer React app、不接 IPC / runner 数据——那是后续 `desktop-console-app` change。

### 5. 近单色设计基线修订（诉求①，作为本 change 一项任务落到 conversation-console 文档）

把 [ui-design.md](../conversation-console/ui-design.md) 的色彩系统从「四层含琥珀注意力层」改为「近单色」：

| 位置 | 原（琥珀信号色） | 改（近单色） |
|---|---|---|
| §二 铁律 1 | 琥珀出现=有事等你 | 删琥珀；健康态近单色=灰阶+少量 indigo；红=危险/失败 |
| §三 色彩层次 | 四层：中性/强调/**注意力(琥珀)**/事实 | 三层：中性/强调(indigo)/事实(绿=通过·红=危险)；**注意力层删除**，「等你」不占色相 |
| §三 指示值 | 含琥珀文字/底；事实红 `#A32D2D` | 删琥珀；事实红换 Linear 红 `#E5484D`；裁决只用彩色文字、无 `-soft` 填充 |
| §六 组件落点 | 侧栏/顶栏/验收卡/浮层/账本「配琥珀」 | 全退中性：等你=中性 hand 图标+普通文字；验收卡=普通中性卡（无琥珀底/饰条），提交按钮=indigo 实心 |
| §七 对照表 | 等你…（配琥珀呈现） | 等你…（普通中性呈现，靠排序+计数承载） |
| §九 走查清单 | 第 1/4/7 条以琥珀为判据 | 改为「近单色、等你无专属色相、注意力靠结构」判据 |

- 「颜色出现即信号」哲学**保留但收窄**：信号色只剩「红=危险/失败」一支；「等你」从「颜色信号」改为「结构信号」（永远置顶排序 + 顶栏可点计数 + 等你清单浮层）。这与 design.md「少介入 / 注意力义务单调递减」不冲突——义务出口仍在，只是不再用色相喊。
- `wireframes.md` 版面不变（ASCII 本就无色），只改文字注释里的「配琥珀」措辞；`✋` 图标保留（它是语义图标，不是颜色）。

## 开放决策（实现前敲定）

1. **组件粒度**（用户「等一会决定」）：
   - A（荐）原子用 shadcn 原语，复合（agent 折叠/运行块/验收卡/账本树/事件流）做成带 props 的组合件——真正可复用。
   - B 全部 22 个都抽成可复用组件（含大视图），工作量最大、大视图复用价值有限。
   - C 只做展示：组件写进 story 的静态组合即可，props 抽象从简。
2. **renderer 打包器**：Vite（生态顺、Storybook 同源）vs 沿用 esbuild（与现壳一致，配置少）。倾向 Vite。
3. **旧 HTML 组件库去留**：保留为视觉参照（默认）vs 用 React 版取代。默认保留，双方共享同一份 `tokens.css` 值。

## 权衡

- 选 shadcn 而非 Astryx：放弃了 Astryx「150+ 组件开箱、Meta 背书」，换来**不推翻已建的 Tailwind 近单色资产**、无 StyleX 构建摩擦、无 beta 风险。若未来要押注 StyleX 生态可另立 change 重估。
- 组件库与 renderer app 拆成两个 change：放弃「一次到位看到桌面里跑」，换来本次范围可控、可先交付一个能审的 Storybook，且不被 IPC/数据对接的复杂度拖住。
- 令牌单一事实源（一份 CSS 变量喂 shadcn / Storybook / 未来 renderer / 旧 HTML 库）：放弃各库独立调色的自由，换来近单色基线不漂移。

## 风险

- **Storybook + Tailwind + shadcn 首次搭建有配置量**（Tailwind 预设、路径别名、令牌注入）→ 缓解：按 shadcn 官方 + Storybook 官方组合配置，先跑通 1 个原子 + 1 个复合组件的 story 再铺开。
- **近单色改文档波及走查清单第 4 条**（原断言「琥珀同时出现在三处」）→ 需重写为结构性断言，避免留下自相矛盾的验收条目。
- **粒度未定，实现无法全量启动** → 本 change 停在「脚手架 + 令牌 + Storybook + 少量样板组件」即可交审；粒度定了再补齐其余组件，不阻塞落盘。
- 回滚：整包 `packages/console-ui` 独立，删除即回滚；文档修订用 git 可回退。
