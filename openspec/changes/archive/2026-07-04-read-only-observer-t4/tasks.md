# 任务：read-only-observer-t4

- [x] 新增 `src/observer/read-state.ts`，实现只读 tolerant reader，覆盖配置、`.state/*.json` 与 `.state/run-manifests.jsonl`。
- [x] 新增 `src/observer/model.ts`，聚合白名单 repo、issue 来源、阶段来源、role thread、agent context 与 run manifest。
- [x] 新增 `src/observer/render.ts`，渲染只读 HTML，区分“没有记录”和“读取失败”，展示 artifact 链接 / 图片预览 / 未发布路径。
- [x] 新增 `src/observer/server.ts`，提供 `127.0.0.1` 本地 HTTP 入口，每次请求重新读取文件，不 watch、不写文件、不调用 GitHub。
- [x] 在 `package.json` 增加 `observer` 脚本。
- [x] 为 observer reader / model / renderer 增加 Vitest 单元测试，覆盖空态、读取失败、坏 JSONL、非白名单过滤、多来源聚合与 artifact 展示。
- [x] 补齐 QA-D1 到 QA-D7 验证：缺 state 文件、坏 JSON、坏 JSONL、尾行截断、缺字段、损坏 config、无写入、无 `gh` / `codex` 调用、强杀 observer 不影响 runner。
- [x] 启动 `pnpm observer` 做本地页面验证，并用临时状态覆盖白名单 issue、artifact 图片链接、坏行诊断、空态与 QA 增补场景。
- [x] 更新 `AGENTS.md` 的常用命令、模块职责与只读边界。
- [x] 运行 `pnpm test`、`pnpm typecheck` 与 `git diff --check`。
