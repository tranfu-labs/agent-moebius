# local-console delta：main-conversation-session-context

## 修改业务规则

### Local workspace source

Source: docs/product/pages/main-conversation.md#区域与信息

原规则「MUST model local project workspace source as a folder path plus a worktree mode boolean」把工作空间模式绑在 project 上，被以下规则替换。

- MUST model the folder path on the project, and the workspace mode on the session.
- MUST resolve local Codex cwd from the session's own workspace mode plus its project's folder path before every Codex run.
- MUST NOT derive a session's workspace mode from its project row at run time.
- 其余原规则（cwd 显式传给 driver、T2 兼容默认会话、项目 CRUD 经 loopback API、解析过程不调用 `gh`）保持不变。

#### 场景 LC.MC.3：同项目两段会话工作空间互不影响

- **GIVEN** 同一个项目下有两段会话，一段为默认工作空间、一段为独立工作空间
- **WHEN** 两段会话各自触发一次 Codex 运行
- **THEN** 前者在项目文件夹内运行，后者在隔离副本内运行
- **AND** 任一段会话改变自己的工作空间不影响另一段。

### Git folder worktree mode

Source: docs/product/pages/main-conversation.md#区域与信息

- 原规则中「worktree mode is enabled」一律解释为**该会话的** workspace mode 为独立工作空间；其余行为不变。

### Direct folder mode and non-git folders

Source: docs/product/pages/main-conversation.md#弹层与危险操作

- 原规则保持，并补充：项目文件夹不是 git 仓库时，本域 MUST 向调用方暴露「独立工作空间不可选」及其确定性原因，供界面在选择前告知用户，而不是等到运行时才记录 `not-git-repository`。

### 空白 session 项目重绑

Source: docs/product/pages/main-conversation.md#区域与信息

- 原规则「MUST keep workspace direct/worktree semantics derived from the newly bound project for the first later run」被替换为：重绑项目 MUST NOT 改变该会话自己的工作空间模式；后续运行使用该会话的模式加新项目的文件夹路径。

## 新增业务规则

### 会话级工作空间与迁移

Source: docs/product/pages/main-conversation.md#区域与信息

- MUST 在 session 上持久化当前生效的工作空间模式与待生效的工作空间模式。
- 结构升级 MUST 把每段既有会话的生效模式初始化为其所属 project 当时的模式，使升级前后行为一致。
- 迁移 MUST 幂等；对已移除项目的孤儿会话 MUST NOT 因迁移失败而阻塞升级。

#### 场景 LC.MC.4：升级不改变既有会话行为

- **GIVEN** 升级前某项目的工作空间模式为独立
- **WHEN** 结构升级完成
- **THEN** 该项目下每段既有会话的生效模式均为独立
- **AND** 再次执行升级不产生额外变化。

### 上下文切换跑完当前步再生效

Source: docs/product/pages/main-conversation.md#操作与反馈

- 改变会话的工作空间或团队时，该会话没有运行中的执行 MUST 立即生效。
- 该会话有运行中的执行时 MUST 写入待生效值、MUST NOT 中止该执行、MUST NOT 产生半截改动，并在该执行结束时把待生效值落定。
- 落定 MUST NOT 重放已经完成的步骤。
- 待生效值 MUST 持久化，跨进程重启仍然存在。
- 本规则 MUST NOT 与「提及正在工作的成员等于让它停下」混用——后者是用户的显式中断权，上下文切换不是。

#### 场景 LC.MC.5：推进中切团队不打断当前步

- **GIVEN** 一段会话有成员正在工作
- **WHEN** 用户改选团队
- **THEN** 当前这一步继续跑完
- **AND** 该步结束后新团队接管后续推进
- **AND** 已经完成的步骤不被重放。

#### 场景 LC.MC.6：待生效切换跨重启保留

- **GIVEN** 一段会话有待生效的工作空间切换
- **WHEN** 进程重启
- **THEN** 待生效值仍然存在
- **AND** 当前执行结束时照常落定。

### 真实分支名上行

Source: docs/product/pages/main-conversation.md#区域与信息

- 会话状态 MUST 携带该会话当前工作空间所在的真实分支名称。
- MUST NOT 以「当前分支」这类字面词代替真实名称。
- 处于 detached HEAD 时 MUST 如实给出确定性兜底值，MUST NOT 编造分支名。
- 分支名读取 MUST 有界，且 MUST NOT 让每次状态查询都触发一次 git 进程调用。

#### 场景 LC.MC.7：分支名与仓库一致

- **GIVEN** 一段会话使用默认工作空间，项目仓库当前分支为 `feat/x`
- **WHEN** 界面请求会话状态
- **THEN** 返回的分支名为 `feat/x`。
