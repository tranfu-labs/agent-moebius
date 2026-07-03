# 提案：add-acceptance-walkthrough-personas

## 背景
里程碑 1 的 T1 已要求 dev 在 `plan-written` 阶段产出「验收语句」，T2 已让 CEO guardrail 在 `plan-written` / `code-verified` 后把验收请求回流给发起需求角色。

当前 `agents/hermes-user.md` 与 `agents/product-manager.md` 还没有稳定的验收职责描述。它们被 mention 请求验收时，可能只给泛泛反馈，无法逐条对齐 dev 提供的验收语句，也无法在不通过时明确回流给 `@dev`。

## 提案
修改 `agents/hermes-user.md` 与 `agents/product-manager.md`：

- 增加「验收职责」规则，说明被 mention 请求验收方案或实现时，必须按验收语句逐条走查。
- 规定输出结构：每条验收语句一行，格式包含 `通过` 或 `不通过`，并给出依据。
- 规定全部通过时，声明验收通过，并说明下一步等待谁。
- 规定任一不通过时，必须 mention `@dev`，并指出未过语句与期望差异。
- 区分方案阶段与代码阶段依据：方案阶段基于阅读方案推演；代码阶段基于 dev 提供的测试输出、截图 artifact、文件路径等证据。

同步 `github-issue-runner` spec-delta，记录验收角色 persona 的行为契约。

## 影响
- 受影响模块：`agents` Markdown persona。
- 源码行为改动范围：`agents/hermes-user.md`、`agents/product-manager.md`。
- 验证配套：不新增或修改测试文件；通过文本检查、模拟验收请求 dry-run、现有 `pnpm test` 与 `pnpm typecheck` 确认变更未破坏项目。
- 受影响事实源：`openspec/specs/github-issue-runner/spec.md`（通过本 change 的 spec-delta 归档后合入）。
- 不改运行时代码，不修改 `src/`。
- 不做 Figma 流程、issue 拆解编排或 PR 预览基建。
