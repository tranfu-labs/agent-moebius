# 提案：expand-ceo-issue-context

## 背景

当前 CEO guardrail 只接收 `originalRequest`、`latestResponse`、`agent`、`allowedStages`、`lastReflectorHook` 这组短上下文。它能处理单轮格式和推进问题，但看不完整体 issue 约束：用户可能在 issue body 定义全局流程，也可能在后续 comment 临时改流程；reflector hook 的历史 metadata 也可能影响 CEO 对反思轮次的判断。

用户已确认先采用乐观策略：让 CEO 读取完整公开 issue 上下文，包括 issue body、所有 comments、issue 链接；token 统计暂不新增额外功能，沿用现有 Codex JSONL 输出与当前日志能力。

## 提案

把 CEO 输入从短上下文升级为完整公开 issue context：

1. runner 在调用 `formatCeoComment` 前，基于当前 `IssueSource` 和已拉取的 `GitHubIssue` 组装 `issueContext`。
2. `issueContext` 包含 `issueUrl`、`issueBody`、按 GitHub 返回顺序排列的所有 comment body 原文。
3. `format-ceo.ts` 的 prompt 使用完整 `issueContext`，同时继续突出 `latestResponse` 是 CEO 本轮唯一待发布/审查的 agent 响应。
4. 继续传 `agent`、`allowedStages`、`lastReflectorHook`，避免破坏现有 CEO 判定入口。
5. 不新增独立 token 统计功能。

## 影响

- **`src/runner.ts`**：CEO 调用入参从 `originalRequest: input.issue.body` 扩展为完整 issue context，并构造 issue 链接。
- **`src/format-ceo.ts`**：`FormatCeoInput` 与 `buildCeoPrompt` 增加完整 issue context；prompt 文案从“短上下文”改为“完整公开 issue 上下文”。
- **`agents/ceo.md`**：输入契约同步说明 CEO 可读取 issue 链接、issue body、所有 comments、latestResponse 等字段。
- **`AGENTS.md`**：同步项目操作手册里 CEO guardrail 的上下文范围说明，避免继续描述为短上下文。
- **`docs/architecture/module-map.md`**：同步 `ceo-format-guardrail` 模块职责。
- **`openspec/specs/github-issue-runner/spec.md`**：归档时移除 “MUST NOT 把完整 issue timeline 传给 CEO” 约束，改为 MUST 传完整公开 issue context。
- **测试**：覆盖 runner 传递完整 context、prompt 包含 issue 链接/body/comments、仍保留 `lastReflectorHook` 与 fail-open 逻辑。
