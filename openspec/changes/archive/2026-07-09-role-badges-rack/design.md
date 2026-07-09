# 设计：role-badges-rack

## 方案

### 边界与复用
- 只改 `sites/marketeam/index.html`。正文①②④文案不动；角色 charter 文案仍用既有 7 角色（逐字，见下表），MUST NOT 新造岗位。
- 纯 CSS/JS 自包含，外链仍只 Google Fonts；不引第三方库/图片。复用暗紫基调、hairline、`@property --border-angle` 药丸按钮。

### 员工工牌解剖（全息档）
一张竖版工牌卡：
- **卡面**：深紫玻璃质感（`linear-gradient` 深紫底 + hairline 边 + 顶部内高光）。
- **结构**：顶部打孔/卡槽（一小段圆角凹槽，不做长挂绳）→ 头像区（角色缩写色卡，底色=角色光晕色）→ 姓名位=角色名 → 职位位=charter 一句 → 底部分隔线 → 公司标 `◆ agent-moebius` + 条形码（`repeating-linear-gradient`）。
- **全息（加满档）**：
  - hover 轻 3D tilt：JS 把指针位置写进 `--mx/--my` → `rotateX/rotateY`，幅度 **±6° 以内**。
  - 光泽扫过：`::before` 斜向高光带 hover 时 `translateX` 扫过。
  - 全息 foil：一层 `conic-gradient`/彩虹叠 `mix-blend-mode:color-dodge`，默认极低透明，hover 随 `--mx/--my` 用 `mask: radial-gradient(...)` 流动显形（透明度约 .3）。
  - 尊重 `prefers-reduced-motion`：关 tilt/foil 流动，保留静态样式。

### 三处应用
1. **③「Your AI team」网格**：7 张完整工牌（上面全套），网格排布，hover 出全息 tilt。保留原 charter hover 信息（可并入工牌本身展示，不必再单独 tooltip）。
2. **首屏圆环节点**：**简化版**工牌（缩写色卡 + 细边 + 顶部卡槽小凹槽即可，不塞条形码/公司标），保持小体积、旋转中不过重；hover 仍可出 charter（复用现有 tooltip）。中心 CEO 同风格放大版。
3. **底部技术栈条 → 工牌架**（本 change 的 showpiece，见下）。

### 底部工牌架 · 交互（严格按用户口径）
- **排列**：容器 `perspective:~1500px`；一排工牌 `transform: rotateY(约40~52deg)` **侧立**、负 `margin-left` 叠放，像唱片/文件斜插在架子里（看到的是侧面/斜面，不是正面）。
- **hover**：**只做垂直位移** `translateY(-24~30px)`（可加轻微 `brightness` 提亮与 `z-index` 抬起）；**MUST NOT 在 hover 时转正（不改 rotateY）、不放大到正面**。工牌 hover 时仍是侧立姿态，只是上移。
- **点击**：打开详情弹窗，**此时才显示工牌正面**——弹窗内是 `rotateY(0)` 的正面放大工牌 + 详情（角色名、charter、`@<role>` 在 issue 里 @ 的用法）。弹窗带全息、`Esc`/点遮罩/关闭按钮可关，`prefers-reduced-motion` 降级去掉大位移。
- 侧立态下为便于辨认，工牌侧面 MUST 至少露出角色缩写色卡（点开前能大致认出是谁）。
- 两端渐隐 mask 保留；窄屏工牌架可横向可读或收敛，MUST NOT 触发页面横滚。

### 7 角色（内容，逐字 charter，与正文③一致）
| 角色 | 缩写 | 短标签(职位位) | charter | 光晕 |
|---|---|---|---|---|
| CEO | CEO | Orchestrates & guards | Reviews and corrects every agent's reply, routes handoffs, and enforces the process gates. | 紫 |
| secretary | SEC | Keeps the rules | Maintains and evolves the CEO's guardrail rules. | 蓝 |
| dev | DEV | Writes the code | The only role with write access to the issue worktree; implements and verifies changes. | 绿 |
| dev-manager | DM | Tech lead | Owns technical decisions, architecture choices and quality — without writing code. | 橙 |
| product-manager | PM | Shapes the ask | Turns intent into clear product requirements. | 粉 |
| qa | QA | Breaks the plan | Adversarially reviews the plan before any code is written, against the invariants oracle. | 黄 |
| hermes-user | HU | The user's voice | Stands in for the end user — the Hermes persona. | 青 |

## 权衡
- **hover 只上移不转正**：用户明确要「侧立感」保持，转正只在点击后——比一 hover 就翻正更克制、更有「翻找工牌架」的手感。
- **全息档**：用户选了加满；tilt 角度压小以免与安静气质冲突。
- **不虚构岗位**：内容锚定真实 7 角色，避免重蹈「凭空编内容」。

## 风险
- 侧立强 tilt 下文字不可读——已要求侧面至少露缩写色卡；正面信息留到点击弹窗。
- 全息 `mix-blend-mode` 在深底上可能过曝——foil 默认透明度压低、hover 才显，且限制在卡面 `mask` 内。
- 底部由被动滚动条变为可点交互——需保证键盘可达（工牌架项可 focus + Enter 触发弹窗）与 `prefers-reduced-motion` 降级。
