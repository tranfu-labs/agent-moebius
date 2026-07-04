---
id: milestone-spawn-child-issues
action: spawn_child_issues
title: Milestone Spawn Child Issues
---

把当前阶段 projection 中的目标 / 里程碑任务拆成子 issue 时，只做三步：

1. 识别场景：确认当前请求需要 CEO 编排拆解并真实创建子 issue。
2. 识别工作流：使用 `milestone-spawn-child-issues`，不得调用 shell 或自行执行 `gh issue create`。
3. 套模板并指定角色：按 ledger / milestone 文本、模块 / 文件 / 验收面和 `docs/roadmap/milestone-standards.md` 做文本级冲突分组，未知或重叠则串行。每个 child issue 只能有一个合法初始交棒角色；默认 implementation task 给 `dev`，规则维护类可给 `secretary`，需求澄清类可给 `product-manager`，测试设计类可给 `qa`。

CEO 输出必须是 JSON，action 为 `spawn_child_issues`，workflowId 为 `milestone-spawn-child-issues`。每个 descriptor 必须包含：

- ledgerTaskId
- groupId
- title
- description
- initialRole
- qualityBaseline
- acceptanceStatements
- dependencies
- provenance

runner 会负责渲染子 issue body 并强制注入 parent reference、ledger task id、质量基准、验收语句、依赖、初始交棒角色、provenance、冲突分组理由和隐藏 orchestration key。
