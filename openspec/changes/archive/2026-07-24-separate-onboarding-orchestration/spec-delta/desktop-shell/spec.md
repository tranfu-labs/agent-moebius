# desktop-shell spec delta：separate-onboarding-orchestration

## Requirement: 团队核心与首次引导编排独立

Source: docs/product/pages/onboarding.md#第-3-步--团队协作示例

系统 MUST 只在 `team.json` 保存团队名称、描述、主 Agent slug 与成员顺序，并把首次引导接力示例保存为同一团队目录下独立、可版本化的 `onboarding-orchestration.json`。独立编排 MUST NOT 参与团队可用性、团队登记缓存、新身份指纹、会话 roster 或 Codex prompt；普通手工团队没有该文件时仍可正常创建真实会话。

### Scenario: 旧团队没有编排数据

- **GIVEN** 用户团队的 `team.json` 与记录缓存均为升级前格式，不含 `relayBeats`
- **WHEN** 桌面应用启动并列出团队
- **THEN** 团队按核心定义与成员文件正常判定状态
- **AND** `agent-teams:list` 不因编排缺失失败
- **AND** 团队可用时仍可创建真实会话。

### Scenario: 独立编排损坏

- **GIVEN** 团队核心与成员文件完整，但 `onboarding-orchestration.json` 无法解析或引用了非成员 slug
- **WHEN** 系统读取团队状态、身份与运行时 roster
- **THEN** 团队保持由核心数据决定的状态与身份
- **AND** 编排读取单独返回 invalid
- **AND** 运行时不读取或注入该编排。

## Requirement: 内嵌接力数据有界迁移

Source: docs/product/pages/onboarding.md#第-3-步--团队协作示例

系统 MUST 兼容最近版本在 `team.json` 或团队记录 `lastKnownDefinition` 中内嵌的 `relayBeats`，但 MUST NOT 继续把它视为团队核心。独立编排文件缺失时，合法内嵌值 MAY 作为过渡引导演示输入；下一次安全写用户团队定义时 MUST 先持久化独立文件、再移除内嵌字段。内嵌编排缺失或损坏 MUST NOT 使核心团队无效。

### Scenario: 写入时迁出合法内嵌编排

- **GIVEN** 用户团队仍在 `team.json` 内嵌合法 beats，且独立文件不存在
- **WHEN** 应用保存一次团队核心信息
- **THEN** 应用先原子写入 `onboarding-orchestration.json`
- **AND** 再写只含核心字段的 `team.json`
- **AND** 任一步失败都不得丢失原先仍可兼容读取的演示数据。

## Requirement: 团队身份排除引导演示

Source: docs/product/pages/agent-teams.md#ai-建队

新团队身份指纹 MUST 只覆盖核心 `team.json` 与按成员顺序读取的 `AGENT.md`，MUST NOT 因引导演示新增、删除或修改而改变。对曾把内嵌 beats 计入指纹的旧记录，重定位 MUST 有界接受一次旧算法匹配；成功后 MUST 写回新核心指纹。

### Scenario: 只修改引导演示

- **GIVEN** 同一团队的核心定义与全部成员文件未变
- **WHEN** `onboarding-orchestration.json` 内容改变或被移除
- **THEN** 团队的新身份指纹保持不变
- **AND** 已绑定会话的 roster 与主 Agent 不变。

## Requirement: AI 团队原子提交独立编排

Source: docs/product/pages/onboarding.md#ai-建队技术约束

AI 团队确认创建时，系统 MUST 在同一 staging 团队目录写入核心 `team.json`、独立 `onboarding-orchestration.json` 与全部成员 `AGENT.md`，分别重读校验全部成功后才可把目录切换为正式用户团队并登记。任一编排写入或校验失败 MUST 保留可重试 proposal，MUST NOT 暴露半成品团队。

### Scenario: 编排文件校验失败

- **GIVEN** 当前 AI proposal 的成员与职责有效，但编排文件重读校验失败
- **WHEN** 用户点击创建团队
- **THEN** 正式团队目录和团队记录均不可见
- **AND** 当前 proposal 保留并可重试。
