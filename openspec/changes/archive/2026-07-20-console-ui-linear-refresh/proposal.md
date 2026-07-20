# 提案：console-ui-linear-refresh

## 背景

`packages/console-ui` 当前的视觉令牌是「Codex 桌面端近单色」基线：亮色 accent 为近黑 `#222`、边线偏重（0.10 alpha）、hover/选中为实心灰块、无阴影/动效令牌、字体走系统栈且无字重梯度。实际观感与目标风格（Linear 的精密工具感 + Notion 的轻边线）存在系统性差距：排版缺 Inter 字形与字重梯度、列表行是卡片堆叠而非 Linear inbox 行结构、按钮无材质与状态分层、图标描边偏粗。

经设计对比稿（`scratchpad/design-refresh/compare.html`，v3 截图存档于同目录）逐轮确认，方向定为：借用 Linear 的行结构、字重层级、图标精度、动效曲线与冷灰阶，但不引入 Linear 的彩色状态色板——绿色/红色仍只用于裁决与危险，等你状态保持中性结构信号。

## 提案

对 `console-ui` 做一次纯视觉层的刷新，不改任何交互行为与数据流：

1. 令牌：`tokens.css` 换冷灰阶、accent 双主题统一为靛蓝 `#5E6AD2`（亮色从近黑改为靛蓝），新增 `--accent-hover`、多层浮层阴影、双层 focus ring、动效令牌；`--radius` 7→6。
2. 字体：自托管 Inter Variable 子集（latin，含 cv01/ss03 与 wght 100-900 轴，约 78KB，OFL 协议），UI 强调用 wght 510、标题用 590，13px 正文字距为 0，CJK 回退系统字体。
3. 组件：`agent-message` 重构为 Linear inbox 行（圆形头像+stage 角标、右侧状态图标+相对时间、发丝线分隔）；`badge` 九个状态语义 variant 全部改为圆点+文字；`button` hover 用 accent-hover、active scale(0.98)；`dropdown-menu`/`popover` 接多层阴影；`conversation-sidebar` 图标 strokeWidth 1.5；`session-context-header` 改属性面板式；`accept-card` 裁决改圆点+文字。
4. desktop 壳宿主 CSS 只读核对，与新令牌冲突才微调。
5. 沉淀 `packages/console-ui/DESIGN.md`：把本次拍板的设计语言提炼为面向未来新组件的规则文档（令牌纪律、排版、图标、状态语义、elevation、动效、组件模式目录），并在根 AGENTS.md 的「修改前检查」接线为强制查阅点。

## 影响

- 修改：`packages/console-ui/src/styles/tokens.css`、`globals.css`、`tailwind.config.ts`，`ui/` 下 button、badge、input、dropdown-menu、popover，`console/` 下 agent-message、conversation-sidebar、session-context-header、accept-card，及相关测试与 Story。
- 新增：`packages/console-ui/src/styles/fonts/` 字体资产与 OFL license；`packages/console-ui/DESIGN.md` 设计语言事实源。
- spec-delta：MODIFIED `console-ui` 的三条既有 Requirement（Near-monochrome token system、Flat Card and status Badge baseline、Codex-native single-stream operator console），ADDED 一条设计语言治理 Requirement。
- wireframes：`docs/wireframes/pages/console.md` 的 Stream Anchor 节在归档时回流新版式；flow.md 不变。
- 不改：组件 props/回调 API、侧栏排序逻辑、runner/desktop 主进程、任何数据流。桌面 renderer 消费编译后的 `globals.css`，视觉自动跟随。
