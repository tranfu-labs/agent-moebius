# local-console delta：right-sidebar-process-tab

本 delta 为 `local-console` 域新增过程输出「按步骤多次执行聚合 + 截断可见 + runDir 缺失降级」的行为规格。**新增** Requirement，不替换 evidence-outlets 已登记的 `runOutput` 条目。

> 骨架文件。Requirement 由 codex 在 implement 段按后端相关验收（#14 聚合 / 截断可见 / 降级口径）逐条写入，含 `Source:` 锚点、可判定判据、Scenario。此处不预写正文。
