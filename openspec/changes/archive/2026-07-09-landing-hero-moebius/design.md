# 设计：landing-hero-moebius

## 方案

### 边界
- 只改 `sites/marketeam/index.html` 首屏区（header + hero 左 + hero 右圆环 + ticker）；**首屏下方 4 节正文一行不动**。
- 复用现有一切机制：打字机、四轨旋转、旋转描边药丸按钮、hover tooltip 组件、入场动画、断点、背景 mesh。只换内容与部分绑定数据。

### 逐元素改造（内容逐字，subagent 照用）

**Header**
- Logo：`moebius`（复用页脚的 ◆ 菱形标 + 文字标，高 32px）。
- Nav：`Overview` / `How it works` / `Docs` / `GitHub`。`Overview` 锚到正文①区、`How it works` 锚到正文②区（平滑滚动）；`Docs` / `GitHub` 用 `#` 占位。
- 右侧：`GitHub`（白字，同款下划线 hover）+ `Get started`（黑药丸 + 旋转描边 + 左滑紫填充，样式同原 Join Now）。

**Hero 左**
- 打字机主标题：`@mention a role. Your AI team ships it.`
  - 第一句 `@mention a role.` 用深色 `#000`；第二句 ` Your AI team ships it.` 用白 `#fff`。紫光标 `#A068FF` 闪烁。35ms/字、400ms 起（沿用原参数）。
- 副文（新增一行，短）：`Runs Codex on your machine, guarded by a CEO, tracked to acceptance.`（灰白，字号约 18px）。
- 按钮：`Get started →`（底 `#060218`，chevron，旋转描边，打字完 3.2s 后现）。
- 徽章：`@ceo` mention 芯片（紫底 `#A068FF` 白字药丸，前置紫光标箭头 SVG，3.6s 后现，取代 David）。hover 出 CEO charter（可选，复用 tooltip）。

**Hero 右 · 圆环（保留 4 轨旋转机制）**
- **中心块**：`CEO` 角色卡（紫渐变卡 + `CEO`）+ 标签 `orchestrates & guards`；反向自转保持正立。**移除 20k+ count-up（删 useCountUp 在 hero 的使用）**。
- **6 个角色绕轨**（复用原头像极坐标位与尺寸中的 6 个，跨轨分布）：每个 = 该角色渐变卡（缩写）+ 光晕色；错峰 fly-in 保留；反向自转正立。hover 弹框显示「角色名·短标签 + charter」（复用 tooltip，**无复制按钮**）。角色/缩写/短标签/charter/光晕色如下（charter 逐字，与正文③一致）：
  | 角色 | 缩写 | 短标签 | charter | 光晕 |
  |---|---|---|---|---|
  | secretary | SEC | Keeps the rules | `Maintains and evolves the CEO's guardrail rules.` | 蓝 |
  | dev | DEV | Writes the code | `The only role with write access to the issue worktree; implements and verifies changes.` | 绿 |
  | dev-manager | DM | Tech lead | `Owns technical decisions, architecture choices and quality — without writing code.` | 橙 |
  | product-manager | PM | Shapes the ask | `Turns intent into clear product requirements.` | 粉 |
  | qa | QA | Breaks the plan | `Adversarially reviews the plan before any code is written, against the invariants oracle.` | 黄 |
  | hermes-user | HU | The user's voice | `Stands in for the end user — the Hermes persona.` | 青 |
  - 中心 CEO 的 charter（若做 hover）：`Reviews and corrects every agent's reply, routes handoffs, and enforces the process gates.`

**底部 ticker**
- 5 个技术栈芯片替换虚构 logo：`Node.js` · `TypeScript` · `Codex` · `gh` · `Electron`（内联 SVG 文字标/芯片，宽度不必固定 137，够读即可），×4 无缝左滚 20s，两端渐隐 mask 保留。

### 保留不动
- 背景 CSS mesh 渐变、入场动画（header/hero 左/圆环/ticker 错峰）、四档断点、打字机与轨旋转机制、旋转描边 `@property --border-angle`、hover tooltip 组件（去复制按钮版）。

## 权衡
- **首屏也出现角色、正文③也出现角色**：hero 是视觉钩子（CEO 居中 + 6 绕轨的隐喻），③ 是平铺详解，重复是强化不是冗余。
- **退役照片提示词交接**：见 proposal「已知取舍」。角色不是要拍照的人，hover 语义改为 charter 更贴合。
- **保留目录名 marketeam**：改名牵动引用/历史，本期不动，记为历史包袱。

## 风险
- 移除 useCountUp 在 hero 的调用后，需确认无遗留引用报错（该 hook 仅 hero 用，可整段删或留函数不调用）。
- 角色绕轨用了原 9 位中的 6 位——subagent 需保证删掉多余 3 位后布局不残留空槽、不产生横滚。
