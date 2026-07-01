# 任务：ceo-json-output-with-append-mode

## 1. persona 重写
- [ ] 重写 `agents/ceo.md`：输入契约保留；识别场景改成 S1/S2/S3 清单并给正例样本；输出契约改 JSON 三态；模板约束（`> CEO guardrail:` quote、`as` 枚举、`replace` 必带 stage marker）写死到 persona。

## 2. `src/format-ceo.ts` 契约升级
- [ ] `FormatCeoResult` 新增 `APPEND` 分支带 `as` 字段；`FAIL_OPEN` reason 新增 `invalid-json` / `unknown-action` / `unknown-as` / `empty-body`。
- [ ] `parseCeoOutput` 改 JSON 解析（兼容 fenced code block），失败 → FAIL_OPEN。
- [ ] post-validate 分 action：
  - `replace`：末尾 stage marker（沿用）。
  - `append`：`as` 必须在允许集合（`ceo` + driver agent + `reflector`），`body` 非空。
- [ ] `appendCeoCorrectedMetadata` 保持不变（runner 会调用）。

## 3. `src/runner.ts` 发帖分支扩展
- [ ] 在 `formatCeoComment` 调用点后按 `ceoResult.action` 分支：
  - `NO_CHANGE` / `REPLACE`：走现有 `postComment` 单条路径。
  - `APPEND`：先 `postComment` 原 `finalText`（`role=<原 agent>`，不加 `ceo-corrected`），再 `postComment` CEO 追加正文（`role=<as>` + `ceo-corrected`）；`appendPostedComment` 两次拼回 timeline。
- [ ] `logCeoGuardrailResult` 新增 `APPEND` 事件（`event=ceo-guardrail-appended`）。
- [ ] 同轮自反循环不改。

## 4. `src/conversation.ts` speaker 归一化
- [ ] `normalizeComment` 内 `role=ceo` 走特殊分支：不走 `availableAgentNames` 白名单，直接归为 `speaker=ceo`；其他 role 走现有路径。

## 5. 单元测试
- [ ] `tests/format-ceo.test.ts`：JSON 三态正例、fenced 兼容、非法 JSON、缺 action、未知 action、`replace` 缺 stage marker、`append` 缺 `as`、`append` `as` 非法、`ceo-corrected` 早退回归。
- [ ] `tests/conversation.test.ts`：`role=ceo` 归一化为 `speaker=ceo`（不需在 available agents 内）。
- [ ] `tests/runner-*.test.ts`：APPEND 分支 `postComment` 两次调用顺序、前缀、metadata；REPLACE 分支单次调用回归。

## 6. spec 与文档
- [ ] `openspec/specs/github-issue-runner/spec.md`：通过 `spec-delta/github-issue-runner.md` 增删改（本 change 归档时合并）。
- [ ] 更新 `AGENTS.md` 里 CEO guardrail 那段描述（归档步骤里做）。

## 7. 验收
- [ ] `pnpm test` 全绿。
- [ ] `pnpm typecheck` 全绿。
- [ ] 手动 AI 验证用例：
  - dev 评论"是否从当前 HEAD 创建 change/foo 分支" → GitHub issue 上 dev 原话 + CEO `<ceo>:` 追加"同意 @dev 自行推进" + 下一次 poll 内 dev 恢复推进。
  - dev 评论问产品优先级 → CEO `no_change`，只有 dev 原评论。
  - dev 评论缺 stage marker → CEO `replace` 补 marker（回归）。
