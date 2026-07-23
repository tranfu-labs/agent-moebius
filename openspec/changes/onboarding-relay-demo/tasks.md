# 任务:onboarding-relay-demo

## 1. clarifying(implement 段前必做)

- [ ] 与用户对齐 `relayBeats` 存储位置(`team.json` 加字段 vs 独立 `relay.json`)
- [ ] 与用户对齐动画总时长(硬 10s vs 8-12s 弹性)
- [ ] 确认 `ai-team-builder-service` 的 output schema `relayBeats` 契约与本 change 消费格式一致

## 2. 数据契约与 seed 迁移

- [ ] 在 team 元数据加 `relayBeats: RelayBeat[]` 字段
- [ ] `seeds/teams/development/` 加 6 拍 relayBeats(经理拆解 → 开发 → 测试指出问题 → 开发修正 → 测试复核通过 → 经理带证据收尾),文案参考原型
- [ ] team-store 读取路径能读回 `relayBeats`
- [ ] 兼容:老团队没有该字段 → 决定硬失败还是 fallback(建议硬失败)

## 3. UI 组件

- [ ] `relay-demo.tsx` 主组件,接 `team` + `relayBeats`,内部驱动动画
- [ ] `relay-graph.tsx` 左侧节点 + 连接线(SVG);节点按 `speakerSlug` 位置渲染;连接线只连相邻两 beat
- [ ] `relay-messages.tsx` 右侧对话行,与节点用共享 grid-template-rows 逐行对齐
- [ ] `relay-replay-button.tsx` 「重新播放」
- [ ] `relay-motion.ts` 动画状态机:normal / reduced-motion 两条路径,onFinish 停在完成画面
- [ ] 播放期间「继续」始终可用(shell 承接,relay-demo 提供 `onSkip` 回调)
- [ ] 走 DESIGN.md 令牌,亮暗双主题

## 4. 强制约束单测

- [ ] 任何 `<line>` / `<path>` 的 y1..y2 差不超过一个 beat 索引单位(禁贯穿竖线)
- [ ] 消息行与节点行的 grid-row 一致(逐行对齐)
- [ ] reduced-motion 分支不触发 CSS transform / translate
- [ ] speakerSlug 不在 team.members 时抛错(不静默降级)

## 5. 落地到 shell slot

- [ ] `onboarding-shell` 提供的 `<OnboardingStep3RelayDemo>` slot 填入 `<RelayDemo team={selectedTeam} />`
- [ ] 内置团队路径:default 选中开发团队 → relay 显示 6 拍
- [ ] AI 建队路径:选中 AI 团队 → relay 显示方案里的 relayBeats

## 6. spec-delta

- [ ] `openspec/changes/onboarding-relay-demo/spec-delta/console-ui/spec.md` 写 Requirement:relay 数据契约 / 节点连接线约束 / 动画时长与 reduced-motion / 消息节点对齐

## 7. 原型对照

- [ ] 对照 `docs/product/pages/onboarding.prototype.html` 第 3 步区块 + `prototypes/src/main.tsx:97-183` 的文案模式,视觉/节奏/文案参考原型
- [ ] 冲突时以 onboarding.md 正文为准

## 8. 验证

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过(含约束单测)
- [ ] 手工路径:第 2 步选内置开发团队 → 第 3 步看到 6 拍演示 → 「重新播放」→ 「继续」→ 第 4 步
- [ ] 手工路径:reduced-motion 打开 → 无位移,静态高亮等价
