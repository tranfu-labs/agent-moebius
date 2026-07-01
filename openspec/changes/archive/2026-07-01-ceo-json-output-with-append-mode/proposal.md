# 提案：ceo-json-output-with-append-mode

## 背景

当前 CEO guardrail 只能对 driver agent 评论做**改写**（`REPLACE`）或不动（`NO_CHANGE`）。这带来两个问题：

1. **新场景无处安放**：dev 停下来问用户"是否 X"（比如"是否从当前 HEAD 创建 `change/reflow-skills-trend-window` 分支"），而 X 属于 dev 本可自主裁决的范围时，CEO 应该表态"同意 @dev 自行推进"。当前契约下，只能把这段话塞进 dev 的评论里改写它——语义上强扭 dev 说话。
2. **改写破坏一致性**：
   - Codex thread resume 记住的是原始 dev 输出，timeline 里那条评论却被改写过，dev 下轮看到"改过的自己"会困惑。
   - LLM prompt cache 是前缀缓存；改写 timeline 中间的评论 → 破坏所有后续 tokens 的缓存命中。

## 提案

把 CEO 输出契约从"字符串（`NO_CHANGE` / 完整正文）"升级为 **JSON + 显式 `action`**，同时新增 `append` 模式让 CEO 追加一条独立评论，`as` 字段决定这条评论以谁的身份贴出去（`ceo` 自己、或扮演 `dev` / `product-manager` / `hermes-user` / `reflector` 等 role）。

新契约：

```json
{"action":"no_change"}
{"action":"replace","body":"<改写后的完整原 agent 正文，末尾必带合法 stage marker>"}
{"action":"append","as":"<role>","body":"<以该 role 身份追加的独立评论正文>"}
```

三种识别场景在 `agents/ceo.md` 里显式列出并各配模板样本；code 层只做基础格式红线校验（合法 JSON、`action` 枚举、`as` 已知 role、`replace` body 末尾有 stage marker），业务判据全部靠 CEO persona 自决。

## 影响

- **`agents/ceo.md`**：persona 全量重写（输入契约保留，识别场景 + 输出契约 + 模板全部替换）。
- **`src/format-ceo.ts`**：解析改 JSON；`FormatCeoResult` 新增 `APPEND` 分支带 `as` 字段；post-validate 分 action 分支。
- **`src/runner.ts`**：CEO 调用点后新增 `APPEND` 发帖分支，一次贴两条评论（原 agent 原话 → CEO 追加）；同轮自反循环不动，靠后续 active poll 拉起下一轮。
- **`src/conversation.ts`**：`normalizeComment` 增加 `role=ceo` 特殊分支，绕过 `availableAgentNames` 白名单直接归为 `speaker=ceo`；`agents/ceo.md` 有 frontmatter 声明或不声明，CEO 本身不参与 mention codex 触发。
- **`openspec/specs/github-issue-runner/spec.md`**：CEO guardrail 相关行为条目大量增删改。
- **单元测试**：`format-ceo.test.ts`、`conversation.test.ts`、runner 相关测试新增/回归。
- **AGENTS.md**：CEO guardrail 一段描述更新，`agents/` 里 role 命名空间说明增加 `ceo` 特殊性。
- 对外行为可见变化：GitHub issue 上会出现独立的 `<ceo>:` 评论（S2/S3 场景），`<dev>:` 原话保持不动；S1 场景（stage marker 补齐）行为不变。
