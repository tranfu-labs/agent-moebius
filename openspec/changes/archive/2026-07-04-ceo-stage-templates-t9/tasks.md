# 任务：ceo-stage-templates-t9

- [x] 更新 `agents/ceo.md`：在阶段验收回流路由中加入“识别场景 -> 套模板 -> @角色”分发规则。
- [x] 更新 `agents/ceo.md`：加入方案评审固定模板，覆盖模块影响、可行性、核心目标贴合度、过度设计、现有规范遵守、周全性与鲁棒性六项。
- [x] 更新 `agents/ceo.md`：加入执行后复盘固定模板，覆盖符合最初方案、新发现回流、经验沉淀三问。
- [x] 更新 `tests/format-ceo.test.ts`：覆盖 persona 中两份模板和分发规则存在。
- [x] 更新 `tests/format-ceo.test.ts`：构造 dev `plan-written` CEO 校正路径，断言 append 正文含六项清单且唯一合法 mention 指向 qa，即使发起需求角色是 product-manager。
- [x] 更新 `tests/format-ceo.test.ts`：构造 dev `code-verified` CEO 校正路径，断言 append 正文含三问且唯一合法 mention 指向发起需求角色，执行方只裸写 dev。
- [x] 更新 `tests/format-ceo.test.ts`：从 `agents/ceo.md` 固定模板段落与 fake append body 两侧校验同一组条目标签和顺序，防止模板源与 fake 输出漂移。
- [x] 更新 `AGENTS.md` 与 `openspec/specs` 对应 spec delta，记录 CEO 阶段模板规则。
- [x] 跑 `pnpm vitest run tests/format-ceo.test.ts`、`pnpm test`、`pnpm typecheck`、`git diff --check`，修复失败。
