# 任务：add-stage-reflector-trigger

- [x] 新增 `src/triggers/` 触发器模块与类型。
- [x] 实现 mention trigger，并迁移 runner 使用触发器解析入口。
- [x] 实现 reflector stage trigger，直接生成 reflector 评论并带去重 metadata。
- [x] 更新 `agents/dev.md` 的 stage 枚举与输出要求。
- [x] 更新 `agents/reflector.md`，说明它由 stage trigger 驱动，不再依赖普通 mention。
- [x] 增加 trigger 单元测试覆盖 stage、mention、非白名单、防循环和去重。
- [x] 运行 `pnpm test` 与 `pnpm typecheck`。
