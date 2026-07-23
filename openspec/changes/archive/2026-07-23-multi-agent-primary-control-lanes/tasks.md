# 任务：multi-agent-primary-control-lanes

- [x] 修改 PRD、ADR、change wireframe 与 console-ui/local-console spec delta
- [x] 把 local-console active run 状态升级为多 run，并保留主理人单值兼容投影
- [x] 把用户消息固定路由给主理人，实现主理人 pending FIFO 与终态自动发射
- [x] 解耦专业 Agent 执行车道，支持不同成员并行与同成员 redirect 串行重启
- [x] 让 interrupt API 精确匹配任意活动 run，并补齐多 run 终态与恢复事实
- [x] 在 console-ui 渲染待发射区、多活动 RunBlock、专业成员逐行停止和主理人 composer 停止
- [x] 更新 desktop state adapter、发送/停止竞态反馈与兼容读取
- [x] 增加 runtime/store/server/UI 单测和真实 renderer → API → fake Codex 中断验收
- [x] 运行定向测试、完整 `pnpm test`、`pnpm typecheck` 与桌面构建/视觉检查
