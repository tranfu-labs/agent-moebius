# 任务：ceo-stage-relay-slim

- [x] T1 `agents/ceo.md`：精简「阶段验收回流路由」——删六项 / 三问模板全文、「不得删项」约束与全文 JSON 示例，改写为一行轻交棒要求 + 新增「不复制目标 persona 方法论」红线；触发判定、验收语句检查、路由映射、真人发起者分支全部原样保留。
- [x] T2 `agents/ceo-scripts/plan-review.md`、`agents/ceo-scripts/post-implementation-retro.md`：frontmatter 不动，正文替换为一行轻交棒模板（retro 保留 `@{{requester}}` 占位符）。
- [x] T3 `agents/product-manager.md`：「验收职责」末尾追加复盘附注要求（新发现回流 / 经验沉淀，无则写「无」）。
- [x] T4 `docs/roadmap/milestone-task-issue-template.md`：触发目标规则改写——预判 no_spawn 直接 `@dev`（例外 (b) 升为主路径之一），`@ceo` 判定留给拆分真不确定的任务；body 模板给出两个首行变体。
- [x] T5 `tests/format-ceo.test.ts`：同步模板文本断言与 fixture 为轻交棒新文本。
- [x] T6 回归验证：`pnpm vitest run tests/format-ceo.test.ts tests/ceo-scripts.test.ts tests/ceo-orchestration.test.ts` 退出码 0；`pnpm test`、`pnpm typecheck` 退出码 0；`rg "固定包含六项|固定包含三问|固定方案评审模板|固定执行后复盘模板" agents/` 命中 0。

## 验收语句

1. 打开 `agents/ceo.md` → 「阶段验收回流路由」节应保留触发判定 / 验收语句检查 / 路由映射 / 真人发起者分支，且不再含六项、三问模板全文与「不得删项」约束；应含「交棒正文 MUST NOT 复制目标角色 persona 已有方法清单」红线。
2. 打开 `agents/ceo-scripts/plan-review.md` 与 `post-implementation-retro.md` → frontmatter 的 id / action 不变，正文为一行轻交棒（retro 含 `@{{requester}}`），不含六项 / 三问清单。
3. 打开 `agents/product-manager.md` → 「验收职责」应含验收结论后附简短复盘（新发现回流 / 经验沉淀，无则写「无」）的要求。
4. 打开 `docs/roadmap/milestone-task-issue-template.md` → 应看到「出题人预判 no_spawn → 直接 `@dev`」为显式主路径，`@ceo` 判定仅用于拆分真不确定的任务，body 模板含两个首行变体。
5. 跑 `rg "固定包含六项|固定包含三问|固定方案评审模板|固定执行后复盘模板" agents/` → 命中 0。
6. 跑 `pnpm vitest run tests/format-ceo.test.ts tests/ceo-scripts.test.ts tests/ceo-orchestration.test.ts` → 退出码 0。
7. 跑 `pnpm test` 与 `pnpm typecheck` → 退出码 0（含 `REQUIRED_CEO_SCRIPT_IDS` 加载校验仍通过，证明剧本文件保留有效）。
8. 打开 `agents/dev.md`、`agents/qa.md` 与 `src/` 任意 TS 文件的 git diff → 应无改动（本 change 边界）。
