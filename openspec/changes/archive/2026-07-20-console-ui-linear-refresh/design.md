# 设计：console-ui-linear-refresh

## 方案

### 令牌层（tokens.css / globals.css / tailwind.config.ts）

- 中性色从纯黑 alpha 换到 230 色相底座的冷灰：亮色 `--line: rgba(24,26,42,0.07)`、`--hover: rgba(24,26,42,0.045)`、`--sel: rgba(24,26,42,0.07)`、`--rail: #F7F8FA`、`--sunken: #F6F7F9`；暗色对应 `rgba(214,218,235,…)` 系与 `--rail: #0F1011`。
- accent 双主题统一 `#5E6AD2`；新增 `--accent-hover`：亮色 `#4B57C8`（加深）、暗色 `#828FFF`（变亮）——hover 一律向「更强存在感」方向走。
- 新增 `--shadow-pop`（亮色 `0 0 0 1px` 细边 + 两层软投影；暗色多层投影 + `inset 0 0 0 1px rgba(255,255,255,0.08)` 内描边，暗色 elevation 靠亮度堆叠而非重投影）、`--ring-focus`（`0 0 0 2px` + `0 0 0 4px` 双层靛蓝）、动效令牌 `--dur-fast: 100ms`、`--dur: 150ms`、`--ease: cubic-bezier(0.25,0.46,0.45,0.94)`、`--ease-enter: cubic-bezier(0.165,0.84,0.44,1)`。
- `--radius` 7→6（Tailwind 的 lg/md/sm 由 `calc` 派生，自动跟随）。
- `globals.css`：`@font-face` 引入 `styles/fonts/inter-var-latin-cv01.woff2`（`font-weight: 100 900`），body 全局 `font-feature-settings: "cv01", "ss03"`；`:focus-visible` 从 2px outline 改为 `box-shadow: var(--ring-focus)`。
- `tailwind.config.ts`：`fontFamily.sans` 改 InterVar 优先、CJK 回退（PingFang SC 等）；`fontWeight.medium: 510`、`fontWeight.semibold: 590`（Inter Variable 连续轴生效；字体未加载时浏览器取最近档回退，可接受）；`colors` 增 `accent-hover`；`boxShadow.overlay` 指向 `var(--shadow-pop)`。

### 组件层

- `agent-message.tsx`：行结构重构为 Linear inbox 行——32px 圆形头像（右下角 15px stage 角标）+ 内容区（行 1：角色名 font-medium(510) + stage 12px muted + 右侧状态图标与 tabular-nums 相对时间；行 2：结论；行 3：箭头图标 + handoff）；行间发丝线优先在组件行内实现（`border-t`），需要时间线容器配合时可调整 `operator-console.tsx` 的列表容器类名，但不改其任何逻辑；hover 行底色。`parseAgentMarkdown` 及导出 API 不动。
- `badge.tsx`：cva variant 名与 API 不变，视觉从 chip 改为「8px 圆点 + 文字」：running 靛蓝点、failed/stuck 红点、waiting/pending/interrupted 中性空心点（1.5px 描边圈）、completed/displayed/idle 中性点；pass/danger 语义只出现在验收裁决面。
- `button.tsx`：primary hover `bg-accent-hover`（替换 `hover:opacity-90`）；所有 variant `active:scale-[0.98]`；过渡改 `duration-150` 令牌曲线。
- `dropdown-menu.tsx` / `popover.tsx`：`shadow-overlay` 接到新多层阴影；项内图标 `strokeWidth={1.5}`。
- `conversation-sidebar.tsx`：lucide 图标统一 `strokeWidth={1.5}`；会话状态点与 badge 语义对齐（四档排序逻辑不碰）。
- `session-context-header.tsx`：改属性面板式（label 12px muted 在上、value 13px 带 14px 图标在下），信息不变。
- `accept-card.tsx`：`DecisionSegment` 通过/不通过改圆点+文字，卡片维持扁平基线。
- `input.tsx`：focus-visible 接双层 ring。

### 字体资产

