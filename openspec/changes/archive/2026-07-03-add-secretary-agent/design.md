# 设计：2026-07-03-add-secretary-agent

## 方案
### persona（`agents/secretary.md`）
新增秘书 agent，使用 frontmatter 声明：

```yaml
preScript: src/agent-prescripts/current-repo-workspace.ts
```

正文职责：

- **角色定位**：秘书是 CEO guardrail 的规则维护入口，不是 CEO 本身，也不是普通业务开发 agent。
- **触发场景**：用户指出 CEO 漏判、CEO 应该学习某类提醒、CEO guardrail 规则需要补充时，由 `@secretary` 处理。
- **工作流程**：必须先采访；采访内容至少覆盖触发输入模式、应输出模式、适用 / 不适用边界、是否需要补救当前 issue。本轮信息不足时停下问；信息充足时按 OpenSpec 流程落盘方案、修改 `agents/ceo.md`、更新 specs/tests/docs、提交 PR。
- **修改边界**：优先只改 `agents/ceo.md`、OpenSpec specs/tests/docs。只有 persona 层无法表达时，才扩到 `src/format-ceo.ts`、trigger 或 runner 逻辑。
- **输出契约**：每条响应末尾固定 `<!-- moebius:stage=in-progress -->`。secretary 不使用 `plan-written` / `code-verified`，避免触发 dev 专属阶段语义。

### current repo preScript
新增 `src/agent-prescripts/current-repo-workspace.ts`：

- 导出常量 `CURRENT_REPO_WORKSPACE_PRE_SCRIPT_PATH = "src/agent-prescripts/current-repo-workspace.ts"`。
- `runCurrentRepoWorkspacePreScript()` 通过当前源文件位置解析仓库根目录并返回 `{ ok: true, codexCwd: repoRoot }`。
- 不读取 / 写入 `.state/agent-contexts.json`，不依赖 GitHub issue source，不创建 worktree。
- 不执行外部命令，不处理 issue body/comment 中的任何内容。

将该 preScript 注册到 `src/agent-prescripts/index.ts` 的 `PRE_SCRIPTS`，保持受信任静态 registry 模型。

### runtime 接入
- `agents/*.md` 自动发现机制已有能力：新增 `agents/secretary.md` 后，`@secretary` 会进入 `availableAgentNames` 并可通过普通 mention trigger 运行。
- `src/format-ceo.ts` 的 `CEO_APPEND_ROLES` 增加 `"secretary"`。
- `agents/ceo.md`：
  - 真实可触发 Codex agent 清单增加 `secretary`。
  - 输出契约中的 `as` 允许集合增加 `secretary`。
  - 补充 secretary 与 CEO 的职责边界：secretary 是维护 CEO 规则的人，CEO 不是普通 mention agent。

## 权衡
- **使用 `secretary` 而不是 `ceo-evolver`**：用户选择“秘书”作为角色名。`secretary` 比 `ceo-evolver` 更像协作生态中的长期角色，但职责文档必须明确它只维护 CEO guardrail，避免泛化成任意事务秘书。
- **新增 preScript，而不是依赖 runner 当前 cwd**：普通 agent 默认没有 preScript 时会沿用 runner 进程 cwd，但这属于隐式环境假设。新增受信任 preScript 能把“秘书在当前仓库工作”写成显式契约，也便于测试。
- **不把 `@ceo` 变成普通 agent**：CEO guardrail 当前设计为无状态发布前校正器。让 `@ceo` 直接触发会牵动 thread、trigger 与执行语义，超出“让 CEO 规则可学习”的目标。
- **`secretary` 使用 `in-progress` stage**：它不是 dev，不需要 `plan-written` / `code-verified` 的阶段反思强制介入；具体进度用正文表达。

## 风险
- 如果忘记更新 CEO 生态认知，CEO 可能把 `@secretary` 误判为不存在的协作对象；本 change 将同步更新 `agents/ceo.md` 与 `CEO_APPEND_ROLES`。
- 如果 preScript 根目录解析错误，secretary 可能在错误 cwd 修改文件；需要单元测试覆盖返回路径，并在 runner 测试中覆盖带 preScript agent 的 cwd 传递。
- 回滚方式：删除 `agents/secretary.md` 与 `current-repo-workspace` preScript，移除 registry/CEO 白名单/文档/spec/tests 中的 secretary 条目。

## 验证计划
### 单元测试
- conversation / trigger：`@secretary` 作为普通 mention agent 被选中，secretary 评论可归一化为 `speaker=secretary`。
- format-ceo：`append.as=secretary` 被接受，未知 `as` 仍 fail-open。
- agent preScript：`runCurrentRepoWorkspacePreScript()` 返回 moebius 仓库根目录，不读写 context state。
- runner：带 preScript 的 secretary agent 被触发时，runner 把 preScript 返回的 `codexCwd` 传给 Codex。

### AI / 命令验证
- 执行 `pnpm test`，覆盖新增单元测试与既有回归。
- 执行 `pnpm typecheck`，确认新增 preScript 与 registry 类型正确。
- 人工走查 `agents/secretary.md`：确认它不会要求用户使用 `@dev` 维护 CEO，也不会把 `@ceo` 描述为普通可触发 agent。
