# 任务：local-console-recovery-resume

- [x] 修订本地会话 PRD 与 ADR-0007，明确正常步骤 full、同次未完成执行 resume 的边界
- [x] 增加恢复意图、消费记录、上下文指纹和 cached token 的 session fact 读写与纯规划逻辑
- [x] 实现正常退出先持久化、启动自动接管以及无标记 orphan 继续 stuck
- [x] 接通主时间线和子会话 Retry API
- [x] 让改一改重发跨草稿保存原 runId，并把修正增量交给恢复 planner
- [x] 为 resume 不兼容与 rollout 不可用实现确定性 full fallback
- [x] 补齐单元、runtime/server、renderer 和 Electron 生命周期测试
- [x] 运行定向测试、全量回归诊断、typecheck、desktop build，并完成 AI 验证用例
