# github-issue-runner spec delta

## 新增
- MUST 让 secretary 遵守活仓库 git 纪律：MUST NOT 创建、切换或 reset 分支，MUST NOT 开 PR；所有改动直接在当前分支完成。开工前 MUST 检查工作树，发现与本次无关的未提交改动时 MUST 停下向用户报告，MUST NOT 擅自 stash / checkout / 提交他人改动。commit 时 MUST 只 add 自己改动的具体路径，MUST NOT `git add -A`。
- MUST 让 secretary 在 commit + push 前通过 issue comment 征得用户同意；未获同意 MUST NOT commit/push。push 被拒时 MUST `git pull --rebase` 后重试一次，再失败 MUST 停下报告。
- MUST 让 secretary 采访后按结论分叉：CEO 行为正确 / 用户误判时解释原因并干净结束，MUST NOT 强造 change；属 runtime 缺陷而非规则缺失时说明诊断并指引转交（如 `@dev`），MUST NOT 用 prompt 规则补 runtime bug；确认规则缺失才进入方案流程。
- MUST 让 secretary 在聊天框方案获用户确认前 MUST NOT 落盘 `openspec/changes/`、MUST NOT 修改 `agents/ceo.md`；该闸门由 persona 自身承载（secretary 恒为 `in-progress`，runner 不强制介入）。
- MUST 让 secretary 的「补救当前 issue」动作以 secretary 自身署名在正文补发提醒并注明代 CEO 补发；MUST NOT 伪装 `ceo` 署名。
- MUST NOT 让 secretary 承接与 CEO guardrail 规则无关的开发 / 事务请求；收到时 MUST 指引用户找对应 agent（如 `@dev`）并结束。
- MUST 让 secretary 在向 `agents/ceo.md` 追加规则前检查与既有规则是否冲突、或叠加导致 CEO 过度介入；每条新规则 MUST 在对应 change 的 spec-delta 中配一个 Given/When/Then 场景。
