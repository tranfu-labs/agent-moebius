# 设计:onboarding-relay-demo

## 覆盖的验收落点

从 `~/dev-loops/moebius/onboarding/rule-binding.md` 抄过来:

### onboarding.md 验收

- **#8** 第 3 步必经;约 10 秒连续动画演示所选团队;AI 团队用已验证方案里的角色与接力,不退回硬编码 — `<RelayDemo>` + 从 team 元数据读 `relayBeats`
- **#16** 支持重新播放,播放期间可继续,reduced-motion 保留等价信息但无持续位移 — 动画控制 + 媒体查询
- **#18** 团队成员只作节点横向位置,连接线只连相邻两次发言,不出现贯穿竖线,消息与节点逐行对齐 — 节点渲染约束 + CSS grid 对齐

### 相关规则句

- **规则句 11** 演示对象是所选团队,AI 团队用方案里同批生成的 relayBeats — 数据源改造
- **规则句 12** 强制线框规则:禁止 DAG / 组织架构感的长竖线 — 节点渲染约束

## 方案

### UI 组件树

```
packages/console-ui/src/onboarding/relay-demo/
  relay-demo.tsx           — 主组件,接 team + relayBeats,内部驱动动画
  relay-graph.tsx          — 左侧节点 + 连接线(SVG)
  relay-messages.tsx       — 右侧对话行(与节点逐行对齐)
  relay-replay-button.tsx  — 「重新播放」
  relay-motion.ts          — 动画状态机 + prefers-reduced-motion 分支
  relay-demo.styles.ts     — DESIGN.md 令牌
  relay-demo.test.tsx      — 节点约束单测(不出现跨 beat 的 line)、reduced-motion 快照
```

### 数据契约

```typescript
type RelayBeat = {
  speakerSlug: string;   // 必须在 team.members 中
  message: string;
};

// team 元数据加一字段
type Team = {
  // ...既有字段
  relayBeats: RelayBeat[];  // 长度 4-10,建议
};
```

内置团队:`seeds/teams/development/team.json` 或独立 `relay.json` 加 `relayBeats`,内容对应 PRD L184 那条约 10 秒流程(经理拆解 → 开发执行 → 测试指出问题 → 开发修正 → 测试复核通过 → 经理带证据收尾,6 拍)。

AI 团队:`ai-team-builder-service` 的 output schema 已含 `relayBeats: Array<{speakerSlug, message}>`(见 `ai-team-builder-service/design.md`);team writer 把它一并写入团队目录,格式与内置团队一致。

### 节点 / 连接线约束(强制单测)

`<RelayGraph>` 渲染逻辑:

1. 成员按 `team.members` 顺序占据横向位置(x 坐标由成员索引决定)
2. 每个 beat 在 `(x[speakerIdx], y[beatIdx])` 产生一个节点
3. **连接线只在相邻两 beat 之间**:for `i in 1..beats.length-1`,画 beat[i-1] → beat[i] 一条线,共 `n-1` 条
4. **不允许**:
   - 从 beat[0] 直连 beat[n-1] 的长线
   - 任何贯穿全程的角色竖线(即某个 x 坐标从 y=0 到 y=maxY 的直线)

单测断言:任何 `<line>` / `<path>` 的 `y1..y2` 差不能超过一个 beat 索引单位。

### 消息 / 节点逐行对齐

CSS grid:左 grid `[节点]` × N 行,右 grid `[消息]` × N 行,共享同一 `grid-template-rows`,避免绝对定位漂移。

### 动画

- **normal mode**:总时长 ~10s;每 beat 依次淡入 + 描边脉冲 + 连接线画入;可用 `Web Animations API` 或 CSS keyframes;`onFinish` 时保留完成画面,不自动跳第 4 步
- **reduced motion**:媒体查询 `(prefers-reduced-motion: reduce)` 命中时,所有 beat 立即出现,当前 beat 加静态高亮描边;「重新播放」等价于「重新走一遍高亮顺序」
- **播放中「继续」**:shell 的「继续」按钮始终启用,点击立即结束动画 → 第 4 步(shell 承接)

### 落地到 shell slot

`onboarding-shell` 在 `OnboardingStep3RelayDemo` slot 挂载 `<RelayDemo team={selectedTeam} />`。本 change 不改 shell 骨架,只填 slot。

### 原型对照

`docs/product/pages/onboarding.prototype.html` 的第 3 步区块给出节点点 / 连接线段的最终视觉,原型 `main.tsx:97-183` 给出 `DEVELOPMENT_RELAY_BEATS` 的具体文案。**实施时逐一对照原型**,视觉/节奏/文案参考原型;冲突以 onboarding.md 正文为准。

## 权衡

- **relayBeats 存 team.json vs 独立 relay.json**:选 team.json 加字段,理由:与 team 语义强关联,避免多文件同步问题;单文件也方便 AI 建队 writer 原子写。风险:老团队没有该字段的兼容
- **动画实现 CSS keyframes vs WAAPI**:选 WAAPI,理由:可编程控制、支持 `getAnimations()` 快速停止;CSS keyframes 反而更难中断
- **不引入通用动画库**:relay demo 是唯一需求,引入 framer-motion 之类过度;直接用 WAAPI + CSS 令牌

## 风险

- **老内置团队没有 `relayBeats`**:seed 迁移 + 兼容层(读到 null 走「测试文案 fallback」还是抛硬失败?)。建议:硬要求,seed 迁移一次到位,防止「fallback 生效但 PRD 说过不许硬编码」
- **AI 团队方案 revision 变更后 relayBeats 与 members 不匹配**:validator 已保证 speakerSlug ∈ members,但 revision 变更后要保证读到的是 committed 版本
- **reduced-motion 与用户手动重播的交互**:用户在 reduced mode 下点「重新播放」应该重跑高亮顺序而不是尝试位移动画
- **console-ui 写盘冲突**:本 change 与 `agent-teams-ai-entry` 都改 `packages/console-ui/`。DAG 已让本 change 依赖 `agent-teams-ai-entry`,序列化写盘
