# console-ui spec delta：composer-run-input-unification

## Requirement: mc-39 输入法组合期间 Enter 不提交消息
Source: docs/product/pages/main-conversation.md#输入框

系统 MUST 在消息输入框处于输入法组合状态时让 Enter 只交给输入法确认候选词，并在组合结束后让非 Shift 的 Enter 提交当前可发送草稿。系统 MUST 让 Shift+Enter 保持换行语义。系统 MUST NOT 在输入法组合期间发送消息或选择提及补全项。

### Scenario: 组合文字时确认候选词
- GIVEN 会话页或新对话页的共享输入框正在组合中文、日文或韩文文字
- WHEN 用户按下 Enter
- THEN 输入法可以确认候选词且消息提交回调没有触发

### Scenario: 组合结束后发送与换行
- GIVEN 输入法组合已经结束且草稿满足发送条件
- WHEN 用户按下 Enter 或 Shift+Enter
- THEN Enter 触发一次消息提交，Shift+Enter 不触发提交并保留换行语义

## Requirement: mc-40 运行中输入框使用同一按钮发送或停下
Source: docs/product/pages/main-conversation.md#输入框

系统 MUST 在成员运行期间保持消息输入框可编辑；正文与附件草稿均为空时，右下角动作按钮 MUST 是可访问名称为“停下当前这一步”的停下按钮，正文或附件草稿存在时同一按钮位 MUST 使用既有发送语义。运行中提交的无提及消息 MUST 通过会话消息入口写入并交给团队主 Agent，且 MUST NOT 中断当前成员；提及当前成员的消息仍 MUST 中断其当前步骤并带新指令继续。系统 MUST NOT 因存在活动 run 而整体禁用输入框或另增第二个停下入口。

### Scenario: 空草稿停下当前步骤
- GIVEN 当前会话有一个可中断的活动 run 且正文与附件草稿均为空
- WHEN 用户激活输入框右下角动作按钮
- THEN 系统沿既有 sessionId 与 runId 中断入口请求停下当前步骤

### Scenario: 运行中补充无提及消息
- GIVEN 当前成员正在运行且输入框包含一条不提及任何成员的消息
- WHEN 用户发送消息
- THEN 消息入口接受并持久化该消息、当前 run 的中断信号保持未触发，并由团队主 Agent处理该消息

### Scenario: 停下请求与运行结束竞态
- GIVEN 输入框已经显示停下按钮但对应 run 在请求到达前结束
- WHEN 停下入口返回没有匹配活动 run
- THEN 桌面操作台刷新会话事实且不把该竞态显示为停下失败

## Requirement: mc-11 运行记录不再承载停下操作
Source: docs/product/pages/main-conversation.md#运行中的操作条

系统 MUST 让活动运行记录继续原地展示当前最新可见输出；运行记录若呈现操作项，MUST 只保留“完整输出”。系统 MUST NOT 在活动运行记录或已结束历史记录中呈现“停下”或计时，停下入口 MUST 仅位于空草稿的运行中输入框按钮。

### Scenario: 查看活动运行记录
- GIVEN 时间线正在展示一个成员的活动运行记录
- WHEN 用户查看该记录末尾与输入框操作区
- THEN 活动运行记录中没有停下按钮或计时，空草稿输入框中存在唯一的停下按钮
