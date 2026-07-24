# desktop-shell delta：onboarding-shell

## ADDED Requirements

### Requirement: 首次启动进入独立引导路由

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#1`

桌面应用 MUST 在首启完成 marker 未命中时导航到 `/onboarding/*` 并从第 1 步开始。该路由 MUST 是独立于新建对话页和 `OperatorConsole` 的顶层视图。

#### Scenario: 全新数据根启动

- **GIVEN** 当前数据根没有有效的 `.onboarding-completed` marker
- **WHEN** 桌面 renderer 完成首次路由判定
- **THEN** 用户看到引导第 1 步
- **AND** 新建对话页尚未挂载。

### Requirement: 已完成引导的启动直达主页面

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#2`

桌面应用 MUST 只把包含有效 ISO 完成时间的 `<dataRoot>/.onboarding-completed` 视为已完成引导；marker 缺失、不可读或损坏 MUST 视为未完成。有效 marker 命中时 MUST 直接导航到 `/`，不得再次显示引导。

#### Scenario: 有效 marker 命中

- **GIVEN** 当前数据根的 `.onboarding-completed` 包含有效 ISO 时间
- **WHEN** 应用启动并读取 marker
- **THEN** renderer 直接显示主页面的新建对话形态
- **AND** 不显示任何引导步骤。

### Requirement: Codex 未就绪时第 1 步硬门禁

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#3`

第 1 步 MUST 在 Codex 缺失或不可运行时禁用“继续”，展示固定安装命令 `brew install codex` 的复制操作和“重新检查”。只有一次新的检查返回可运行状态后才能放行。

#### Scenario: 修复缺失的 Codex

- **GIVEN** 第一次 Codex 检查返回缺失
- **WHEN** 用户尚未完成一次成功的重新检查
- **THEN** “继续”保持禁用
- **WHEN** 用户安装后点击“重新检查”且检查成功
- **THEN** “继续”变为可用。

### Requirement: 引导环境检查只检查 Codex

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#4`

引导环境门禁与桌面环境诊断 MUST 只执行 `codex --version` 检查。`env-doctor`、状态快照和辅助状态页 MUST NOT 检查或展示 gh CLI、gh 登录态、Claude 或 Node 环境。

#### Scenario: 执行环境检查

- **GIVEN** 用户进入引导第 1 步
- **WHEN** 主进程执行环境检查
- **THEN** 唯一被探测的命令是 Codex
- **AND** 其它工具的存在与登录状态不影响“继续”。

### Requirement: 第 2 步默认选择内置开发团队

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#5`

第 2 步 MUST 展示可用于新建对话的团队，并在没有本步选择时优先默认选中可用的内置 `development` 团队；若该团队不可用，MUST 回退到首个可用内置团队。该步 MUST 提供“跟 AI 聊出一支新团队”入口并在同一步内嵌既有 `TeamBuilderView`。

#### Scenario: 内置开发团队可用

- **GIVEN** 团队列表包含可用的 `system:development`
- **WHEN** 用户第一次进入第 2 步
- **THEN** 开发团队卡片处于选中态
- **AND** 用户无需额外选择即可继续。

### Requirement: 完成引导把团队一次性交给新建对话

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#9`

第 4 步 MUST 只有一个主 CTA“开始使用”。点击后系统 MUST 先原子写入完成 marker，再导航到 `/` 并以 route state 携带 `pendingAgentTeamKey`。新建对话 MUST 让该 pending pick 优先于 last-used 和内置回退，消费后立即清除 route state；引导完成本身 MUST NOT 写 last-used，只有成功创建会话才能沿用既有规则写入。

#### Scenario: 选择团队后完成引导

- **GIVEN** 用户在第 2 步选中了一个可用团队并到达第 4 步
- **WHEN** 用户点击“开始使用”
- **THEN** marker 写入成功后页面进入 `/`
- **AND** 新建对话的团队预选等于引导所选团队
- **AND** route state 被清除且 last-used 文件未因引导完成而更新。

### Requirement: 四步进度指示与当前步骤同步

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#10`

