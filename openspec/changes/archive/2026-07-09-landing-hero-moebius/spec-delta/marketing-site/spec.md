# marketing-site spec delta：landing-hero-moebius

把 Marketeam 落地页首屏改造为如实呈现 moebius。本 delta **修改**既有首屏（hero）契约，正文（首屏下方）契约不动。

## 移除 / 替换（本 change 归档时生效）

- **退役「头像素材交接（本域核心）」整节**：9 个 specialist 头像占位、AI 照片生成提示词、hover 复制、占位色↔提示词呼应等条目全部移除——首屏头像不再是要拍照的营销真人，改为 AI 角色（见下新增）。连带移除场景 MS.2、MS.3。
- **修改「版式与动效」中的中心数字条**：移除「中心 `20k+` 数字 count-up」这一 MUST；首屏圆环中心改为呈现编排者角色（见下新增）。`count-up`（0→20）不再是首屏必需。
- **保留不动**：自包含（MS.1）、四轨旋转、渐变描边、四档断点无横滚（MS.4）、以及首屏下方正文全部规则（MS.5/6/7）本 delta 不修改。

## 新增行为规则

### 首屏品牌与内容（moebius）
- 首屏 MUST 呈现 moebius 品牌：logo、导航（Overview / How it works / Docs / GitHub）、右侧入口（GitHub / Get started），MUST NOT 保留 Marketeam 营销人才平台文案。
- 打字机主标题 MUST 为如实反映产品交互的语句（当前：`@mention a role. Your AI team ships it.`）。
- MUST NOT 在首屏出现对 moebius 不成立的数字/战绩（如「20k+ Specialists」等虚构规模）。

### 首屏圆环角色化
- 首屏圆环中心 MUST 呈现编排者角色 CEO（标签体现「orchestrates & guards」）。
- 其余真实角色（secretary / dev / dev-manager / product-manager / qa / hermes-user）MUST 作为绕轨节点呈现；每个 MUST 配与其 `agents/*.md` 职责一致的一行 charter。
- 角色节点 hover MUST 弹框显示该角色真实 charter（复用正文同一 tooltip 组件，此处不要求复制控件）。
- charter 文案 MUST 与首屏下方正文「角色阵容」一节逐字一致（同一事实源）。

### 底部条
- 底部滚动条 MUST 呈现真实技术栈（如 Node.js · TypeScript · Codex · gh · Electron），MUST NOT 使用虚构合作方 logo 冒充「被信任墙」。

## 新增场景

### 场景 MS.8：首屏如实呈现 moebius
Given 用户打开落地页首屏
When 页面加载
Then 品牌、导航、主标题、圆环、底部条均围绕 moebius
And 不出现 Marketeam 营销文案或对本项目不成立的虚构数字

### 场景 MS.9：首屏圆环即角色团队
Given 首屏圆环已渲染
When 用户观察圆环
Then 中心为 CEO（orchestrates & guards）
And 其余真实角色绕轨呈现
When 用户 hover 某个绕轨角色
Then 弹框显示该角色真实 charter（与正文一致），且不含复制控件
