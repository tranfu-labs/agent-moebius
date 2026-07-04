# 设计：ceo-stage-templates-t9

## 方案

### 1. 模板位置
把两份模板直接落在 `agents/ceo.md`，而不是新增独立模板文件。

原因：
- `format-ceo.ts` 当前只把 `agents/ceo.md` 作为 persona 输入；新增独立模板文件若要自动注入 CEO prompt，就会变成运行时代码改动，越出 T9 范围。
- CEO 阶段模板是业务判据和文案骨架，属于 persona 责任边界，符合 module-map 中 `ceo-format-guardrail` 的分工。
- 单文件更新能减少与 T2/T5/T8 相邻 CEO persona 规则的同步成本。

### 2. 分发规则
在「阶段验收回流路由」开头增加明确流程：

1. 识别 stage：只在 `latestResponse` 尾部 stage marker 为 `plan-written` 或 `code-verified` 时进入阶段模板分发。
2. 检查可用验收语句：沿用既有缺验收语句分支，缺清单时 mention dev 要求补齐，不套两份模板。
3. 套模板：
   - `plan-written`：套「方案评审模板」，唯一 mention 是 qa。
   - `code-verified`：套「执行后复盘模板」，唯一 mention 是发起需求角色；若只能识别真人用户，仍 `no_change`。
4. 其他场景：不套阶段模板，按既有场景规则自由判断。

### 3. 方案评审模板
模板正文固定包含以下六项，不允许 CEO 临场删项：

1. 对其他模块的影响：依赖边界、module-map、禁止依赖方向是否受影响。
2. 可行性：技术路径是否已验证，或是否有仓库内先例 / 测试支撑。
3. 核心目标贴合度：方案是否直接服务本任务目标，是否跑偏。
4. 过度设计：是否能用更小改动完成，是否引入不必要抽象 / 文件 / 运行时能力。
5. 现有规范遵守：是否遵守 OpenSpec、AGENTS.md、GitHub 交互协议、验收治理。
6. 周全性与鲁棒性：意外情况、失败路径、边界条件是否覆盖。

建议 append 骨架：

```text
@qa 本轮方案已输出 `plan-written` 且含「验收语句」清单，请按固定方案评审模板审查：

1. 对其他模块的影响：检查依赖边界、module-map 与禁止依赖方向是否受影响。
2. 可行性：检查技术路径是否已验证，或是否有仓库内先例 / 测试支撑。
3. 核心目标贴合度：检查方案是否直接服务本任务目标，是否跑偏。
4. 过度设计：检查是否能用更小改动完成，是否引入不必要抽象 / 文件 / 运行时能力。
5. 现有规范遵守：检查是否遵守 OpenSpec、AGENTS.md、GitHub 交互协议与验收治理。
6. 周全性与鲁棒性：检查意外情况、失败路径、边界条件是否覆盖。

请按你的测试设计流程给出审查结论；如需增补验收语句，请标注为测试设计建议，等待需求持有者确认后才并入正式清单。
```

### 4. 执行后复盘模板
模板正文固定包含以下三问，不允许 CEO 临场删项：

1. 实现是否符合方案最初设计：偏差逐条列出，并说明是否可接受。
2. 有无新发现是方案当时没考虑到、其实应该做得不一样的：回流为后续任务或规范修订。
3. 本次执行有无新经验值得沉淀：沉淀到规范、persona 或文档。

建议 append 骨架中的唯一 mention 替换为识别出的发起需求角色：

```text
@product-manager 请按已确认方案中的「验收语句」逐条验收本次实现证据，并按固定执行后复盘模板给出结论：

1. 实现是否符合方案最初设计：请对照方案逐条说明，偏差逐条列出，并判断是否可接受。
2. 有无新发现是方案当时没考虑到、其实应该做得不一样的：如有，请回流为后续任务或规范修订建议。
3. 本次执行有无新经验值得沉淀：如有，请指出应沉淀到规范、persona 或文档的位置。

同时请检查 dev 提供的测试输出、文件路径或 artifact 证据是否足以支撑每条验收语句；任一不通过时，请指出未过语句、实际观察与期望差异。
```

实际 persona 中不硬编码 `product-manager`，而写成“发起需求角色”；示例保留 `product-manager` 是为了说明 code-verified 场景中唯一 mention 的形态。

