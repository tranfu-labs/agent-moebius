# 提案：handle-missing-target-issue

## 背景
当前 runner 启动后会立即读取配置中的固定 GitHub issue。如果配置指向的 issue 暂不存在，`gh issue view` 会返回 GraphQL not found 错误，runner 把它当成 `cycle-error` 输出完整堆栈。

这不是业务处理失败，也不应该进入 agent/Codex 流程。常驻进程应能在目标 issue 尚未创建、编号临时不匹配或权限暂不可见时 fail-soft，等待后续轮询恢复。

## 提案
对 `gh issue view` 的目标 issue 不存在错误做结构化识别：

- GitHub 适配层把 “Could not resolve to an issue or pull request with the number ...” 转成专门错误。
- runner 捕获该错误后记录 `event: "skip"`、`reason: "issue-not-found"` 与 `issueKey`。
- 本轮不调用 Codex、不发表评论、不更新状态。
- 其他 GitHub/系统错误仍按 `cycle-error` 记录，避免吞掉真实异常。

## 影响
- `src/github.ts` 增加 GitHub issue not found 分类。
- `src/runner.ts` 增加 fail-soft 分支。
- `openspec/specs/github-issue-runner/spec.md` 增加目标 issue 不存在的业务规则与场景。