- 来源：rsms Inter 4.1 官方 `InterVariable.woff2`（352KB），用 fontTools 子集化到 latin（`U+0000-00FF, U+2000-206F, U+20A0-20BF, U+2100-214F`）并保留 `calt,ccmp,locl,kern,cv01,ss03,tnum,pnum`，产物约 78KB；OFL 1.1 license 全文随资产入库。子集化命令记录在 design 附录，可复现。
- Vite lib 构建对 woff2 走 asset 管线；实现第一步先验证 `build`（console-ui）、`build-storybook`、desktop `build` 三路产物中 `@font-face` url 均可解析，再铺开组件改动。

### desktop 壳核对

- 只读检查 `desktop/src/console-page/console.css`：窗口/root 背景与字体是否引用令牌变量；若硬编码旧色值则改为引用变量，其余不动（spec 要求宿主 CSS 不承载组件样式）。

### 设计语言沉淀（DESIGN.md）

- 新增 `packages/console-ui/DESIGN.md`，把本次拍板的决策提炼为面向未来新组件的规则：令牌使用纪律（禁裸 hex、语义变量优先、新增令牌的判据）、排版规则、图标规则、状态语义映射表与色相预算、elevation/focus/动效红线（禁 bounce）、组件模式目录（inbox 行、属性面板、浮层、空状态等，每个模式指向实现它的组件源码）。
- 规则全部重写为本项目自有决策；对话中参考的第三方 Linear 逆向 spec 只以「灵感来源 + 链接」形式记录溯源，不复制其内容入库。
- 新模式生长机制写入文档本身：未来组件破例或新增模式时，必须在同一个 change 里回流更新 DESIGN.md。
- 根 `AGENTS.md`「修改前检查」在步骤 8 加一条：动 `packages/console-ui` 前必读该文档。

## 权衡

- **自托管 Inter Variable（78KB 子集）vs 系统栈**：选自托管。Linear 观感的一半来自 Inter 字形与 510/590 字重；代价是包体积 +78KB 与 OFL 合规声明。fontsource 现成子集不含 cv01/ss03，不可用；不引字体则放弃字形收益（已在采访中否决）。
- **wght 510/590 vs 标准 500/600**：第三方逆向 spec 的 510 未经 Linear 官方证实，但对比稿观感成立；用 `fontWeight` 映射实现，字体回退时自动退到最近档，无硬风险。
- **badge 全改圆点 vs 只改裁决面**：采访中选定全改，统一状态语言；保留 variant 语义名与 API，视觉形式变化写入 spec-delta。
- **accent 换靛蓝 vs 保持近黑**：现有 spec 本就写「indigo limited to interactive emphasis」，本次是把 tokens 向 spec 对齐；AGENTS.md 的「深色交互为主」表述在步骤 8 同步更新。
- **不改组件 API**：所有改动限制在视觉层，desktop renderer 零改动获得新视觉；代价是个别结构（agent-message 行）DOM 变化需更新组件测试。

## 风险

- **字体 url 三路解析**（lib 构建 / Storybook / desktop renderer）：最大技术风险。缓解：实现顺序上字体资产与构建验证先行；若 lib 模式 asset 内联失败，回退方案为 woff2 base64 内联（78KB 可接受）或 public 目录拷贝。
- **mock 与真实 Tailwind 渲染差异**：对比稿是手写 CSS 近似。缓解：AI 验证流程用 Storybook 真实渲染截图逐张核对，不以 mock 为验收标准。
- **CJK 与 Inter 混排字重差异**：Inter 不含 CJK，中文始终走 PingFang SC，510/590 对中文无效——中文粗细分级靠 PingFang 自身字重，视觉上中英文粗细微有差异，属可接受范围。
- **回滚**：纯视觉层改动，revert 单次 commit 即可全部回退；字体资产无运行时依赖。

## 附录：字体子集化命令（可复现）

```bash
# 源：https://rsms.me/inter/font-files/InterVariable.woff2（Inter 4.1, OFL 1.1）
python3 -m fontTools.subset InterVariable-full.woff2 \
  --output-file=inter-var-latin-cv01.woff2 --flavor=woff2 \
  --unicodes="U+0000-00FF,U+2000-206F,U+20A0-20BF,U+2100-214F" \
  --layout-features="calt,ccmp,locl,kern,cv01,ss03,tnum,pnum" \
  --no-hinting --desubroutinize
```
