# marketing-site spec delta：role-badges-rack

把角色视觉升级为员工工牌，并把首屏底部由被动技术栈滚动条改为可交互的角色工牌架。

## 移除 / 替换（归档时生效）
- **退役「底部条」技术栈滚动条规则**：上一轮「底部滚动条 MUST 呈现真实技术栈（Node.js·TypeScript·…）」整条移除——底部改为角色工牌架（见下）。技术栈信息本期退场，不再是底部内容。
- **修改角色视觉规格**：首屏圆环角色与③角色阵容的呈现从「光晕色渐变卡 + 缩写」升级为「员工工牌」观感（见下新增）。charter 内容不变。

## 新增行为规则

### 员工工牌视觉
- 角色 MUST 以「员工工牌」样式呈现：卡面含卡槽/打孔、头像（缩写色卡，底色=角色光晕色）、姓名（角色名）、职位（charter）、公司标 `moebius`、条形码。MUST NOT 使用长挂绳等重装饰。
- 工牌 MUST NOT 虚构 moebius 之外的岗位；牌上角色 MUST 是真实可 @mention 角色。
- 采用全息档：hover MUST 有轻 3D tilt（幅度 ≤ ±6°）+ 光泽扫过 + 随指针流动的全息 foil；MUST 在 `prefers-reduced-motion` 下降级为静态。
- 工牌样式 MUST 应用到 ③ 角色阵容（完整工牌）与首屏圆环节点（简化版工牌，体量克制）。

### 底部角色工牌架（交互）
- 首屏底部 MUST 呈现一排**侧立斜插叠放**的角色工牌（perspective + rotateY 侧立），两端渐隐。
- **hover MUST 只做垂直位移（抬起）**：MUST NOT 在 hover 时把工牌转正或放大到正面；侧立姿态保持。
- **点击/激活 MUST 打开详情，且此时才显示工牌正面**：弹窗呈现正面放大工牌 + 角色名、charter、`@<role>` 用法；MUST 可通过 Esc、点击遮罩、关闭按钮关闭；MUST 键盘可达（可 focus + Enter 触发）。
- 工牌架 MUST NOT 触发页面横向滚动；MUST 在 `prefers-reduced-motion` 下降级去大位移。
- 侧立态 MUST 至少露出角色缩写色卡，便于点开前辨认。

## 新增场景

### 场景 MS.10：角色以员工工牌呈现
Given ③ 角色阵容或首屏圆环已渲染
When 用户查看某个角色
Then 该角色以员工工牌样式呈现（卡槽、缩写色卡、角色名、charter、moebius 标、条形码）
When 用户 hover 该工牌
Then 出现 ≤±6° 的 3D 倾斜、光泽扫过与随指针流动的全息 foil
And 在 prefers-reduced-motion 下退化为静态

### 场景 MS.11：底部工牌架 hover 只抬起不转正
Given 底部角色工牌架已渲染（工牌侧立斜插）
When 用户悬停某张工牌
Then 该工牌仅垂直抬起（可含提亮），角度不变、不转正、不放大到正面
And 页面不出现横向滚动

### 场景 MS.12：点击工牌才显示正面详情
Given 底部工牌架
When 用户点击（或键盘激活）某张工牌
Then 打开详情弹窗并显示该工牌正面放大视图
And 展示角色名、charter 与 `@<role>` 在 issue 中的用法
And 可通过 Esc / 遮罩 / 关闭按钮关闭
