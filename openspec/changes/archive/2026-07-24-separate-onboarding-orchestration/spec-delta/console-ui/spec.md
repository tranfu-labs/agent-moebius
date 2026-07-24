# console-ui spec delta：separate-onboarding-orchestration

## 修改 Requirement: 验收 #8 — 第 3 步播放所选团队的独立接力编排

Source: docs/product/pages/onboarding.md#第-3-步--团队协作示例

系统 MUST 把第 3 步作为首次引导的必经步骤，并在标准动态效果下按接力拍数计算 8–12 秒的总播放时长。系统 MUST 从第 2 步所选团队的独立 `onboarding-orchestration.json` 读取 `relayBeats: Array<{ speakerSlug, message }>`；内置开发团队 MUST 提供经理拆解、开发执行、测试指出问题、开发修正、测试复核通过、经理带证据收尾共 6 拍，AI 团队 MUST 使用已验证 proposal 随团队目录独立写入的 beats。系统 MUST NOT 按 `team.id` 选择硬编码脚本或用开发团队内容替代 AI 团队内容。

### Scenario: AI 团队使用自身独立接力方案

- **GIVEN** 用户在第 2 步创建并选中一支 AI 团队，且其独立编排含已验证的两拍接力
- **WHEN** 用户进入第 3 步
- **THEN** 页面显示这支 AI 团队的两条 message 及对应成员
- **AND** 页面不出现内置开发团队的 6 拍文案。

## Requirement: 编排不可用只显示局部空态

Source: docs/product/pages/onboarding.md#页面状态

所选团队的独立编排缺失、损坏或引用非成员 slug 时，第 3 步 MUST 在原演示卡内显示“暂无可播放的协作示例，不影响这支团队的实际使用”，保留“上一步”和可用的“继续”。系统 MUST NOT 加载其他团队脚本、伪造 beats、把内部路径或 parser 错误暴露给 renderer，或让异常穿透到页面根节点。

### Scenario: 升级前团队没有独立编排

- **GIVEN** 用户在第 2 步选择了一支可用但没有独立编排文件的旧团队
- **WHEN** 用户进入第 3 步
- **THEN** 演示卡显示局部空态
- **AND** 团队仍保持选中
- **AND** 用户可点击“继续”进入第 4 步。

### Scenario: 接力引用越过当前成员集合

- **GIVEN** 独立编排某一拍的 `speakerSlug` 不在当前团队成员中
- **WHEN** 第 3 步读取编排
- **THEN** 演示卡显示同一局部空态
- **AND** 不替换 speaker、不跳过该拍、不加载默认团队脚本。
