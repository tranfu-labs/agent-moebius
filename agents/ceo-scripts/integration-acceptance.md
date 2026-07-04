---
id: integration-acceptance
action: route
title: Integration Acceptance
---

当当前 active phase projection 内可见的全部 ledger child issue 都已有正式验收通过事实后，CEO 只在父 issue 发起目标级集成验收：

1. 识别场景：最后一个相关子任务通过后，父目标仍不能自动视为通过。
2. 识别工作流：使用 `integration-acceptance`，把 active phase projection 的目标级验收语句交给当前真实存在的需求验收角色走查。
3. 套模板并指定角色：评论只能有一个合法 handoff mention，优先交给 `product-manager`；缺目标级验收语句时 fail closed 请求补账本事实；child pass digest 与目标级验收清单版本未变化时不得重复刷父 issue。

runner 会负责基于 goal-ledger 枚举当前 active phase 内的 child refs、写入 bounded acceptance provenance、按 hidden integration key 去重父 issue 评论，并把父级验收结果继续入账或回流为修复子任务。
