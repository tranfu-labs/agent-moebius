# 里程碑任务 issue 模板

给里程碑任务开 GitHub issue 时使用。循环每轮取一个任务，按本模板生成 issue。

## 使用规则

- 占位符：`<N>` 任务编号、`<任务名>` 里程碑文档中的任务标题、`<任务原文>` 从 `docs/roadmap/milestone-1-acceptance-loop.md` 原样粘贴该任务的目标 / 范围 / 验收语句 / 依赖四节。
- **整个 body 只允许出现一个 `@`**：mention 触发器只认最新消息里第一个命中的合法 mention，一轮只触发一个 agent。除触发目标外，所有角色一律裸写（`product-manager`、`dev`），不带 `@`。
- 触发目标：默认 `@dev`；**T2（改 agents/ceo.md）例外，用 `@secretary`**，其余内容不变。
- issue 开在 agent-moebius 仓库（需在 `config.local.toml` 白名单内），dev 的 worktree 会自动落在本仓库。

## 标题

```
[里程碑1] T<N> · <任务名>
```

## Body

```markdown
@dev 请执行以下里程碑任务。

## 需求来源

本任务来自本仓库 `docs/roadmap/milestone-1-acceptance-loop.md` 的 T<N>。以下任务原文是唯一需求源，验收语句已在其中定义好，不需要重新挖掘需求：

> <任务原文>

## 协作方式

- 需求持有者是 product-manager：负责回答你的澄清提问，并在方案与代码完成后按验收语句逐条走查。它只做消歧，不扩需求；任务原文没写的，按"范围最小"处理。
- 你先通读任务原文。若有歧义，mention product-manager 一次性列出全部具体问题，不要分多轮挤牙膏；若无歧义，直接产出方案，不必为了流程而采访。
- 方案（plan-written）按仓库 OpenSpec 纪律落到 openspec/changes/，末尾必须含「验收语句」一节：默认沿用任务原文中的验收语句，如需细化或增补，逐条说明理由。
- 方案经 product-manager 验收、用户放行后才进入实现；实现完成打 code-verified，并为每条验收语句附上可核查的证据（文件路径、测试输出、截图 artifact 链接）。
- 验收全部通过后，在同一改动内把验收证据追记到 `docs/roadmap/milestone-1-acceptance-loop.md` 对应任务下方并勾选该任务。

## 边界

- 本任务属于里程碑 1，非目标：不改运行时代码（src/ 下任何文件）、不做 Figma 流程、不做 issue 拆解编排、不上 PR 预览基建。
- 若发现不越界就无法闭环，停下来在评论中说明卡点，等用户裁决，不要自行扩权。
- 进入实现、push、建 PR、删除类操作仍需用户明确放行。
```
