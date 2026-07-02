# 任务：expand-ceo-issue-context

## 1. CEO 输入契约

- [x] 在 `src/format-ceo.ts` 增加 CEO issue context 类型：`issueUrl`、`issueBody`、按顺序排列的 comment bodies。
- [x] 更新 `FormatCeoInput` 与 `buildCeoPrompt`，用完整公开 issue context 替代短上下文里的 `originalRequest`。
- [x] prompt 文案明确 `latestResponse` 是本轮唯一待发布响应，完整 issue context 只用于理解流程、覆盖指令、反思 hook 历史和交付规范。

## 2. runner 组装上下文

- [x] 在 `src/runner.ts` CEO 调用点构造 `issueUrl = https://github.com/<owner>/<repo>/issues/<number>`。
- [x] 把 `input.issue.body` 和 `input.issue.comments[*].body` 原文传入 CEO context。
- [x] 保留 `lastReflectorHook` 传参和现有 fail-open/post 分支行为不变。

## 3. CEO persona 与事实源

- [x] 更新 `agents/ceo.md` 的输入契约，说明 CEO 会读取 issue 链接、issue body、所有 comments、latestResponse、agent、allowedStages、lastReflectorHook。
- [x] 更新仓库根 `AGENTS.md` 中 CEO guardrail 的上下文范围说明，从短上下文改为完整公开 issue context。
- [x] 更新 `docs/architecture/module-map.md` 中 `ceo-format-guardrail` 的职责描述，从短上下文改为完整公开 issue context。
- [x] 通过 `spec-delta/github-issue-runner.md` 更新当前行为规格。

## 4. 测试

- [x] `tests/format-ceo.test.ts`：断言 prompt 包含 issue URL、issue body、所有 comment body、latestResponse、lastReflectorHook。
- [x] `tests/runner.test.ts`：断言 `processIssueSource` 调用 `formatCeoComment` 时传入完整 issue context，comments 顺序不变。
- [x] 回归现有 CEO fail-open、append、replace、no_change 测试，确保行为分支不变。

## 5. 验收

- [x] `pnpm test` 通过。
- [x] `pnpm typecheck` 通过。
- [x] 不新增 `.state/*` token 统计文件；确认 CEO run 的 stdout/stderr 仍写入 `${runDir}-ceo`，后续可从现有 Codex JSONL 输出统计。
