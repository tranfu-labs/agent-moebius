# local-console delta：right-sidebar-process-tab

本 delta 为 `local-console` 域新增过程输出聚合与可见留存状态。以下 Requirement 均为新增条目，不替换既有单 run `runOutput` 行为。

## Requirement: 验收 #14 — 过程输出接口按源用户消息聚合同一步骤的全部 run
Source: docs/product/pages/main-right-sidebar.md#过程标签

系统 MUST 以请求 run 所属的源用户消息为步骤键，从只追加会话事实中恢复该步骤的全部 run，并按开始时间返回连续编号的 attempts；当前正在执行的 retry MUST 包含在同一响应中。系统 MUST NOT 改变既有 `runOutput(sessionId, runId)` 返回单一 run 输出的语义。

### Scenario: SQLite 投影已被 retry 覆盖
- GIVEN 同一用户消息先产生失败 run 后产生成功 retry，SQLite 消息投影只保留最新 run
- WHEN 客户端以任一已知 run 请求过程输出接口
- THEN 接口从会话事实恢复两个 attempts，并按第一次、第二次返回

## Requirement: 验收 #12 — 过程输出接口下发截断与可用性状态
Source: docs/product/pages/main-right-sidebar.md#过程标签的「完整输出」可能不完整

系统 MUST 为每次执行分别下发 stdout/stderr 的截断布尔值及 `available`、`empty`、`unavailable` 可用性状态；runDir 或输出文件不存在时 MUST 保留会话事实中的 fallback。系统 MUST NOT 把机器诊断串作为唯一的截断信号，也不得把文件缺失报告为空输出。

### Scenario: 超限输出文件随后被清理
- GIVEN 某次执行的输出超过留存上限并在后续重启前被删除
- WHEN 删除前后分别请求过程输出接口
- THEN 删除前响应标记对应流已截断，删除后响应标记原始输出不可用并返回 fallback
