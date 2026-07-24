# 设计:fix-neutral-agent-avatar

## 覆盖的验收落点

- agent-teams.md L237 「中性圆形首字头像,不使用身份色」
- agent-teams.md 验收 #1 后半句「使用一致的中性首字头像」

## 方案

修改 `packages/console-ui/src/console/agent-initial-avatar.tsx`:

- 删除 `--ident-1..6` 的 hash-select 逻辑(34-37 行)
- 全部实例走 `bg-card / border-line / text-ink`(与 onboarding-shell.tsx:511-513 一致)
- 保留稳定首字提取逻辑,只改视觉

三个消费点(agent-teams-page.tsx:1081 / agent-team-detail.tsx:468, 546)不改。

grep 检查 `--ident-` 是否有其他消费者:如果只有 avatar 用,可以从 `packages/console-ui/src/styles/tokens.css` 一并删除令牌(降低死代码);如果别处也用,只解耦 avatar 一处。

## 权衡

- 直接删色板 vs 保留色板但 avatar 不消费:选后者(如果有其他消费者)或前者(如果 avatar 唯一消费者)。由 codex 实施者按 grep 结果决定
- 不改 avatar API(props/render 契约):最小 blast radius,3 个消费点视觉自动更新

## 风险

- 三个消费点的样式测试可能有针对身份色的断言,需一起改
- Storybook / 手工 QA 需复查:身份色移除后,同名成员(不同团队)是否会难以视觉区分——不是问题(PRD 明确不用身份色,靠首字+姓名区分)
