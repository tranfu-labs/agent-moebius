# 任务：qa-cluster-sweep-before-report

- [ ] 修改 `seeds/teams/development/members/qa/AGENT.md`「检查方法」段第二条，追加「先跑与本次改动相关的定向测试，绿了再决定要不要全量兜底——小改动不配全量回归」。
- [ ] 同段在第二条之后新增一条「同类横向穷尽」规则，明确「一类缺陷」「姐妹场景」「合并汇报」三个界定的措辞。
- [ ] 核验措辞未与「阻塞项 vs 建议项区分」「证据具体化」两条既有规则重复；未引入新的 stage marker、mention 语义或程序化流程。
- [ ] AI 验证：从当前 session `local:2026-07-23T02:32:44.814Z-omeyxw` 的 msg#69 上下文（`tranfu-agents-app` commit `3a65743`）出发，构造一份 qa 复核 prompt，用改后的 qa.md 起草输出，核对 blocking 报告里是否同时列出 pending 覆盖赋值与 flush 无 try 两处（当前版本 msg#70 只报出前一类）。若两处同批出现，视为规则落地生效。
