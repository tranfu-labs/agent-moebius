# 提案：fix-angle-bracket-role-comments

## 背景
role thread 协议要求 runner 写回 GitHub 的 agent comment 带有可见 `<role>:` 前缀，让人和后续 agent 都能明确 speaker。当前实现写回的是 `role:`，没有尖括号；如果直接改成 raw `<role>:`，GitHub Markdown 会把 `<...>` 当作 HTML 标签处理，页面上可能只显示冒号或丢失 role 文本。

因此写回模板需要使用 GitHub 页面可见的转义形式，同时读取历史评论时继续兼容旧模板，避免已有 issue 时间线被归一化成 `user`。

## 提案
- 写回 GitHub comment 的可见前缀改为 `&lt;role&gt;:\n${LAST_RESPONSE}`，页面渲染后显示为 `<role>:`。
- 隐藏 metadata 继续使用 `<!-- agent-moebius:role=<role> -->`，作为机器识别的优先依据。
- speaker 归一化兼容三种可见前缀：
  - 旧模板：`role:`
  - 转义模板：`&lt;role&gt;:`
  - raw 模板：`<role>:`
- 补充单元测试覆盖写回模板、metadata 评论归一化、legacy 评论归一化。

## 影响
- 影响 `conversation-protocol` 中的评论格式化与 role envelope 剥离逻辑。
- 影响 `github-issue-runner` 的对外 GitHub comment 可见格式。
- 不改变 Codex 执行方式、role thread 状态结构、GitHub API 调用方式或 agent mention 选择规则。
