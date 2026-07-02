# 设计：target-codex-reaction-to-trigger-message

## 方案
新增一个显式 reaction target 模型，避免 runner 继续把所有反馈都隐式绑定到 `IssueSource`：

```text
ReactionTarget
  - issue: IssueSource
  - issue-comment: { source: IssueSource, commentId: <GitHub comment node id> }
```

GitHub adapter 按 target 选择安全的 `gh api` 参数数组：

```text
issue
  -> gh api --method POST repos/<owner>/<repo>/issues/<issueNumber>/reactions -f content=eyes

issue-comment
  -> gh api graphql
     -f query=<addReaction mutation>
     -f subjectId=<comment node id>
     -f content=EYES
```

comment reaction 选择 GraphQL `addReaction`，因为 `gh issue view --json comments` 已返回 comment node `id`；这样不需要从 HTML URL 里解析 `issuecomment-<number>`，也不需要额外 REST fetch。reaction content 在 adapter 内从受控枚举 `"eyes"` 映射到 GraphQL enum `"EYES"`，issue body 的 REST 路径继续使用 `"eyes"`。

runner 的 target 解析保持在编排层：

```text
buildTimeline(issue.body, issue.comments)
  -> resolveTrigger(latest timeline message)
  -> buildRolePromptPlan(...).latestIndex
  -> latestIndex === 0 ? issue target : issue.comments[latestIndex - 1] comment target
  -> preScript ok
  -> addCodexExecutionReaction(target)
  -> runCodex(full/resume)
```

这样不需要让 `conversation.ts` 依赖 GitHub comment id；纯 timeline 仍只负责 speaker、body、source 与 index。`runner.ts` 使用 timeline index 映射回原始 `GitHubIssue.comments`，因为二者本来由同一个数组构造，顺序一致。

`GitHubComment` shape 增加必需的 `id: string`。这是 comment reaction 的执行前提；如果 `gh issue view` 返回 shape 不符合预期，fetch adapter fail fast，runner 不会进入带缺失 comment id 的半有效状态。测试 helper 统一为 fake comments 填充稳定 id，避免每个测试重复样板。

日志延续现有 `codex-execution-reaction-added` / `codex-execution-reaction-failed` 事件，并补充 `targetSource` 与 `targetIndex`，用于确认 reaction 打到 issue body 还是 comment。日志不需要输出 comment body；comment node id 也不是业务排障必需字段，优先避免无意义暴露。

## 权衡
不把 comment id 加进 `TimelineMessage`：timeline 是跨 GitHub adapter 的业务对话模型，当前触发和 prompt 构造都不需要 GitHub 专有 id。target 解析放在 runner，能保持 `conversation.ts` 的纯数据边界。

不用 comment URL 解析 REST comment id：URL 解析依赖 GitHub HTML fragment 格式，虽然可行但更脆弱。GraphQL node id 已在 `comments` JSON 内直接可用，且 GraphQL `addReaction` 正好以 node id 为 subject。

不在 comment id 缺失时 fallback 到 issue reaction：需求要求反馈到“最新 comment”。如果 comment target 无法识别，fallback 到 issue 会重新制造误导。更好的失败策略是记录 reaction failure 并继续 Codex，保持主工作不被即时反馈阻断。

## 风险
GraphQL mutation 参数写错会导致 comment reaction 添加失败。单元测试需要覆盖完整参数数组与 `"eyes" -> "EYES"` 映射。

`GitHubIssue.comments` 从只要求 `body` 变为要求 `id`，会影响测试夹具和 shape 校验。实现时应集中更新 `makeIssue` helper，避免大面积测试噪音。

runner 使用 `latestIndex - 1` 映射回 comments 数组，前提是 `buildTimeline` 的 comment index 规则不变。现有 conversation 单测已覆盖 index 规则；本 change 再补一条 runner 级 comment target 测试，防止映射回归。
