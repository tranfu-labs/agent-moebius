# github-issue-runner spec delta

## 修改
- MUST 在 runner 写回 agent 评论时使用 GitHub 页面可见的 `<role>:\n${LAST_RESPONSE}` 前缀；落到 comment body 时 MUST 使用 `&lt;role&gt;:\n${LAST_RESPONSE}`，避免 GitHub Markdown 把 raw `<role>` 当作 HTML 标签吞掉。
- MUST 在归一化 GitHub comments 时兼容旧的 `role:` 可见前缀、当前 `&lt;role&gt;:` 可见前缀，以及可能已存在的 raw `<role>:` 前缀。

## 不变
- MUST 继续在 runner 写回 agent 评论时追加隐藏 metadata `<!-- agent-moebius:role=<role> -->`。
- MUST 继续优先使用隐藏 metadata 识别 runner 生成的 agent comment。
