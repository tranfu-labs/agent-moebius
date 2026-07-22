# local-console spec delta：local-console-primary-agent-closeout

## MODIFIED Requirements

### Requirement: 团队主 Agent 拥有每轮本地会话的最终控制权
Source: docs/product/pages/main-conversation.md#说话与提及

系统 MUST 把无 mention 用户消息交给当前团队主 Agent；用户直接 mention 其他成员时 MUST 先运行该成员，但本轮后续控制权仍 MUST 最终回到主 Agent。非主 Agent 回复有合法 mention 时 MUST 优先按显式交棒继续，无合法 mention 时 MUST 确定性运行主 Agent；主 Agent 回复无合法 mention 时 MUST 结束本轮并推进消息位点。系统 MUST NOT 把主 Agent 强制插入每次显式成员间交棒，MUST NOT 让主 Agent无 mention 回复再次触发自己。

#### Scenario: 普通多成员接力最终由主 Agent 收尾

- GIVEN 团队主 Agent 是 `dev-manager`，成员包含 `dev`、`qa` 与 `product-manager`
- WHEN 用户要求所有人依次报数，成员通过显式 mention 依次接力，最后一名非主 Agent没有下一棒 mention
- THEN runtime 运行 `dev-manager`
- AND 最后一条可见 Agent 回复来自 `dev-manager`
- AND `dev-manager` 可以结合完整时间线自由收尾

#### Scenario: 用户直接点名成员也回主 Agent

- GIVEN 团队主 Agent 是 `dev-manager`
- WHEN 用户直接 mention `qa`，且 `qa` 回复没有合法 mention
- THEN 下一棒是 `dev-manager`
- AND 当前版本不为直接点名建立例外

#### Scenario: 显式成员接力优先

- GIVEN 最新回复来自非主 Agent `qa`
- WHEN 回复包含唯一合法 mention `@dev`
- THEN 下一棒是 `dev`
- AND runtime 不提前把控制权拉回主 Agent

#### Scenario: 主 Agent无 mention 自然结束

- GIVEN 最新回复来自主 Agent
- WHEN 回复没有合法 mention
- THEN runtime 推进该消息处理位点并结束本轮
- AND 不启动新的主 Agent run

### Requirement: 会话团队快照首成员是主 Agent 单一事实
Source: docs/product/pages/agent-teams.md#主-Agent

新建、切换或继承的本地会话团队快照 MUST 把已校验团队的主 Agent 保存为首成员，runtime MUST 使用首成员作为最终控制权回交目标。系统 MUST NOT 为同一快照新增第二份主 Agent 持久化事实，MUST NOT 从团队外共享 agents 补充或猜测已绑定团队的主 Agent。未绑定 legacy 会话 MAY 继续使用现有首成员兼容行为，但不扩展为产品承诺。

#### Scenario: 新快照保存主 Agent

- GIVEN 可用团队声明 `primaryAgentSlug=dev-manager`
- WHEN 新会话原子绑定该团队
- THEN 持久化快照首成员是 `dev-manager`
- AND runtime 使用首成员决定最终回交角色

#### Scenario: 子会话继承同一主 Agent

- GIVEN 父会话团队快照首成员是 `dev-manager`
- WHEN 创建本地子会话并复制父会话团队快照
- THEN 子会话快照首成员仍是 `dev-manager`
- AND 子会话的最终控制权回交角色不漂移

#### Scenario: 运行中切换团队后由新主 Agent 收尾

- GIVEN 旧团队成员正在运行且新团队快照处于 pending
- WHEN 旧成员完成当前步骤，pending 快照生效
- THEN runtime 只用新团队名单解析该回复之后的控制权
- AND 没有指向新团队可用成员的合法交棒时运行新团队主 Agent
- AND 不重放旧成员已经完成的步骤

## ADDED Requirements

### Requirement: 本地自由文本不产生验收控制事件
Source: docs/product/pages/main-conversation.md#专业判断与程序状态

本地 runtime MUST 把 Agent 正文中的“验收”“通过”“不通过”、测试结论和复核意见保留为普通时间线内容，MUST NOT 因正文关键词或发送角色自动运行 acceptance pre-pass、写入 acceptance fact、创建 acceptance repair、推进 parent integration progress 或吞掉同消息合法 handoff。专业判断后的继续、返工或收尾 MUST 由显式 mention 与主 Agent 结合时间线决定。

#### Scenario: QA 标题包含验收仍正常交棒

- GIVEN `qa` 回复包含小节标题“测试与验收”、正文“通过”或“不通过”以及合法 `@product-manager`
- WHEN local runtime 处理该回复
- THEN 下一棒是 `product-manager`
- AND 不出现 `missing-acceptance-statements` 或验收格式诊断系统消息
- AND 不新增 local acceptance fact

#### Scenario: 无 mention 专业结论回到主 Agent

