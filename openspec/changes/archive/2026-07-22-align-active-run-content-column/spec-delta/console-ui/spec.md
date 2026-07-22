# console-ui delta：align-active-run-content-column

> 已于 2026-07-22 合并至 `openspec/specs/console-ui/spec.md`。

本 delta 新增主时间线运行中临时记录的版式契约，不替换 `#11 运行操作条只属于当前步骤`，避免与进行中的 `main-conversation-evidence-outlets` 对 #11 的功能扩展互相覆盖。

## Requirement: 主时间线运行记录复用正文列
Source: docs/product/pages/main-conversation.md#页面结构

系统 MUST 让主时间线中的会话标题、历史消息正文、运行中角色名与实时 Markdown 使用同一左边界，并让运行操作的右边界与该正文列一致。系统 MUST 让活动运行块随正文列响应式收缩，MUST NOT 因活动运行使用独立组件而向时间线容器外沿偏移或保留更窄的固定最大宽度。

### Scenario: 历史消息后出现活动运行
- GIVEN 主时间线已经显示会话标题与至少一条历史消息
- WHEN 一个成员开始工作并显示实时 Markdown 与「停下」
- THEN 标题、历史消息正文、运行中角色名和实时 Markdown 的左边界一致
- AND 「停下」的右边界与正文列右边界一致

### Scenario: 窄窗口中的活动运行
- GIVEN 主时间线所在窗口缩窄
- WHEN 活动运行块随正文列收缩
- THEN 页面不因活动运行块产生横向滚动
- AND 实时 Markdown 继续使用既有的局部溢出规则
