# 设计：add-codex-execution-reaction

## 方案
在 `src/github.ts` 增加 issue reaction adapter：

```text
addIssueReaction(source, "eyes")
  -> gh api --method POST repos/<owner>/<repo>/issues/<issueNumber>/reactions -f content=eyes
```

adapter 只接收受控的 `IssueSource` 与固定 reaction content，不从 issue body/comment 拼接命令。参数继续走 `spawn(cmd, args[])`，不引入 shell。

runner 的调用点放在 Codex driver 的第一轮执行前：

```text
resolve trigger -> selected agent -> prompt plan run -> preScript ok
  -> add eyes reaction
  -> runCodex(full/resume)
  -> resume failed? fallback runCodex(full) without another reaction
  -> post final agent comment
```

这样 reaction 表示“本轮确实进入本机 Codex driver”，而不是“runner 看见了某条消息”。stage hook 分支只发确定性 hook 评论，不走 reaction；`plan.kind === "skip"` 与 preScript 失败也不会添加 reaction。

reaction 添加失败按非关键反馈处理：记录 `event = "codex-execution-reaction-failed"`、`issueKey`、`agent` 与错误原因，然后继续调用 Codex。理由是 reaction 是即时可见性增强，不应因为 GitHub reaction endpoint 临时失败阻断真正的 agent 工作；后续正式 comment 仍由既有成功路径决定状态是否推进。

## 权衡
选择 GitHub reaction 而不是提前发布“处理中”评论：reaction 更轻，不污染共享时间线，也不会误触发后续 agent mention 或 stage trigger。它同时满足用户对“GitHub 上即时反馈”的要求。

选择在 preScript 成功后添加：preScript 失败时 Codex 不会执行，此时添加 reaction 会违背“只有真正 driver 执行的时候”的边界。

不在 fallback full run 前重复添加 reaction：resume 与 fallback 属于同一次 runner 处理周期，同一轮只需要一次“已开始执行”的反馈。

## 风险
GitHub reactions endpoint 可能因权限、网络或重复 reaction 行为返回失败。实现需把失败降级为日志，不影响 Codex 执行；如果后续正式评论也失败，既有逻辑仍不会推进 role thread 或 intake `updatedAt`。

`gh api` endpoint 或 reaction content 拼写错误会导致看不到即时反馈。单元测试应覆盖构造出的参数数组，降低回归风险。
