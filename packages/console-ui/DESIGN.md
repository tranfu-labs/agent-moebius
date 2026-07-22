# console-ui 设计语言

本文件是 `@agent-moebius/console-ui` 的包内设计语言事实源：新组件与组件修改必须组合这里记录的令牌、状态语义与模式，不得引入临时视觉值。引入本目录未收录的新模式时，必须在同一个 change 里回流更新本文件。全局原则见 `docs/product/prd.md`「视觉语言原则」，本文件是令牌与组件级的执行细则。

灵感来源（仅溯源，不复制其内容）：Linear 的产品界面（行结构、冷灰阶、字重层级、图标精度）与近黑底暗色 SaaS dashboard（状态 tinted pill、大圆角、可见描边卡片）。

## 令牌纪律

- 组件内禁止裸 hex / rgba 色值；一律走 Tailwind 语义工具类（`bg-canvas`、`text-ink`、`text-sub`、`text-hint`、`border-line`、`bg-hover`、`bg-sel`、`bg-accent`、`text-pass`、`text-danger` 等），这些类全部映射到 `src/styles/tokens.css` 的 CSS 变量。
- 新增令牌判据：同一视觉角色在 ≥2 个组件中出现，或需要亮暗双主题分别取值；否则用既有令牌近似。新增令牌必须亮暗双主题同时定义。
- 中性色为 230 色相底座的冷灰（亮色 `rgba(24,26,42,…)` 系，暗色 `rgba(214,218,235,…)` 系），不使用纯黑 alpha。
- accent 双主题统一靛蓝 `#5E6AD2`；hover 一律向「更强存在感」方向走：亮色加深 `--accent-hover: #4B57C8`，暗色变亮 `--accent-hover: #828FFF`。
- 暗色画布近纯黑（`--canvas: #0A0B0D`）、卡面微亮（`--card: #15161A`）、描边可见（`--line` alpha 0.12）；亮色保持既有对比关系。
- 状态色相族令牌：`--status-{run,info,violet,neutral}-{fg,bg,line}` 及裁决 `--pass` / `--danger` 配套 tint，亮暗双主题成对定义；亮色为同族压深 fg + 浅 tint bg。
- 桌面窗口顶层 header 统一使用 `--window-header-height: 46px`；macOS 交通灯、sidebar 展开/折叠按钮和会话 sticky 标题都由该高度容器配合 `items-center` 自然居中，禁止为单个控件追加 `top`、`padding-top` 或 translate 补偿。
- 会话 sticky 标题、历史消息正文与主时间线活动 run 的角色名/实时正文使用同一条左边界；活动 run 的操作贴住同一正文列右边界。该正文列由宿主建立，通用 `RunBlock` 不内置主时间线缩进。

## 排版

- 拉丁字体：自托管 Inter Variable（`src/styles/fonts/inter-var-latin-cv01.woff2`，latin 子集，wght 100-900 轴，OFL 1.1，license 同目录 `OFL.txt`）；CJK 回退 PingFang SC 等系统字体，取最近字重档。
- 字重梯度：UI 强调 `font-medium`（wght 510）、标题 `font-semibold`（wght 590）、正文 400。Tailwind 的 `fontWeight.medium/semibold` 已映射到 510/590。
- 全局 `font-feature-settings: "cv01", "ss03"`；13px 正文字距为 0，负字距只用于 ≥16px 标题。
- 数字与相对时间用 `.tnum`（tabular-nums）。

## 图标

- 一律 lucide-react，默认 16px（`h-4 w-4`），`strokeWidth={1.5}`；高密度上下文可用 14px（`h-3.5 w-3.5`）；状态 pill 内图标 12px（`h-3 w-3`），`strokeWidth={2}` 保持可读。
- running 的半满饼图为自绘 12px SVG（lucide 无对应精度图形），见 `src/ui/badge.tsx`；除此之外不为同一语义引入第二种图标集。

