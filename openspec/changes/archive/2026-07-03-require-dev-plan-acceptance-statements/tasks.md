# 任务：require-dev-plan-acceptance-statements

- [x] 修改 `agents/dev.md`，补充 `plan-written` 方案末尾「验收语句」强制要求、UI / 非 UI 格式示例、功能点一一对应规则
- [x] 编写 `openspec/changes/require-dev-plan-acceptance-statements/spec-delta/github-issue-runner.md`
- [x] 执行文本检查，确认 `agents/dev.md` 可查到验收语句要求与两类格式示例
- [x] 执行本地 dry-run，构造模拟 dev `plan-written` 响应并检查末尾至少 1 条验收语句符合格式
- [x] 运行 `pnpm test` 与 `pnpm typecheck`
- [x] code-verified 后按验收结果追记证据到 `docs/roadmap/milestone-1-acceptance-loop.md` T1 并勾选
