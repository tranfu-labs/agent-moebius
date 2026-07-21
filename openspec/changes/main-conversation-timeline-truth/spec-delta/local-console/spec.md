# local-console delta：main-conversation-timeline-truth

## 修改业务规则

### Session agent team binding

Source: docs/product/pages/main-conversation.md#现状参考与产品缺口

原规则「MUST treat an absent binding as "use the shared agent directory"」被以下规则替换。Agent 只来自团队，没有脱离团队的全局来源。

- MUST NOT treat an absent binding as permission to use a shared agent directory.
- 结构升级 MUST 把没有团队绑定的既有本地会话绑定到自带的第一支团队，使这些会话继续可用。
- 升级完成后 MUST NOT 存在没有团队绑定的本地会话。
- 其余原规则（创建时写入绑定、不从全局偏好派生、浏览或编辑团队不改变绑定）保持不变。

#### 场景 LC.MC.8：升级后不存在无团队会话

- **GIVEN** 升级前存在没有团队绑定的本地会话
- **WHEN** 结构升级完成
- **THEN** 这些会话都绑定到自带的第一支团队
- **AND** 数据库中不存在没有团队绑定的本地会话。

### Session-scoped agent roster

Source: docs/product/pages/main-conversation.md#现状参考与产品缺口

原规则保持，并补充：

- 本域 MUST NOT 提供任何以共享 agent 目录为默认值的名单解析入口。
- 团队已删除与团队需要修复 MUST 作为两种可区分的失败上报，MUST NOT 一律归为需要修复。

## 新增业务规则

### 系统记录的事件类型

Source: docs/product/pages/main-conversation.md#区域与信息

- 每条系统记录 MUST 持久化一个事件类型，取值覆盖 一步没跑起来 / 一步卡住了 / 用户按了停 / 反复重试仍未成功 以及一个中性的其他系统记录。
- 事件类型 MUST 必填；无法归入四种事实时 MUST 使用中性类型，MUST NOT 留空。
- 系统记录正文 MUST 使用面向用户的自然语言，MUST NOT 包含运行目录、工作目录、数据库路径或内部标识。
- 界面判定四种事实 MUST 依据事件类型，MUST NOT 依据正文文本匹配。

#### 场景 LC.MC.9：每条系统记录都可判定

- **GIVEN** runtime 写入一条系统记录
- **WHEN** 该记录被读取
- **THEN** 它带有一个事件类型
- **AND** 正文中不含机器路径或内部标识。

### 三种不可继续状态的判定与恢复

Source: docs/product/pages/main-conversation.md#页面状态

- 本域 MUST 统一判定三种不可继续状态：项目文件夹不可用、团队已删除、团队需要修复，并对每种产出确定性的原因与恢复动作。
- 团队已删除 MUST 与团队需要修复可区分，MUST NOT 归为同一种。
- 项目文件夹修复成功 MUST 恢复该会话的输入、发送与推进能力，历史与选择不变。
- 团队被删除后改选另一支可用团队 MUST 恢复推进能力，已有历史保留，新团队从当前上下文接手。
- 团队修复完成 MUST 自动恢复推进能力，MUST NOT 要求用户再操作一次。

#### 场景 LC.MC.10：团队修复后自动恢复

- **GIVEN** 一段会话因所绑团队需要修复而不可继续
- **WHEN** 该团队在应用之外被修复
- **THEN** 该会话在后续刷新周期恢复推进能力
- **AND** 用户不需要额外操作。

### 运行期分流纳入团队健康

Source: docs/product/pages/main-conversation.md#页面状态

- 三种不可继续状态在有执行进行中时发生，已经拥有有效隔离副本、能够安全完成的执行 MUST 跑完当前这一步再停止。
- 依赖已经不可用的项目文件夹或团队内容、无法安全继续的执行 MUST 立即停止，并留下带事件类型的可读系统记录。
- 执行已经无法继续时，本域上报的会话状态 MUST NOT 仍然表示有成员正在工作。

#### 场景 LC.MC.11：团队内容失效时不谎报运行中

- **GIVEN** 一段会话有执行进行中，且其所绑团队内容变为不可用
- **WHEN** 该执行无法安全继续
- **THEN** 执行立即停止并留下可读系统记录
- **AND** 该会话不再被上报为有成员正在工作。