- GIVEN 非主 Agent回复包含“验收结论：通过”但没有合法 mention
- WHEN local runtime 处理该回复
- THEN 正文不被解析为机器验收事实
- AND 下一棒按团队结构回到主 Agent

#### Scenario: 子会话创建不要求 formal acceptance statements

- GIVEN 本地结构化 child descriptor 包含任务描述、负责成员与依赖，但没有 `taskChecks` 或 `acceptanceStatements`
- WHEN local child executor 解析并创建子会话
- THEN 子会话仍被创建并收到初始交棒
- AND 初始正文不出现空的验收或任务检查章节
- AND 相同缺字段输入在 GitHub strict caller 下仍按原契约拒绝

#### Scenario: 旧 child descriptor 兼容为任务检查

- GIVEN 本地旧结构化 descriptor 带 `acceptanceStatements`
- WHEN local child executor 创建子会话
- THEN 旧字段内容以“任务检查参考”展示
- AND 不创建 acceptance fact，不建立 formal acceptance scope

#### Scenario: 新旧任务检查字段冲突时不猜测

- GIVEN 本地 child descriptor 同时带内容不同的 `taskChecks` 与 legacy `acceptanceStatements`
- WHEN local orchestration parser 校验该 descriptor
- THEN 明确拒绝该结构化副作用
- AND 不静默选择任一字段，不创建半条 child session

### Requirement: 主 Agent 控制上下文只在本地 prompt 注入
Source: docs/product/pages/agent-teams.md#页面目标

local runtime MUST 使用本地专用 prompt 向每次成员运行提供当前团队主 Agent、可用成员与最终回交规则，且 MUST 保留成员 `AGENT.md` 对专业职责和自然语言协作方式的所有权。本地 prompt MUST NOT 声称当前时间线是 GitHub Issue，不得出现 GitHub comment/reaction 或 role envelope 运行指令。该上下文 MUST NOT 规定固定成员顺序、固定验收阶段或固定收尾文案，MUST NOT 修改共享 GitHub prompt、GitHub runner 或顶层 `agents/` 行为。

#### Scenario: 用户团队 persona 未写回交规则时仍可闭环

- GIVEN 用户团队成员 persona 没有写明主 Agent
- WHEN 非主 Agent完成回复且没有合法 mention
- THEN runtime 仍依据团队快照运行主 Agent
- AND 用户团队文件不被迁移、覆盖或自动修改

### Requirement: 主 Agent 收尾前接力状态保持进行中
Source: docs/product/pages/main-conversation.md#说话与提及

系统 MUST 从 cursor 尚未评估的 user/agent trigger source、active claim 与真实 running message 派生唯一的 `hasPendingControlWork`，并由 session/project summary、侧边栏状态点、子会话状态和结果卡片共同消费。只要该事实为 true，会话状态 MUST 保持进行中；非主 Agent 无 mention 回复不得在主 Agent 接回前触发 idle 结果、侧边栏蓝点、子会话“已结束”或结果卡片。主 Agent 无 mention 回复完成评估并推进 cursor 后，`hasPendingControlWork` MUST 变为 false。该事实只表示控制流当前是否仍有下一棒，MUST NOT 表示任务成功、验收通过或语义完成；异常事实的红色/失败/卡住优先级 MUST 保持，不得被它遮蔽。

#### Scenario: 专业成员完成但主 Agent 尚未收尾

- GIVEN 非主 Agent 无 mention 回复已经落库
- AND 该回复尚未被处理或主 Agent run 已 claim
- WHEN 读取 session summary、sidebar 状态和 child session summary
- THEN 会话仍为进行中
- AND 不显示蓝点、“已结束”或结果卡片

#### Scenario: 主 Agent 收尾后结束

- GIVEN 主 Agent 无 mention 回复已经落库并完成 trigger 评估
- WHEN cursor 推进到该回复
- THEN 会话进入 idle
- AND 最终结果可以触发蓝点、子会话“已结束”或结果卡片

#### Scenario: 非成功终态不伪造主 Agent 收尾

- GIVEN 当前成员被用户停下、没跑起来、卡住或因项目/团队不可用无法继续
- WHEN 系统完成对应失败或停止记录
- THEN 保留该终态、重试或恢复入口
- AND 不自动生成一条主 Agent 成功收尾
- AND `hasPendingControlWork` 不遮蔽异常状态，也不把异常解释成成功

## REMOVED Requirements

### Requirement: 本地验收 pre-pass、结构化验收事实与自动返工汇合

本 change 移除 `openspec/specs/local-console/spec.md` 中“本地验收走查解析”“本地验收 pre-pass 回流”“本地验收格式诊断”及 LC.T5.7—LC.T5.14 对应行为。既有 SQLite acceptance 数据 MAY 作为只读历史兼容保留，但 MUST NOT 再驱动本地路由、子任务状态、返工或父任务汇合。
