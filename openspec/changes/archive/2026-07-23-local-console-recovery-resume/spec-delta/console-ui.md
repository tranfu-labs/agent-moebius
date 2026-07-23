# console-ui 规格增量

## MODIFIED Requirement: mc-41 重发追加新消息且保留原消息

系统 MUST 让修改后的草稿通过既有发送入口追加为新用户消息，并在内部携带被停下的原 runId 作为恢复目标。该 metadata 不得显示在正文中；系统仍不得修改或删除原消息。

### Scenario: 修改正文后重发并关联原 run
- GIVEN 改一改重发已经回填原消息且记录被停下的 runId
- WHEN 用户修改正文并发送
- THEN 时间线追加公开的新用户消息
- AND 恢复请求只指向被停下的原 runId

## ADDED Requirement: 主时间线与子会话 Retry 调用同一恢复动作

系统 MUST 为 `run-not-started` 与 `run-stuck` 记录把 `sessionId + runId` 传给恢复 callback。主时间线和右侧子会话 MUST 使用相同语义，不得用一条可见“请重试”普通消息模拟 Retry。

### Scenario: 主时间线点击 Retry
- GIVEN 主时间线显示带 runId 的 stuck 记录
- WHEN 用户点击 Retry
- THEN renderer 请求该 session 和 run 的恢复 API
- AND 时间线不追加伪造的“请重试”用户消息

### Scenario: Retry 缺少 runId
- GIVEN 终态记录没有可定位的 runId
- WHEN 界面渲染该记录
- THEN Retry 不可调用错误的最近 run
