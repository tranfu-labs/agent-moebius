# 里程碑任务 issue 模板

给里程碑任务开 GitHub issue 时使用。循环每轮取一个任务，按本模板生成 issue。

## 使用规则

- 开 issue 前先对照 `docs/roadmap/milestone-standards.md`，确认任务是可验收的垂直切片，质量基准已在里程碑文档显式声明，验收语句可机械执行。
- 占位符：`<里程碑名>` 里程碑标题、`<里程碑文档>` 里程碑文档路径、`<N>` 任务编号、`<任务名>` 里程碑文档中的任务标题、`<任务原文>` 从 `<里程碑文档>` 原样粘贴该任务的目标 / 范围 / 验收语句 / 依赖四节。
- **整个 body 只允许出现一个 `@`**：mention 触发器只认最新消息里第一个命中的合法 mention，一轮只触发一个 agent。除触发目标外，所有角色一律裸写（`product-manager`、`dev`、`ceo`），不带 `@`。
- 触发目标：出题人开 issue 前先自判拆分，二选一——
  - **预判 no_spawn → 直接 `@dev`**（主路径之一）：能写出「倾向 no_spawn + 理由」的任务（文件范围集中、验收面单一），首行直接 `@dev`，并在「协作方式」里保留该预判理由，不再绕 CEO 复述预判。
  - **拆分真不确定 → `@ceo`**：只有跨模块、验收面分散、疑似需并行等拆分真不确定的任务，才首行 `@ceo`，让 CEO 按 `agents/ceo-scripts/milestone-spawn-child-issues.md` 判定"要不要拆 / 怎么拆"——如判"不拆"则由 CEO 显式 `no_spawn` + `@dev` 接续采访；如判"拆"则 CEO spawn 子 issue，子 issue 各自 ping 对应角色（默认 `@dev`）。
  - **例外**：维护 CEO guardrail 或 `agents/ceo.md` 的任务用 `@secretary`（避免自激）。
- issue 开在 agent-moebius 仓库（需在 `config.local.toml` 白名单内），dev 的 worktree 会自动落在本仓库。

## 标题

```
[<里程碑名>] T<N> · <任务名>
```

## Body

首行按「使用规则 · 触发目标」二选一，保持整个 body 只有这一个 `@`：

变体 A（出题人预判 no_spawn，主路径之一）：

```markdown
@dev 出题人已预判本任务倾向 no_spawn（理由见「协作方式」），跳过 CEO 拆分判定，请直接接续采访或产出方案。
```

变体 B（拆分真不确定）：

```markdown
@ceo 请按 `agents/ceo-scripts/milestone-spawn-child-issues.md` 判定本任务是否需要拆成子 issue。
```

其余正文两个变体共用：

```markdown
## 需求来源

本任务来自本仓库 `<里程碑文档>` 的 T<N>。里程碑拆解与任务验收粒度参考 `docs/roadmap/milestone-standards.md`；以下任务原文是唯一需求源，验收语句已在其中定义好，不需要重新挖掘需求：

> <任务原文>

## 协作方式

- **拆分判定**：变体 A——出题人预判 no_spawn，理由：<预判理由，例如文件范围集中、验收面单一>，不经 CEO 拆分判定；变体 B——CEO 先按 milestone-spawn-child-issues 剧本决定要不要拆：如判"拆"，spawn 子 issue 时按冲突感知分组，每个子 issue 注入验收语句与质量基准，并让每个子 issue ping 对应角色；如判"不拆"（本任务为最小垂直切片），显式 `no_spawn` + 理由，并在同评论 ping dev 接续采访（`@dev` 接续）。
- 需求持有者是 product-manager：负责回答 dev 的澄清提问，并在方案与代码完成后按验收语句逐条走查。它只做消歧，不扩需求；任务原文没写的，按"范围最小"处理。
- dev 通读任务原文（或 CEO 拆完后拿到的子任务原文）。若有歧义，mention product-manager 一次性列出全部具体问题，不要分多轮挤牙膏；若无歧义，直接产出方案，不必为了流程而采访。
- 方案（plan-written）按仓库 OpenSpec 纪律落到 openspec/changes/，末尾必须含「验收语句」一节：默认沿用任务原文中的验收语句，如需细化或增补，逐条说明理由。
- 方案先经 qa 测试设计审查（CEO 自动路由，无需 dev 主动艾特 qa），qa 增补的验收语句并入清单；审查通过后由 product-manager 验收，验收通过 dev 直接进入实现，不再需要用户口头放行；实现完成打 code-verified，并为每条验收语句（含 qa 增补）附上可核查的证据（文件路径、测试输出、截图 artifact 链接）。
- 验收全部通过后，在同一改动内把验收证据追记到 `<里程碑文档>` 对应任务下方并勾选该任务（子 issue 全部完成后由父 issue 汇总勾选）。

## 边界

- 本任务属于 `<里程碑名>`，非目标以该里程碑任务原文为准；未列入范围的运行时代码、Figma 流程、issue 拆解编排或 PR 预览基建均不得自行扩入。
- 若发现不越界就无法闭环，停下来在评论中说明卡点，等用户裁决，不要自行扩权。
```
