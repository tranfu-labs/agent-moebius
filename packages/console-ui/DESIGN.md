# console-ui 设计语言

本文件是 `@agent-moebius/console-ui` 的包内设计语言事实源：新组件与组件修改必须组合这里记录的令牌、状态语义与模式，不得引入临时视觉值。引入本目录未收录的新模式时，必须在同一个 change 里回流更新本文件。

灵感来源（仅溯源，不复制其内容）：Linear 的产品界面（行结构、冷灰阶、字重层级、图标精度、动效曲线），参见 https://linear.app 及其官方改版博文 https://linear.app/blog/how-we-redesigned-the-linear-ui 。本文件所有规则均为本项目自有决策。

## 令牌纪律

- 组件内禁止裸 hex / rgba 色值；一律走 Tailwind 语义工具类（`bg-canvas`、`text-ink`、`text-sub`、`text-hint`、`border-line`、`bg-hover`、`bg-sel`、`bg-accent`、`text-pass`、`text-danger` 等），这些类全部映射到 `src/styles/tokens.css` 的 CSS 变量。
- 新增令牌判据：同一视觉角色在 ≥2 个组件中出现，或需要亮暗双主题分别取值；否则用既有令牌近似。新增令牌必须亮暗双主题同时定义。
- 中性色为 230 色相底座的冷灰（亮色 `rgba(24,26,42,…)` 系，暗色 `rgba(214,218,235,…)` 系），不使用纯黑 alpha。
- accent 双主题统一靛蓝 `#5E6AD2`；hover 一律向「更强存在感」方向走：亮色加深 `--accent-hover: #4B57C8`，暗色变亮 `--accent-hover: #828FFF`。
- 绿（`--pass`）/ 红（`--danger`）只用于验收裁决与危险事实；等你、排队、中断等状态保持中性结构信号（空心点、muted 文字），不使用专属色相。

## 排版

- 拉丁字体：自托管 Inter Variable（`src/styles/fonts/inter-var-latin-cv01.woff2`，latin 子集，wght 100-900 轴，OFL 1.1，license 同目录 `OFL.txt`）；CJK 回退 PingFang SC 等系统字体，取最近字重档。
- 字重梯度：UI 强调 `font-medium`（wght 510）、标题 `font-semibold`（wght 590）、正文 400。Tailwind 的 `fontWeight.medium/semibold` 已映射到 510/590。
- 全局 `font-feature-settings: "cv01", "ss03"`；13px 正文字距为 0，负字距只用于 ≥16px 标题（当前页面没有）。
- 数字与相对时间用 `.tnum`（tabular-nums）。

## 图标

- 一律 lucide-react，默认 16px（`h-4 w-4`），`strokeWidth={1.5}`；高密度上下文可用 14px（`h-3.5 w-3.5`），角标内微型图标（≤10px）用 `strokeWidth={2}` 保持可读。
- 不为同一语义引入第二种图标集。

## 状态语义与色相预算

Badge 九个 variant 全部渲染为「8px 圆点 + 文字」，语义映射是全包统一的状态语言（实现见 `src/ui/badge.tsx`）：

| 状态 | 圆点 | 文字 |
| --- | --- | --- |
| running | 靛蓝实心（`bg-accent`） | accent |
| failed / stuck | 红实心（`bg-danger`） | danger |
| waiting / pending / interrupted | 中性空心（1.5px 描边圈） | sub |
| completed / displayed | 中性实心（`bg-hint`） | sub |
| idle | 中性空心 | hint |

- 通过 / 不通过裁决是绿点 / 红点 + 文字，只出现在验收裁决面（见 `src/console/accept-card.tsx` 的 `DecisionSegment`）。
- 侧栏会话状态点与 Badge 同语义（`src/console/conversation-sidebar.tsx` 的 `StatusIcon`）；会话不按状态分组，只按稳定创建时间倒序平铺。

## elevation / focus / 动效红线

- 浮层（dropdown / popover）用 `--shadow-pop`（`shadow-overlay` 工具类）：亮色细描边 + 两层软投影；暗色多层投影 + `inset 0 0 0 1px` 内描边——暗色 elevation 靠亮度堆叠，不靠重投影。
- focus-visible 统一 `box-shadow: var(--ring-focus)` 双层靛蓝 ring（globals.css 全局规则），组件不再自写 outline。
- 动效只走令牌：`--dur-fast: 100ms`、`--dur: 150ms`、`--ease: cubic-bezier(0.25,0.46,0.45,0.94)`、入场 `--ease-enter: cubic-bezier(0.165,0.84,0.44,1)`。禁止 bounce / elastic 曲线；按钮按下用 `active:scale-[0.98]`，不做更夸张的形变。
- Card 维持扁平基线：细边、中性面、无默认阴影、近方圆角（`--radius: 6px`，Tailwind lg/md/sm 由 calc 派生）。

## 组件模式目录

- **inbox 行**：`src/console/agent-message.tsx`——32px 圆形角色头像（右下角 15px stage 角标）+ 行 1（角色名 510 + stage muted + 右侧状态图标与 tnum 时间）+ 行 2 结论 + 行 3 箭头 + handoff；行间发丝线（行内 `border-t`），hover 行底色，无常驻卡片边框。
- **属性面板头**：`src/console/session-context-header.tsx`——label（12px muted）在上、value（13px 510 + 14px 图标）在下。
- **状态点**：`src/ui/badge.tsx`、`src/console/conversation-sidebar.tsx`（见状态语义表）。
- **裁决段**：`src/console/accept-card.tsx` 的 `DecisionSegment`——绿 / 红圆点 + 文字，未选中项为中性空心点。
- **浮层**：`src/ui/dropdown-menu.tsx`、`src/ui/popover.tsx`——`shadow-overlay` + 细边 + `rounded-lg`。
- **空状态**：`src/console/conversation-empty-state.tsx`——中性插画图标 + 短句邀请，无彩色引导。

## 生长机制

新组件必须组合上述令牌、状态语义与模式；确需破例或新增模式时，在同一个 change 里更新本文件对应章节，并在 PR 描述中说明判据。
