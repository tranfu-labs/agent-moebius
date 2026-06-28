# 任务：generalize-github-response-intake

- [x] 确认 watched repositories、seed issue、idle/active interval、scan limit 与 active issue 上限的配置形态。
- [x] 新增 GitHub response intake 纯业务模块，覆盖 key 生成、due decision、active/idle 状态转换与处理 outcome 归档。
- [x] 新增 intake state adapter，读写 `.state/github-response-intake.json` 并校验 shape。
- [x] 参数化 GitHub client：repository summary scan、issue detail fetch、source-specific comment。
- [x] 拆分 runner：保留单 issue 处理主干，新增多 source 调度层。
- [x] 接入 active issue 1 分钟 poll、连续 5 次无变化降级、默认 repo 5 分钟 idle scan。
- [x] 更新 `openspec/specs/github-issue-runner/spec.md`、`docs/architecture/module-map.md` 与 `AGENTS.md`。
- [x] 补充 intake 业务层单元测试。
- [x] 补充 GitHub adapter 参数构造与状态读写测试。
- [x] 运行 `pnpm test`。
- [x] 运行 `pnpm typecheck`。
