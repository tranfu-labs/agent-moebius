# 设计：expand-ceo-issue-context

## 方案

### 1. 输入模型

在 `src/format-ceo.ts` 中新增 CEO 专用输入结构，避免把 GitHub adapter 类型直接扩散到 CEO prompt 构造逻辑：

```ts
interface CeoIssueCommentContext {
  body: string;
}

interface CeoIssueContext {
  issueUrl: string;
  issueBody: string;
  comments: CeoIssueCommentContext[];
}
```

`FormatCeoInput` 用 `issueContext: CeoIssueContext` 替代 `originalRequest: string`。`originalRequest` 的语义由 `issueContext.issueBody` 承接。

### 2. runner 组装 issue context

在 `src/runner.ts` 的 mention Codex 分支中，调用 CEO 前构造：

```ts
const issueContext = {
  issueUrl: `https://github.com/${input.source.owner}/${input.source.repo}/issues/${input.source.issueNumber}`,
  issueBody: input.issue.body,
  comments: input.issue.comments.map((comment) => ({ body: comment.body })),
};
```

`format-ceo.ts` 仍不读取 GitHub、不读取 `.state/*`，也不自己构造 timeline；它只消费 runner 传入的公开 issue context，符合模块地图里 `ceo-format-guardrail` 的边界。

### 3. prompt 格式

`buildCeoPrompt` 文案从“短上下文”改为“完整公开 issue 上下文”，并明确：

- `latestResponse` 是本轮唯一待发布的 agent 响应。
- `issueContext` 只用于理解用户流程、后续覆盖指令、反思 hook 历史和交付规范。

字段顺序：

1. `agent`
2. `allowedStages`
3. `issueContext.issueUrl`
4. `issueContext.issueBody`
5. `issueContext.comments`，按 `#<index> comment:` 逐条列出，保留 body 原文和隐藏 metadata
6. `latestResponse`
7. `lastReflectorHook`

保留 comments 原文中的 metadata 是有意为之：`role`、`stage`、`stage-hook`、`ceo-corrected` 都是 CEO 判断反思轮次、speaker 和循环防护的重要信号。

### 4. token 统计口径

本 change 不新增 token 统计功能。CEO 的 stdout/stderr 仍写到独立 runDir（`${input.runDir}-ceo`），Codex JSONL 原始 `turn.completed.usage` 仍留在 stdout 文件中。后续若需要专门统计 CEO token，另起 change 扩展 usage 解析和日志。

## 权衡

- 接受完整 comments 而不是窗口裁剪：满足用户“先乐观一点”的要求，代价是长 issue 成本和延迟增长。
- 保留 `lastReflectorHook`：虽然完整 comments 已包含 hook，但该字段是现有 CEO persona 的稳定入口，保留能降低推理负担。
- 不传归一化 timeline：用户要求 CEO 读取所有 body/comment 原文和 issue 链接；原始 comments 更贴近 GitHub 公开事实。

## 风险

- **长 issue 导致 CEO 超时或成本上升**：沿用现有 CEO timeout 与 fail-open 行为。
- **历史过期评论影响 CEO 判断**：prompt 明确 `latestResponse` 是唯一待发布对象，issue context 只作为背景。
- **metadata 暴露给 CEO 后导致过度依赖格式细节**：这是有意暴露，metadata 是判断 stage/role/hook 的必要输入。

## 自审

- 没有让 `format-ceo.ts` 依赖 GitHub adapter 或状态文件。
- 明确更新当前 OpenSpec 中的 `MUST NOT 把完整 issue timeline 传给 CEO`，不会形成规格冲突。
- 不新增 token 统计功能，符合用户确认。
- reflector 反思后已补充 `AGENTS.md` 更新任务。
