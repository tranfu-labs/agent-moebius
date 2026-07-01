# github-issue-runner spec delta

## 新增业务规则
- MUST support interrupting an in-flight `dev` Codex run when the source conversation receives a new message before Codex completes.
- MUST model agent-run interruption through a driver-agnostic conversation snapshot abstraction, so drivers provide current conversation state instead of embedding GitHub-specific logic in the local script executor.
- MUST use GitHub issue body + comments count as the GitHub conversation snapshot message count for new-comment interruption.
- MUST terminate the Codex child process when an agent-run interrupt fires, and MUST treat the interrupted run as unsuccessful even if the process exits cleanly afterward.
- MUST NOT post a GitHub comment or update `.state/role-threads.json` after an interrupted Codex run.
- MUST keep the interrupted issue active and schedule a follow-up poll without advancing processing to the newly arrived message's `updatedAt`.

## 新增场景
### 场景 23：Dev agent — 新 comment 打断正在运行的 Codex
Given 最新消息触发 `@dev`
And runner 已基于当前 timeline 启动 Codex
When Codex 尚未完成时该 issue 新增一条 comment
Then runner 中断该 Codex 子进程
And 不发布该次 Codex 的 GitHub comment
And 不更新该 issue + `dev` 的 role thread state
And intake state 保持该 issue active，等待下一轮用包含新 comment 的 timeline 重新处理

### 场景 24：中断检测 — driver 只提供 conversation snapshot
Given 一个 driver 可以读取当前 conversation message count
When 当前 message count 大于 Codex 启动时的 baseline message count
Then 通用中断 monitor 产生 `new-message` interrupt
And monitor 不需要知道该 driver 是否来自 GitHub
