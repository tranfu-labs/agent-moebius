# 提案:fix-neutral-agent-avatar

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/product/pages/agent-teams.md | L237 + 验收 #1 (L503) | 「团队首页成员项、详情成员选择器和当前成员标题使用同一套中性圆形首字头像,不使用身份色表达层级或状态。」 | 已写入 |

## 背景

全量规则句审计(2026-07-24,after 5 change 全落地)发现:

- **规则**:agent-teams.md L237 「团队首页成员项、详情成员选择器和当前成员标题使用同一套中性圆形首字头像,不使用身份色表达层级或状态」
- **落点违反**:`packages/console-ui/src/console/agent-initial-avatar.tsx:34-37` 用 6 色身份色板(`--ident-1..6`)按 slug hash 派色
- **消费点**:
  - `agent-teams-page.tsx:1081`(团队首页成员项)
  - `agent-team-detail.tsx:468`(成员选择器)
  - `agent-team-detail.tsx:546`(当前成员标题)
- **对比证据**:onboarding-shell 的团队卡(`packages/console-ui/src/onboarding/onboarding-shell.tsx:511-513`)使用中性 `bg-card / border-line`,证明中性方案已存在——两处视觉不一致

规则源于用户产品决策(平台化 desktop 里团队成员一律用中性符号,不用色彩暗示身份/层级)。avatar 色板早于本 loop 存在,是历史遗留;应被本 loop 的规则句审计发现并顺手清掉。

## 提案

改写 `agent-initial-avatar.tsx` 使用中性色(`bg-card / border-line / text-ink`),删除按 slug hash 派色的逻辑与 `--ident-1..6` 依赖(或至少解除 avatar 对它的依赖)。三个消费点(agent-teams-page.tsx / agent-team-detail.tsx × 2)不改 API,只改视觉。

## 影响

- **修改**:
  - `packages/console-ui/src/console/agent-initial-avatar.tsx:34-37` — 色板逻辑改中性
  - 可能:`packages/console-ui/src/styles/tokens.css` — `--ident-*` 若无其他消费者可删(视 grep 结果)
- **不动**:
  - `agent-teams-page.tsx` / `agent-team-detail.tsx` API 调用点(视觉自动更新)
  - onboarding-shell 里的团队卡(已经中性,无需改)
- **验收**:agent-teams.md 验收 #1 后半句「使用一致的中性首字头像」——同时改前满足,只是需要把「中性」二字落到 avatar 本体

## 缘由锚

- 审计发现:`~/dev-loops/moebius/onboarding/audit-findings.md#规则-238`(引句 + 落点 `agent-initial-avatar.tsx:34-37` + 3 消费点)
