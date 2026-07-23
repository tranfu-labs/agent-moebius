# console-ui spec delta：multi-agent-primary-control-lanes

## Requirement: composer 是主理人专属控制面
Source: docs/product/pages/main-conversation.md#输入框

系统 MUST 让既有会话 composer 的用户消息始终以团队主 Agent 为目标。主 Agent 运行时，composer MUST 同时保留可编辑输入、发送能力和一个只绑定主 Agent `runId` 的方形停止按钮；输入内容变化 MUST NOT 隐藏或改写该停止按钮。专业 Agent 运行而主 Agent 空闲时，composer MUST NOT 显示停止按钮。

### Scenario: 主理人运行中继续输入
- GIVEN 主 Agent 正在运行且 composer 包含可发送正文
- WHEN 用户查看并操作 composer
- THEN 页面同时存在“发送给主理人”和“停下主理人”两个可访问动作
- AND 停下动作仍绑定原主 Agent runId

### Scenario: 只有专业成员运行
- GIVEN qa 正在运行且主 Agent 空闲
- WHEN 用户查看 composer
- THEN composer 显示普通发送动作且没有主理人停止按钮
- AND qa 的活动行显示只绑定 qa runId 的停止动作

## Requirement: 主理人待发射区与时间线分离
Source: docs/product/pages/main-conversation.md#输入框

系统 MUST 在 composer 上方按 FIFO 展示主 Agent 运行期间提交的待发射用户消息，并 MUST 显示可理解的正文摘要与附件事实。待发射消息 MUST NOT 同时出现在主时间线；当该消息被 runtime 领取并启动主 Agent 后，MUST 从待发射区移除并出现在时间线。刷新与重启 MUST 保持相同归属。

### Scenario: 两条消息等待主理人
- GIVEN 主 Agent 正在运行且用户依次提交两条消息
- WHEN state 刷新
- THEN 待发射区按原顺序显示两条消息且主时间线尚未显示它们

### Scenario: 最早消息发射
- GIVEN 待发射区有两条消息且主 Agent 进入终态
- WHEN runtime 领取下一条消息
- THEN 第一条从待发射区进入主时间线并启动主 Agent
- AND 第二条继续留在待发射区

## Requirement: 每个专业 Agent 活动行精确停止自身
Source: docs/product/pages/main-conversation.md#运行中的操作条

系统 MUST 为每个活动专业 Agent 分别渲染一条原地更新的 RunBlock，并在该行提供绑定其 `sessionId + runId` 的停止动作。主 Agent RunBlock MUST NOT 重复显示停止动作。停止任一专业 Agent MUST NOT 移除、停止或替换其他活动 run。

### Scenario: 两个专业 Agent 并行
- GIVEN dev 与 qa 在同一会话中拥有不同 runId 的活动 run
- WHEN 用户点击 dev 行的停止
- THEN 客户端只提交 dev 的 sessionId 与 runId
- AND qa 行继续显示为活动状态

## Requirement: 多活动 run 保持正文列与可访问性
Source: docs/product/pages/main-conversation.md#团队推进中

系统 MUST 让所有活动 RunBlock 复用历史消息正文列并保持稳定的启动顺序。每个停止按钮 MUST 具有包含成员名称的可访问名称，键盘焦点 MUST 只落在可操作的对应行，不得以颜色或位置作为唯一目标区分。

### Scenario: 键盘区分三个停止目标
- GIVEN 主 Agent、dev 与 qa 同时运行
- WHEN 键盘用户遍历运行操作
- THEN composer 暴露“停下主理人”
- AND dev 与 qa 行分别暴露包含各自成员名称的停止动作
