# 提案：console-ui-dark-saas-refresh

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/product/prd.md | 视觉语言原则（新增） | 新增全局视觉语言原则小节：近黑底暗色优先、状态 pill 化、状态色相族、绿红裁决独占、accent 保持靛蓝 | 已写入 |
| packages/console-ui/DESIGN.md | 全文 | 设计语言事实源整体重写（本 change 的 design.md 只留指针） | 已写入 |

PRD 此前无视觉语言小节，属 PRD 缺口，补齐落点为 `docs/product/prd.md`「视觉语言原则」。

## 背景

当前 console-ui 的设计语言是 Linear 克制方向：近单色拉灰、圆点 + 文字 Badge、6px 圆角。用户提供了近黑底暗色 SaaS dashboard 参考（状态 tinted pill、大圆角、可见描边卡片、彩色层级），要求在 Storybook 局部试验后整体迁移。试验在 worktree `design-exp/dark-saas-pills` 的 `packages/console-ui/src/exp/` 完成（v2 版 story `Exp/DarkSaaSPills`），用户已确认该方向并拍板四项产品决策：

1. waiting 使用 violet 专属色相（正式放弃「等你保持中性结构信号」纪律）；
2. 未读计数允许使用红色圆角标（红色不再绝对专属危险/裁决）；
3. 主 accent 保持靛蓝 `#5E6AD2` 不变；
4. 现有 Badge 原语原地替换为 pill 形态，不双形态并存迁移。

## 提案

把 v2 实验从 `src/exp/` 提升为组件库正式设计语言：

- `tokens.css` 合入状态色相族（amber / blue / violet / neutral 各 fg+bg+line）、14px 圆角基线、更深的暗色画布与更明显的描边；亮暗双主题同时定义。
- `Badge` 原语从「圆点 + 文字」改为「状态图标 + tinted 底 + 同色描边」pill，variant 语义不变（九状态 + 不引入视觉名 variant）。
- console 复合组件随令牌自动继承；`accept-card` 裁决段改用 pass/failed pill。
- 侧栏会话状态点（red / blue / blink 语义）不属于 Badge 体系，本次不改。

## 影响

- `packages/console-ui`：tokens.css、badge.tsx、DESIGN.md、全部 Badge 消费方与 stories/tests。
- `desktop`：renderer 复用组件库，整体观感变化；T4/T4.5/T5 验收截图需重新生成。
- `openspec/specs/console-ui/spec.md`：「Near-monochrome token system」「Flat Card and status Badge baseline」两条 Requirement 变更（见 spec-delta）。
- 无运行时行为、IPC、runner 变化。
