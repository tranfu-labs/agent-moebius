# 组件库 subagent 共享简报（Tailwind 版）

你的任务：为 Moebius 对话操作台组件库产出**一个组件片段文件** `component-library/sections/<id>.html`，**全部用 Tailwind utility class**。

## 技术栈
- 页面已挂 **Tailwind Play CDN**，并在 `tailwind.config` 里把设计令牌映射成主题色。你**只写 utility class**，不写 `<style>`、不写行内 hex 颜色。
- 主题（浅/深）由 CSS 变量自动切换，**不要用 `dark:` 变体**——用下方语义色 utility 即可双主题生效。
- 例外：极少数 Tailwind 无法表达的（如某段 `white-space:pre`），可用 arbitrary（`[white-space:pre-wrap]`），仍不许写颜色 hex。

## 视觉基线 = 近单色 Linear（务必遵守）
参考就是 Linear Issues 界面：**扁平、hairline、紧凑、克制颜色**。铁律：
- 扁平；描边用 `border border-line`（hairline）；圆角 `rounded-md`(6)/`rounded-lg`(8)/`rounded-xl`(12)/`rounded-full`；**阴影只给浮层** `shadow-overlay`，普通卡无阴影。
- 面向普通用户，术语人话（开发/测试/技术负责人；运行中/等你/方案已写好），不要终端质感。

### 颜色预算（最重要，从严）—— 已删除等你专属信号色，近乎全灰
1. **默认一切灰阶**：表面、文字、描边、图标、**角色头像**、**所有状态（含「等你」）**，全用中性令牌。
2. **没有等你专属色了**。**「等你 / 轮到你了 / 需要你介入」是普通状态**，用中性灰呈现，跟其它状态一视同仁——不给任何专属信号色。
   - 等你：用 `#i-hand` 图标 `text-sub`（中性）或普通灰点，文字 `text-ink`/`text-sub`。不要背景 tint、不要彩色饰条、不要彩色 pill。
   - 顶栏「等你」计数：跟「运行中」计数同款中性文字/`bg-sunken` pill，不着色。
   - 验收卡：普通卡 `bg-card border border-line`，**无 tint、无彩色左条**；标题 `#i-hand` 用 `text-sub`。
   - 账本闸口行：普通 `bg-sunken border border-line`，不着色。
3. **强调 accent(indigo) 极少用**，只给：主实心按钮（`bg-accent text-accent-fg`，含验收卡「提交」）、`@mention`、焦点环、品牌方块、可点链接（打开会话/去验收）。**选中态用中性灰 `bg-sel`。**
4. **绿 pass / 红 danger 只在裁决那一刻，且只用彩色文字（无浅底填充）**：验收卡「通过/不通过」按下态 = 中性选中底 `bg-sel` + `text-pass` / `text-danger` + `font-semibold`（选中感靠中性底，颜色只在文字）。**红 danger 也用于危险动作「中断」**（`text-danger` + `border-line-strong`，hover:`bg-hover`）。其它地方的 ✓ 一律中性 `text-sub`（运行步骤勾、账本/事件流「验收通过/未过」都用灰）。
5. **角色头像统一中性灰**（`bg-ava-bg text-ava-fg`）+ 单字区分，**不要色相**。

## 令牌 utility 速查（只准用这些颜色名）
- 表面：`bg-canvas`(页面) `bg-rail`(侧栏) `bg-card`(卡) `bg-sunken`(原始输出/凹陷) `bg-input`
- 文字：`text-ink`(主) `text-sub`(次) `text-hint`(弱)
- 描边：`border border-line` / `border-line-strong`；分隔线同色
- 选中/悬停：`bg-sel` / `hover:bg-hover`
- 强调（少用）：`bg-accent text-accent-fg`、`text-accent`
- 裁决/危险（只彩色文字，无浅底）：通过 `bg-sel text-pass`、不通过 `bg-sel text-danger`、危险动作(中断) `text-danger` + hover:`bg-hover`
- （已无等你专属色令牌——「等你」用中性灰）
- 头像：`bg-ava-bg text-ava-fg`
- 阴影：`shadow-overlay`（仅浮层）
- 等宽数字：加 `tnum` 类（已全局定义）

### 状态点/图标写法
- 图标用 sprite（页面已内联）：`<svg class="w-[15px] h-[15px] stroke-current fill-none [stroke-width:1.5]" style="stroke-linecap:round;stroke-linejoin:round"><use href="#i-check"/></svg>`
  可用 id：`i-plus i-caret-d i-caret-r i-home i-back i-check i-hand i-doc i-diamond`。缺别的图标就内联一段 path（线性、`stroke-current`、1.5 宽）。
- ⣾ 运行中点：`<span class="inline-block w-1.5 h-1.5 rounded-full bg-sub animate-breathe"></span>`（**灰**，呼吸）
- ✋ 等你：`<svg class="w-[15px] h-[15px] stroke-current fill-none [stroke-width:1.5] text-sub">…#i-hand</svg>`（**中性灰**，普通状态，不着色）
- ○ 未开始：`<span class="inline-block w-2 h-2 rounded-full border-[1.5px] border-hint"></span>`
- ✓ 已完成：`text-sub` 里放 `#i-check`（**中性灰勾**，不是绿）

### 字号（跟 Linear，紧凑）
正文 `text-[13px]`，次要 `text-xs`(12)，弱标签 `text-[11px]`，卡标题/强调 `text-sm`(14) 或 `font-semibold`。行高默认即可，密排用 `leading-tight`。

## 片段文件契约（严格）
文件 `component-library/sections/<id>.html` = **恰好一个** `<section>`：
```html
<section class="spec" data-component="<id>" id="<id>">
  <header class="spec-h">
    <h2>中文标题</h2><code>?only=<id></code>
    <p>一句话说明这个组件是什么、什么时候出现。</p>
  </header>
  <div class="spec-stage">
    <!-- 真实组件 demo：全部 Tailwind utility。用 stage-row/stage-col + specimen>.cap 陈列多态 -->
  </div>
</section>
```
规则：
- **不要** `<!doctype>`/`<html>`/`<head>`/`<body>`；**不要写 `<style>`**；**不要写 hex 颜色**（一律用上面的令牌 utility）。
- 令牌是全局的（不再需要 `.app` 包裹）。demo 直接放进 `.spec-stage`。
- 舞台陈列助手已全局提供：`stage-row`（横向 flex-wrap）/`stage-col`（纵向）/`specimen`（一个样本）/`cap`（样本上方灰色小标注）。tokens/icons 组件另有 `swatch/.chip/.nm/.hex`。这些是外壳类，直接用类名即可（它们不是 Tailwind utility）。
- 每个组件尽量展示**全部状态/变体**，每个 `specimen` 上方 `<div class="cap">状态名</div>`。
- 需要「折叠/展开」两态：**分别静态渲染两个 specimen**（折叠态 + 展开态），不要依赖 JS。
- 中文文案、人话化。浅/深双主题都要能看（用令牌 utility 就自动满足，别写死色）。

产出后无需运行。最终回复只需简短说明你做了哪些状态/变体、以及你如何遵守了颜色预算（尤其：哪里本可用色但你退成了灰）。