引导底部 MUST 始终展示恰好四个步骤点和 `n / 4` 文本；当前点和数字 MUST 与正在显示的步骤同步。

#### Scenario: 从第 2 步前进

- **GIVEN** 用户正在第 2 步
- **WHEN** 用户点击“继续”进入第 3 步
- **THEN** 第三个步骤点成为当前点
- **AND** 数字由 `2 / 4` 更新为 `3 / 4`。

### Requirement: 四步共享稳定的引导布局

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#11`

四步 MUST 共享相同的顶部标题区与底部操作条，主体内容宽度 MUST 受 `max-w-lg` 约束。步骤切换不得改变顶底栏的结构位置。

#### Scenario: 连续浏览四步

- **GIVEN** 用户从第 1 步连续前进到第 4 步
- **WHEN** 每一步主体内容发生变化
- **THEN** 顶部标题和底部操作条保持同一布局骨架
- **AND** 主体不超过规定宽度。

### Requirement: 引导期间不挂载操作台侧栏

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#12`

`/onboarding/*` MUST NOT 渲染 `OperatorConsole`、项目侧栏或三栏操作台。引导完成进入 `/` 后 MUST 恢复正常操作台；操作台自身 MUST 不再含“引导期强制打开侧栏”的特殊分支。

#### Scenario: 首启路由与主路由隔离

- **GIVEN** 未完成引导的用户位于 `/onboarding`
- **WHEN** renderer 渲染第 1 至第 4 步
- **THEN** DOM 中不存在操作台侧栏
- **WHEN** 用户完成引导并进入 `/`
- **THEN** 操作台按普通侧栏偏好渲染。

### Requirement: 引导文案不暴露仓库协作术语

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#13`

引导所有步骤、错误态、按钮、状态标签和 AI 建队入口的可见文案 MUST NOT 出现 `gh`、`GitHub`、`PR` 或 `issue` 字样。

#### Scenario: 遍历所有引导状态

- **GIVEN** 测试依次渲染 Codex 成功、缺失、团队选择、接力 slot、完成和 AI 建队状态
- **WHEN** 收集所有可见文案
- **THEN** 不包含任何禁止术语。

### Requirement: 引导视觉只使用设计令牌

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#14`

引导 UI MUST 使用 `packages/console-ui/DESIGN.md` 定义的语义颜色、边框、圆角、排版与状态令牌，MUST NOT 在引导组件中加入裸十六进制色值。

#### Scenario: 检查引导样式源码

- **GIVEN** 引导四步组件已经实现
- **WHEN** 审查其颜色和状态样式
- **THEN** 所有颜色来自共享语义令牌
- **AND** 不存在裸十六进制色值。

### Requirement: 引导支持亮暗双主题

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#15`

引导 MUST 继承 console-ui 的亮暗主题令牌，并在两种主题下保持正文、辅助文字、边框、选中态、成功态、错误态和 disabled 按钮可辨识。

#### Scenario: 系统主题切换

- **GIVEN** 引导当前停留在任一步骤
- **WHEN** 应用主题在亮色与暗色之间切换
- **THEN** 页面无需重新装配即可应用对应令牌
- **AND** 关键状态与操作仍可读、可区分。

### Requirement: 返回上一步保留引导成果

Source: docs/product/pages/onboarding.md#指标与验收
Acceptance ID: `onboarding#17`

第 2 至第 4 步 MUST 提供“上一步”，第 1 步 MUST 不提供回退入口。返回 MUST 保留本次引导中的 Codex 通过状态和团队选择；从第 4 步返回第 3 步 MUST 增加一次接力重播轮次，使后续实现能从第一棒重新播放。

#### Scenario: 从第 4 步返回团队选择

- **GIVEN** 用户已通过 Codex 检查、选择团队并到达第 4 步
- **WHEN** 用户连续两次点击“上一步”
- **THEN** 页面回到第 2 步
- **AND** 原团队仍为选中态
- **AND** 第 1 步的成功环境状态没有被重新判为失败。
