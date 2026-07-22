# 任务：composer-run-input-unification

- [x] RoleComposer 按钮双态：runActive+空=停下（⏹）、有字=发送（↑），含 aria 标签与键盘可达
- [x] 确认/补齐 Enter 输入法组合保护（isComposing）并加测试（会话页与新对话页共用路径）
- [x] 解除 operator-console 对 composer 的 activeRun 整体禁用，保留其余禁用原因
- [x] run-block 移除「停下」按钮与 onInterrupt，两处渲染点同步清理
- [x] interrupt 接线迁移到 composer 停下按钮（沿用既有 POST interrupt 链路）
- [x] 运行中发送：从最外层入口验证消息按「说话与提及」送达且不打断当前 run
- [x] 竞态兜底：停下瞬间 run 已结束 / 发送瞬间 run 结束的表现测试
- [x] 测试：#39 组合保护、#40 双态按钮与不打断、#11 操作条只剩完整输出
- [x] spec-delta：为 mc-11 / mc-39 / mc-40 逐条写 Requirement（console-ui 域）
