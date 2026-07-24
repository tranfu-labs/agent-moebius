# spec-delta: console-ui / onboarding-relay-demo

## ADDED Requirements

### Requirement: 验收 #8 — 第 3 步播放所选团队的元数据接力

Source: docs/product/pages/onboarding.md#第-3-步--团队接力演示

系统 MUST 把第 3 步作为首次引导的必经步骤，并在标准动态效果下按接力拍数计算 8–12 秒的总播放时长。系统 MUST 从第 2 步所选团队的 `relayBeats: Array<{ speakerSlug, message }>` 元数据读取播放内容；内置开发团队 MUST 提供经理拆解、开发执行、测试指出问题、开发修正、测试复核通过、经理带证据收尾共 6 拍，AI 团队 MUST 使用创建方案随团队目录写入的 `relayBeats`。系统 MUST NOT 按 `team.id` 选择硬编码接力脚本或用开发团队内容替代 AI 团队内容；任一 `speakerSlug` 不在 `team.members` 时 MUST 抛出错误而不是静默降级。

#### Scenario: AI 团队使用自身接力方案

- **GIVEN** 用户在第 2 步创建并选中一支 AI 团队，且其团队元数据含已验证的两拍接力
- **WHEN** 用户进入第 3 步
- **THEN** 页面显示这支 AI 团队的两条 `message` 及对应成员
- **AND** 页面不出现内置开发团队的 6 拍文案。

#### Scenario: 接力引用越过当前成员集合

- **GIVEN** 所选团队某一拍的 `speakerSlug` 不在 `team.members`
- **WHEN** 第 3 步读取接力元数据
- **THEN** 组件抛出明确错误
- **AND** 不替换 speaker、不跳过该拍、不加载默认团队脚本。

### Requirement: 验收 #16 — 接力可重播、可跳过且减少动态效果信息等价

Source: docs/product/pages/onboarding.md#第-3-步重播与继续

系统 MUST 在每次进入第 3 步时从第一拍自动播放，「重新播放」MUST 在不改变所选团队的情况下从第一拍重新开始；播放完成后 MUST 停留在主 Agent 收尾画面且 MUST NOT 自动进入第 4 步。播放期间「继续」MUST 始终可用，触发后 MUST 立即取消剩余播放计时并进入第 4 步。从第 4 步返回第 3 步时 MUST 开始新一轮完整播放。

当 `prefers-reduced-motion: reduce` 命中时，系统 MUST 以逐拍 opacity 淡入与当前拍静态高亮表达同一成员、顺序、消息和完成记录；该分支 MUST NOT 触发 CSS `transform`、`translate`、持续脉冲或平滑滚动。系统 MUST 保留「重新播放」与「继续」的同等功能。

#### Scenario: 播放中直接继续

- **GIVEN** 第 3 步只播放到第 2 拍
- **WHEN** 用户点击「继续」
- **THEN** 页面立即进入第 4 步
- **AND** 不等待剩余拍次的计时器结束。

#### Scenario: 减少动态效果后重播

- **GIVEN** 系统匹配 `prefers-reduced-motion: reduce`
- **WHEN** 用户进入第 3 步并点击「重新播放」
- **THEN** 每一拍仅以 opacity 淡入和静态高亮重新按序出现
- **AND** 渲染分支不应用 CSS `transform` 或 `translate`
- **AND** 最终可读信息与标准动态效果一致。

### Requirement: 验收 #18 — 接力节点只以相邻线段连接并与消息逐行对齐

Source: docs/product/pages/onboarding.md#第-3-步--团队接力演示

系统 MUST 仅把团队成员顺序映射为节点横向位置，每一拍 MUST 在该拍 `speakerSlug` 的位置产生一个节点。系统 MUST 只在第 `i - 1` 拍与第 `i` 拍之间渲染一条连接线；任何用于接力连接的 `<line>` 或 `<path>` 的 `y1..y2` 索引差 MUST 不超过一个 beat 索引单位。系统 MUST NOT 渲染代表某成员贯穿多拍的竖线、首拍直连末拍的路径或其他跨拍 DAG 边。

每拍节点行与该拍消息行 MUST 位于同一共享 CSS grid，且两者的 `grid-row` MUST 使用相同 beat 索引；系统 MUST NOT 用互不共享行高的独立列表或绝对定位消息模拟对齐。已出现的拍次 MUST 留在同一舞台中，当前拍变化不得从数据或 DOM 中移除既有问题、修正或复核记录。

#### Scenario: 六拍开发团队接力

- **GIVEN** 内置开发团队元数据含 6 拍
- **WHEN** 第 3 步渲染完整接力
- **THEN** 页面渲染 6 个节点和 5 条连接路径
- **AND** 每条路径的终止 beat 索引减起始 beat 索引等于 1
- **AND** 每个节点行与对应消息行拥有相同 `grid-row`。
