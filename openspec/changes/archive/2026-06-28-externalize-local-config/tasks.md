# 任务：externalize-local-config

- [x] 新增 TOML 解析依赖并更新 lockfile。
- [x] 新增 `src/local-config.ts`，实现默认配置、TOML 解析和 shape 校验。
- [x] 调整 `src/config.ts`，默认白名单为空并从 `config.local` 覆盖。
- [x] 添加 `config.local` 到 `.gitignore`。
- [x] 创建本地 `config.local`，写入两个白名单 repository，但不提交。
- [x] 更新 `AGENTS.md`、`docs/architecture/module-map.md` 与 `openspec/specs/github-issue-runner/spec.md`。
- [x] 补充 local config 单元测试。
- [x] 运行 `pnpm test`。
- [x] 运行 `pnpm typecheck`。