### 5. 测试策略
新增或更新 `tests/format-ceo.test.ts`：

- persona 文本测试：
  - `agents/ceo.md` 包含“方案评审模板”和六项固定清单。
  - `agents/ceo.md` 包含“执行后复盘模板”和三项固定问题。
  - `agents/ceo.md` 包含“识别场景 -> 套模板 -> @角色”分发规则。
- CEO 校正路径测试：
  - 构造 dev `plan-written` latestResponse，即使完整公开 issue context 中发起需求角色是 product-manager，fake `runCodex` 也返回含六项清单与 qa mention 的 append JSON；断言 `formatCeoComment` 返回 `APPEND`，正文含全部六项，且唯一合法 mention 指向 qa。
  - 构造 dev `code-verified` latestResponse + 历史 plan-written issue context，fake `runCodex` 返回含三问与发起需求角色 mention 的 append JSON；断言 `formatCeoComment` 返回 `APPEND`，正文含全部三问，唯一合法 mention 指向发起需求角色，并且执行方只裸写 dev、不额外 mention。
- 模板漂移保护：
  - 在 `agents/ceo.md` 中给两份固定模板保留稳定标题和有序条目标签。
  - 测试从 persona 对应模板段落提取条目标签，同时检查 fake append body 中出现同一组标签且顺序一致。
  - 若 `agents/ceo.md` 的方案评审六项任一缺失，或 fake append body 与模板段落条目不一致，`pnpm vitest run tests/format-ceo.test.ts` 必须失败。

这些测试不证明 LLM 每次都必然服从 persona，但它们锁住两件可确定事实：persona 中存在固定模板，CEO guardrail 发布路径能接受并保留模板化 append 正文。由于 T9 明确不改运行时代码，业务判据不能下沉到 TypeScript。

### 5.1 审查可见性
本 change 的 source of truth 仍是 `openspec/changes/ceo-stage-templates-t9/`。同时，为避免其他 agent 因 worktree / 分支不可见而只能看到时间线摘要，重出 `plan-written` 时必须在评论正文摘要中包含：

- 模板落点：直接写入 `agents/ceo.md`，不新增模板文件。
- plan-written 路由：唯一合法 mention 指向 qa，正文含方案评审六项。
- code-verified 路由：唯一合法 mention 指向发起需求角色，正文含复盘三问，执行方裸写 dev。
- 测试策略：persona 模板段落与 fake append body 两侧校验，防止模板源与测试输出漂移。
- 实现边界：不改 `src/` 运行时代码。

### 6. 不改项
- 不新增 `src/` 代码。
- 不新增模板加载机制或新状态文件。
- 不改变 `format-ceo.ts` 的 JSON parser / post validate 红线。
- 不改变 qa、product-manager、hermes-user 的响应契约；它们收到 CEO append 后仍按既有 persona 验收或审查。

## 权衡
- 选择 `agents/ceo.md` 而非独立模板文件：牺牲模板复用的文件边界，换取无需运行时代码改动和更稳定的 CEO prompt 输入。
- 选择 deterministic fake Codex 测试而非真实 Codex e2e：牺牲真实模型服从性的覆盖，换取 CI 稳定性；persona 文本断言补足模板存在性。
- 保留 CEO 自由判断兜底：两份模板只覆盖 `plan-written` / `code-verified` 且验收语句可用的阶段回流，避免把协议违规、PR 冲突、死锁等待等场景误套成阶段模板。

## 风险
- Persona 变长可能增加 CEO prompt 负担。缓解：模板只加在阶段验收章节，使用固定短清单，避免复制大段背景。
- CEO 可能在 append 正文里加入第二个 mention。缓解：persona 明确每份模板唯一 mention；既有 GitHub 交互协议违规场景会纠偏多 mention。
- code-verified 模板要提醒“验收方与执行方”，但协议只允许一个 mention。缓解：唯一 mention 发起需求角色，执行方写作裸 `dev`。
- Fake CEO 输出测试可能与 persona 模板漂移。缓解：测试从 persona 固定模板段落和 fake append body 两侧校验同一组条目标签与顺序。
- 纯文案/persona 改动仍可能影响协作行为。缓解：更新 spec、AGENTS 和 `format-ceo` 测试，并在实现阶段运行 `pnpm vitest run tests/format-ceo.test.ts`、`pnpm test`、`pnpm typecheck`、`git diff --check`。
