---
id: integration-repair-child-issues
action: spawn_child_issues
title: Integration Repair Child Issues
---

当父 issue 的目标级集成验收失败时，CEO 不把父 issue 直接交给实现角色改代码，而是把失败项回流成修复子 issue：

1. 识别场景：父级集成验收评论明确列出失败的目标级验收语句。
2. 识别工作流：使用 `integration-repair-child-issues`，按失败语句和冲突面分组；能独立验证则拆分，未知依赖或范围重叠则合成一个串行修复子任务。
3. 套模板并指定角色：修复子任务继承当前 phase 的 quality baseline，验收语句来自失败的目标级验收语句，并保留父级失败 comment provenance。每个 child issue 只能有一个合法初始 handoff mention。

runner 会负责稳定 repair task id、hidden orchestration key 查重 / 找回、创建或恢复同仓库 child issue、写回 bounded ledger refs，并在修复子任务通过后重新触发同一父目标的集成验收。
