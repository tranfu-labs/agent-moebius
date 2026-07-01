# 提案：add-codex-execution-reaction

## 背景
当前 runner 只有在 Codex 完成并成功回写评论后，GitHub issue 页面才出现可见反馈。Codex 执行时间可能较长，用户在等待期间无法从 issue 上判断 runner 是否已经真正进入执行阶段。

这个反馈不能出现在所有触发路径上。deterministic hook 评论、no-trigger、preScript 失败、resume 无新增消息等路径并没有真正调用 Codex driver；如果这些路径也反馈，会误导用户以为本机 Codex 已经开始工作。

## 提案
当 issue 最新消息命中可运行 agent，且 agent preScript 已成功完成、runner 即将调用本机 Codex driver 时，先给当前 GitHub issue 添加 `eyes` reaction。

该 reaction 是“Codex 已开始执行”的即时反馈，只在真实 Codex 执行路径添加：

- mention trigger 选中普通 Codex agent 后添加。
- full run 与 resume run 都添加。
- resume 失败后的 fallback full run 不重复添加。
- no-trigger、stage hook、preScript 失败、prompt plan skip 不添加。

## 影响
- `github-client` 增加 GitHub issue reaction adapter，通过 `gh api` 安全调用 reactions endpoint。
- `github-issue-runner` 在 Codex driver 调用前编排添加 `eyes` reaction，并记录成功或失败日志。
- reaction 添加失败不应阻断 Codex 执行；正式评论发布和状态推进仍沿用现有成功条件。