## 状态语义与色相预算

Badge 渲染为「12px 状态图标 + 文字 + tinted 底 + 同色描边」的全圆角 pill（实现见 `src/ui/badge.tsx`），语义映射是全包统一的状态语言：

| 状态 | 图标 | 色相 |
| --- | --- | --- |
| running | 半满饼图 | 琥珀（`--status-run-*`） |
| pending | `Clock` | 蓝（`--status-info-*`） |
| waiting | `Circle` 空心 | 紫（`--status-violet-*`） |
| interrupted / idle | `CircleDashed` | 中性描边 |
| completed / displayed | 实心圆 | 中性灰底 |
| failed / stuck | `CircleX` | 红（danger tint） |
| pass | `CircleCheck` | 绿（pass tint，仅裁决面） |

- 绿 / 红只用于验收裁决与危险事实；唯一例外是未读计数允许使用红色圆角标。
- 侧栏会话状态点（red / blue / blink，由 `needsHuman / hasUnreadResult / isRunning` 推导）是独立于 Badge 的信号体系，见 `src/console/conversation-sidebar.tsx`，不套用 pill 形态。

## elevation / focus / 动效红线

- 浮层（dropdown / popover）用 `--shadow-pop`（`shadow-overlay` 工具类）：亮色细描边 + 两层软投影；暗色多层投影 + `inset 0 0 0 1px` 内描边——暗色 elevation 靠亮度堆叠，不靠重投影。
- focus-visible 统一 `box-shadow: var(--ring-focus)` 双层靛蓝 ring（globals.css 全局规则），组件不再自写 outline。
- 动效只走令牌：`--dur-fast: 100ms`、`--dur: 150ms`、`--ease: cubic-bezier(0.25,0.46,0.45,0.94)`、入场 `--ease-enter: cubic-bezier(0.165,0.84,0.44,1)`。禁止 bounce / elastic 曲线；按钮按下用 `active:scale-[0.98]`，不做更夸张的形变。
- Card 维持无默认阴影的中性面：可见细边、圆角基线 `--radius: 14px`（Tailwind lg/md/sm 由 calc 派生）。

## 组件模式目录

- **inbox 行**：`src/console/agent-message.tsx`——32px 圆形角色头像（右下角 15px stage 角标）+ 行 1（角色名 510 + stage muted + 右侧状态图标与 tnum 时间）+ 行 2 结论 + 行 3 箭头 + handoff；行间发丝线（行内 `border-t`），hover 行底色，无常驻卡片边框。
- **Agent 首字头像**：`src/console/agent-initial-avatar.tsx`——团队首页、成员选择器与当前成员标题共用的中性圆形身份插槽；首字取显示名称，缺失时取稳定 slug，头像自身保持装饰性，旁边必须保留可读名称。
- **属性面板头**：`src/console/session-context-header.tsx`——label（12px muted）在上、value（13px 510 + 14px 图标）在下。
- **状态 pill**：`src/ui/badge.tsx`（见状态语义表）。
- **裁决段**：`src/console/accept-card.tsx` 的 `DecisionSegment`——pass / failed pill，未选中项为中性描边 pill。
- **浮层**：`src/ui/dropdown-menu.tsx`、`src/ui/popover.tsx`——`shadow-overlay` + 细边 + `rounded-lg`。
- **空状态**：`src/console/conversation-empty-state.tsx`——中性插画图标 + 短句邀请，无彩色引导。
- **需要修复面板**：`src/console/agent-team-detail.tsx`——危险事实使用红色图标与细边浅底，正文用普通语言列出不可用范围；修复动作保持 outline，只有“移除记录”等不可逆应用状态变更使用 danger 按钮，并在确认层明确磁盘文件不受影响。

## 生长机制

新组件必须组合上述令牌、状态语义与模式；确需破例或新增模式时，在同一个 change 里更新本文件对应章节，并在 PR 描述中说明判据。
