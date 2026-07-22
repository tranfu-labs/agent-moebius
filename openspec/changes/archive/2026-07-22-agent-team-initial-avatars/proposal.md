# 提案：agent-team-initial-avatars

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/agent-teams.md` | 页面结构 / 扁平成员表达 / Agent 身份与说明 / 指标与验收 | 明确团队首页、成员选择器和当前成员标题使用统一的中性首字头像，并规定显示名与 slug 降级顺序 | 已写入 |

## 背景

对话时间线已经使用“中性圆 + 角色首字”表达 Agent 身份，但 Agent 团队首页、成员选择器和当前成员标题仍只显示文字。相同 Agent 在会话与团队管理页之间缺少一致的身份锚点，也让既有头像设计基线在团队页中断。

## 提案

- 在 `console-ui` 抽取团队成员共用的中性首字头像与字形推导原语。
- 团队首页成员项、团队详情成员选择器、当前成员标题三处统一显示头像。
- 字形优先取 `display_name` 去除首尾空白后的首个可见字符；名称不可用时取稳定 slug 的首个字符，拉丁字母统一大写。
- 不新增图片、路径或 `avatar` frontmatter 字段；slug 之后保留一个内部兜底字形，避免异常输入渲染空圆。

## 影响

- `packages/console-ui/src/console/agent-initial-avatar.tsx`：共享头像与字形推导。
- `packages/console-ui/src/console/agent-teams-page.tsx`：团队首页成员项。
- `packages/console-ui/src/console/agent-team-detail.tsx`：成员选择器与当前成员标题。
- 对应组件测试、`console-ui` 行为规格与 Agent 团队页面 PRD。
