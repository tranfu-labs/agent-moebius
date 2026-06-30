# 变更工作区（先设计再实现）

## 变更工作流
一次需求或业务变更，MUST 先建一个 `openspec/changes/<change-id>/` 目录、先设计再实现；NEVER 在没有 proposal/design 的情况下直接改实现代码。

## 目录内容
- `proposal.md`：为什么改、改什么、影响面。
- `design.md`：怎么实现、方案与权衡（不含字符图）。
- `tasks.md`：可勾选的任务清单。
- `spec-delta/`：对 `openspec/specs/` 的增删改；先写 delta，实现完成后再合并回 specs。
- `wireframes.md`（可选，本项目扩展）：仅当本次 change 涉及前端路由 / 页面 / 版式变化时新建。画字符图用，基线 MUST 引用 `docs/wireframes/pages/<page>.md`，NEVER 引用其他 change 的 wireframes.md。一个 change 涉及多页用 `## pages/<page>.md` 小节区分；超过 3 页才考虑改目录。后端 / 纯逻辑 change 不要建空文件。
- `architecture/`（可选，本项目扩展）：仅当本次 change 涉及触发链路 / 模块依赖 / 数据流等架构性变化时新建。存两张 svg：`before.svg`（变更前架构快照）与 `after.svg`（变更后架构事实源）。`design.md` MUST 用 `![现状](architecture/before.svg)` / `![改造后](architecture/after.svg)` 引用。基线 MUST 引用 `docs/architecture/` 已有图；NEVER 引用其他 change 的 svg。纯文案 / 局部修复 / 不改架构形态的 change 不要建空目录。

## 推进顺序
MUST 按 proposal → design（+ 必要时 wireframes.md）→ tasks → 实现 → 归档 的顺序推进；spec-delta 与 wireframes.md 都 MUST 在实现完成后、归档时才合并回事实源，NEVER 提前合并。

新建变更 MUST 复制 `_template/` 作为起点。`_template/` 不含 `wireframes.md`——按需新建。

## 归档（change 完成后必做）
MUST 同时完成下面四步，缺一不算归档：

1. **移动 change 目录**：`openspec/changes/<change-id>/` → `openspec/changes/archive/<YYYY-MM-DD>-<change-id>/`（日期为归档日）。
2. **合并 spec-delta → specs**：把 `spec-delta/` 下对应业务域的增删改合并进 `openspec/specs/<domain>/spec.md`，让事实规格反映改完之后的现状。
3. **回流 wireframes.md → docs/wireframes/**（仅当本 change 有 `wireframes.md` 时）：把字符图回填到 `docs/wireframes/pages/<page>.md`；流转变化同步进 `docs/wireframes/flow.md`。
4. **回流 architecture/after.svg → docs/architecture/**（仅当本 change 有 `architecture/after.svg` 时）：把 `after.svg` 复制为 `docs/architecture/<topic>.svg`（成为现状架构事实源），并在 `docs/architecture/module-map.md` 相应小节添加 `![<topic>](<topic>.svg)` 引用；`before.svg` 不回流，保留在 archive 目录作为历史快照。

第 2、3、4 步同等地位——specs 是行为事实源、`docs/wireframes/` 是版式事实源、`docs/architecture/` 是架构事实源，都靠归档动作保持现状。

NEVER 把归档动作写进每个 change 的 `tasks.md`——它是项目级流程，由本文件统一定义。
