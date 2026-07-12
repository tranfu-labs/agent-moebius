# console-ui spec delta：new-session-project-switcher

## 依赖与冲突替换
本 delta 依赖 `local-console-t46-project-workspace-source` 的受控多 project UI 基座。当前事实规格仍有“support a single local project”与“Single project supports multiple sessions”旧规则；归档时 MUST 删除或替换这些单 project 表述。

替换后的最终规则：

- The operator console MUST support a controlled list of local projects and render sessions under their owning project while preserving the project-to-session hierarchy.
- Selecting a project or a session and creating a session for a project MUST flow through callbacks with an explicit project id.

## 新增行为规则

### 项目归属明确的新会话入口
- MUST 在每个项目文件夹行右侧提供该项目专属的新会话按钮。
- MUST 通过受控 callback 传递被点击的 project id。
- MUST NOT 依赖隐式 selected project 来决定项目行按钮创建的 session 归属。
- MUST NOT 同时保留容易误解归属的全局新会话入口。

### 空白新会话项目菜单
- MUST 在无消息、无 active run、无 parent、无 child 的新会话 composer context 中，让项目文件夹入口显示已打开项目下拉菜单。
- MUST 标记当前项目，并在选择其他项目时通过受控 callback 传递 session id 与目标 project id。
- MUST 保持 composer 草稿由上层 state 控制，项目切换不得隐式清空草稿。
- MUST 在会话已有消息、active run、parent 或 child 关系时把项目上下文显示为不可切换文本。
- MUST 在项目重绑 pending 期间禁用项目菜单与发送动作，并在失败后恢复原项目与原草稿。
- MUST 复用可访问的菜单原语，支持键盘导航、焦点恢复与可识别的菜单项名称。

### Selection mutation 串行互斥
- MUST 在 create session、open project 或 session project rebind 任一 selection-changing mutation pending 期间，禁用侧栏 session 选择、项目行新会话按钮、打开项目按钮和项目切换菜单。
- MUST 在 callback/handler 边界再次拒绝 pending 期间到达的 selection 意图，不得只依赖 disabled 视觉状态。
- MUST 保证同一时刻最多一个 selection-changing mutation 能打开 picker 或发送 API 请求，并只允许该 mutation 提交目标 selection。
- MUST 在 selection mutation pending 期间拒绝任何非所有者 refresh 的 state/selection 提交，并允许 mutation 所有者的目标 refresh 抢占期间插入的旧 refresh lease。
- MUST 在 mutation 取消或 API 成功响应前失败后保留原 selection；重绑失败还必须保留原 composer 草稿。
- MUST 在 mutation API 已成功但后续 state refresh 失败时保留已提交的目标 selection，并允许后续 refresh 从目标 selection 恢复。
- MUST 在 session project rebind pending 期间额外禁用发送，并在提交 handler 拒绝首条消息 callback。

## 新增场景

### 场景 CUI.NSPS.1：从目标项目行新建会话
Given sidebar receives two projects
When the user activates the new-session button on the second project row
Then the controlled callback receives the second project id
And no callback is emitted for the first project.

### 场景 CUI.NSPS.2：空白会话切换项目
Given the selected session has no messages, active run, parent, or children
When the user opens the composer project menu and selects another project
Then the controlled callback receives the selected session id and target project id
And the composer draft remains unchanged.

### 场景 CUI.NSPS.3：历史会话项目锁定
Given the selected session has messages, an active run, a parent, or children
When the composer context renders
Then the current project name remains visible
And no project-switch menu is available.

### 场景 CUI.NSPS.4：重绑与首条消息互斥
Given an empty session project rebind is pending
When the composer renders or the user attempts to submit
Then the project menu and send action are disabled
And no first message callback is emitted until the rebind settles.

### 场景 CUI.NSPS.5：Selection mutation 统一串行
Given a create session, open project, or session project rebind mutation is pending
When the user attempts sidebar selection, project-row creation, opening another project, or project-menu selection
Then no second selection-changing callback or request is emitted
And the selected project and session do not change until the owning mutation settles.
