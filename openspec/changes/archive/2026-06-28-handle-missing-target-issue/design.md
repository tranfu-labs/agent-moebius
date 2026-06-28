# 设计：handle-missing-target-issue

## 方案
在 GitHub 适配层引入两个错误层次：

- `CommandFailedError`：封装非 0 退出的命令、退出码、signal、stderr。
- `GitHubIssueNotFoundError`：仅在 `gh issue view` stderr 命中 GitHub GraphQL issue/PR number not found 文案时抛出。

runner 的顶层 catch 先判断 `isGitHubIssueNotFoundError(error)`：

```text
issue not found -> log skip(issue-not-found) -> return
other error     -> log cycle-error
```

这样保留常驻进程的可观察性，同时避免把预期可恢复的“目标 issue 暂不可读”当成异常堆栈刷屏。

## 权衡
不把所有 `gh` 失败都降级为 skip。认证失败、网络失败、repo 不可见、JSON shape 异常仍应作为 `cycle-error` 暴露，因为它们可能需要人工处理。

不自动切回其他 issue 编号。配置指向哪个 issue 是运行事实，健壮性只负责缺失时不崩流程，不替用户猜测目标。

## 风险
GitHub CLI 错误文案可能变化。分类函数只匹配当前已观察到的 GraphQL 文案；如果未来文案变化，会退回 `cycle-error`，不会误跳过未知错误。
