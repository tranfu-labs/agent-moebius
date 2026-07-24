# 提案:onboarding-relay-demo

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/product/pages/onboarding.md | § 第 3 步 · 团队接力演示 / § 第 3 步重播与继续 / 验收 #8 #16 #18 | 定义第 3 步接力演示的节点连接线约束、10 秒动画、AI 团队用方案里的 relayBeats、重新播放、prefers-reduced-motion 等价 | 已写入 |
| docs/product/pages/onboarding.prototype.html | 第 3 步区块 | 高保真原型的接力演示视觉。**实施时必须对照原型来实现**,冲突以 onboarding.md 正文为准 | 参考 |
| prototypes/src/main.tsx L97-183 | `DEVELOPMENT_RELAY_BEATS` / `PRODUCT_LAUNCH_RELAY_BEATS` / `relayBeatsForTeam(team)` | 原型已预演「按 team.id 分叉的 relayBeats」,产品实现应改为「从方案 / seed 读」 | 参考 |

## 背景

引导第 3 步是「让用户信这支团队会替我接力」的关键演示。硬约束:

- 演示对象**必须是第 2 步所选团队**,不做通用「什么是多 Agent」抽象
- 默认内置开发团队走「经理拆解 → 开发 → 测试指出问题 → 开发修正 → 测试复核通过 → 经理带证据收尾」这条约 10 秒的连续接力
- AI 创建的团队用**已确认方案中同时生成并通过校验的 `relayBeats`**,不退回硬编码开发团队角色
- 视图约束:成员**只提供横向位置**,每次发言在对应成员位置产生节点;**连接线只连相邻两次发言**,不出现代表某成员贯穿全程的长竖线;右侧消息与左侧节点**逐行对齐**
- 可重新播放,播放期间「继续」始终可用
- prefers-reduced-motion 下不做持续位移,改为逐步淡入 + 静态高亮,信息与正常模式等价

原型 `prototypes/src/main.tsx:97-183` 已预演过「按 team.id 查 relayBeats 表」的分叉逻辑,但明确不与产品代码共享源码。产品侧需要重新实现,且要把「按 team.id 查表」升级为「从 team 元数据或 AI 建队方案读」。

## 提案

1. **UI 组件**:新增 `packages/console-ui/src/onboarding/relay-demo/` 目录,含 `<RelayDemo>` 主组件、节点渲染、连接线、消息侧、重新播放按钮
2. **数据源**:
   - 内置开发团队的 `relayBeats` 走 `seeds/teams/development/` 内的**新增数据文件**(格式 TBD,建议 `team.json` 里加 `relayBeats` 字段或独立 `relay.json`),而不是硬编码到 UI
   - AI 创建的团队 `relayBeats` 由 `ai-team-builder-service` 在方案 schema 里带出,写入团队目录时一并存
   - `<RelayDemo>` 组件从 team 元数据读 `relayBeats`,不做 `team.id` 分支
3. **节点 / 连接线约束**:节点按 `speakerSlug` 在成员横向位置渲染,连接线只连相邻两次发言;检查:任何 `<line>` / `<path>` 都不能跨越多个 beat 索引
4. **动画时长与节奏**:总长约 10 秒(可微调),用户可在动画进行中点「继续」直接结束,不等剩余动画
5. **prefers-reduced-motion**:媒体查询命中时切换为逐步淡入 + 静态高亮,信息等价
6. **消息 / 节点对齐**:CSS grid 或等价方式确保右侧消息与左侧节点逐行对齐,不用绝对定位堆叠
7. **落地到 shell slot**:`onboarding-shell` 提供 `<OnboardingStep3RelayDemo>` slot,本 change 把 `<RelayDemo>` 填进去

## 影响

- **新增**:
  - `packages/console-ui/src/onboarding/relay-demo/` UI 目录
  - `seeds/teams/development/relay.json`(或 `team.json` 加字段;TBD)
- **修改**:
  - `desktop/src/team-store.ts` 或 `seeds/` 读取路径:让 `relayBeats` 能从 team 目录读回来
  - `ai-team-builder-service` 的 team writer 已由前置 change 承接「写 relayBeats 到团队目录」;本 change 消费该字段
- **不动**:
  - `desktop/src/team-model.ts` 现有 `TeamStatus` 枚举与业务校验
- **依赖前置**:
  - `onboarding-shell` — 提供 Step3 slot 与 team 上下文
  - `agent-teams-ai-entry` — console-ui 写盘序列化(避免与 agent-teams-page 修改冲突)
  - 间接依赖 `ai-team-builder-service` 的 team writer 已写 `relayBeats`

## PRD 缺口

- **`relayBeats` 存储位置**:`seeds/teams/<slug>/team.json` 加字段 / 独立 `relay.json` / 别的位置。留待 codex 在 implement 段前 clarifying
- **动画总时长**:PRD 说「约 10 秒」,是硬性 10s 还是「按 beat 数动态计算但控制在 8-12s」。留待 clarifying
