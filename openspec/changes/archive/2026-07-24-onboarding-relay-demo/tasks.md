# 任务:onboarding-relay-demo

## 1. clarifying(implement 段前必做)

- [x] 与用户对齐 `relayBeats` 存储位置(`team.json` 加字段 vs 独立 `relay.json`)
- [x] 与用户对齐动画总时长(硬 10s vs 8-12s 弹性)
- [x] 确认 `ai-team-builder-service` 的 output schema `relayBeats` 契约与本 change 消费格式一致

## 2. 数据契约与 seed 迁移

- [x] 在 team 元数据加 `relayBeats: RelayBeat[]` 字段
- [x] `seeds/teams/development/` 加 6 拍 relayBeats(经理拆解 → 开发 → 测试指出问题 → 开发修正 → 测试复核通过 → 经理带证据收尾),文案参考原型
- [x] team-store 读取路径能读回 `relayBeats`
- [x] 兼容:老团队没有该字段 → 决定硬失败还是 fallback(建议硬失败)

## 3. UI 组件

- [x] `relay-demo.tsx` 主组件,接 `team` + `relayBeats`,内部驱动动画
- [x] `relay-graph.tsx` 左侧节点 + 连接线(SVG);节点按 `speakerSlug` 位置渲染;连接线只连相邻两 beat
- [x] `relay-messages.tsx` 右侧对话行,与节点用共享 grid-template-rows 逐行对齐
- [x] `relay-replay-button.tsx` 「重新播放」
- [x] `relay-motion.ts` 动画状态机:normal / reduced-motion 两条路径,onFinish 停在完成画面
- [x] 播放期间「继续」始终可用(shell 承接,relay-demo 卸载即取消剩余计时)
- [x] 走 DESIGN.md 令牌,亮暗双主题

## 4. 强制约束单测

- [x] 任何 `<line>` / `<path>` 的 y1..y2 差不超过一个 beat 索引单位(禁贯穿竖线)
- [x] 消息行与节点行的 grid-row 一致(逐行对齐)
- [x] reduced-motion 分支不触发 CSS transform / translate
- [x] speakerSlug 不在 team.members 时抛错(不静默降级)

## 5. 落地到 shell slot

- [x] `onboarding-shell` 提供的 `<OnboardingStep3RelayDemo>` slot 填入 `<RelayDemo team={selectedTeam} />`
- [x] 内置团队路径:default 选中开发团队 → relay 显示 6 拍
- [x] AI 建队路径:选中 AI 团队 → relay 显示方案里的 relayBeats

## 6. spec-delta

- [x] `openspec/changes/onboarding-relay-demo/spec-delta/console-ui/spec.md` 按 onboarding #8 / #16 / #18 各写一条 Requirement

## 7. 原型对照

- [x] 对照 `docs/product/pages/onboarding.prototype.html` 第 3 步区块 + `prototypes/src/main.tsx:97-183` 的文案模式,视觉/节奏/文案参考原型
- [x] 冲突时以 onboarding.md 正文为准

## 8. 验证

- [x] `pnpm typecheck` 通过
- [x] `pnpm test` 完成(change 定向测试全绿;全量仅剩既有 rollout 环境差异与并发超时 flaky)
- [x] 手工路径:第 2 步选内置开发团队 → 第 3 步看到 6 拍演示 → 「重新播放」→ 「继续」→ 第 4 步
- [x] 手工路径:reduced-motion 打开 → 无位移,静态高亮等价
