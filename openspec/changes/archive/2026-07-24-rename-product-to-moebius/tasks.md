# 任务：rename-product-to-moebius

- [x] 更新运行时代码、配置、包 scope、构建/分发入口和相关测试中的产品命名。
- [x] 更新用户可见文案、Agent 素材、PRD、协议/架构/roadmap 文档、OpenSpec 当前规格与历史归档。
- [x] 重命名仓库内带旧 slug 的跟踪目录，并确认 worktree 路径和 git remote 未改变。
- [x] 增补或更新环境变量、默认数据根、metadata/header/key 与 package scope 的契约测试。
- [x] 执行全仓零残留扫描、定向测试、`pnpm test`、`pnpm typecheck`、桌面构建和原型检查；记录两项与本次 diff 无关的基线断言不一致，其余失败文件均已单进程复跑通过。
