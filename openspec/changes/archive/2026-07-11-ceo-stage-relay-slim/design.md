# 设计：ceo-stage-relay-slim

## 关键约束（决定改法的三个事实）

1. **dev 停等行为不变**（用户裁决不动 `agents/dev.md`）→ 阶段回流的触发与路由必须原样保留，否则 `plan-written` / `code-verified` 后无人接棒、流程死锁。精简对象只能是交棒正文。
2. **`src/ceo-scripts.ts:6` 的 `REQUIRED_CEO_SCRIPT_IDS` 含 `plan-review` / `post-implementation-retro`**，缺文件会让 `validateCeoScripts` 抛错、runner 启动失败 → 剧本文件保留、只改正文，本 change 零 TS 源码改动。
3. **方法论在目标 persona 已自持**：`agents/qa.md`（四步审查、豁免判据、自路由）、`agents/product-manager.md`（验收职责逐条走查硬格式）。CEO 模板与其构成双事实源，删除 CEO 侧即可，不需要「搬运」。

## 改动明细

### 1. `agents/ceo.md`「阶段验收回流路由」节

保留：触发条件（尾部 stage marker 为 `plan-written` / `code-verified`）、「先检查验收语句」小节全部规则、`plan-written` 不得直接 mention 发起需求角色、qa 幂等重审（不查历史 qa 结论）、qa 审查通过后由 qa 自行交棒、`code-verified` 发起角色识别优先级、真人发起者分支、执行方 dev 只能裸写。

删除 / 改写：

- 删「`plan-review` 剧本固定包含六项，不得删项、合并或自由改写成泛泛提醒」及六项清单全文、对应 JSON 输出示例。
- 删「`post-implementation-retro` 剧本固定包含三问，不得删项、合并或自由改写成泛泛提醒」及三问清单全文、对应 JSON 输出示例。
- 交棒正文要求改写为：**一行轻交棒**——说明当前 stage 事实与请求动作，方法论不进正文。
  - `plan-written` 示例：`{"action":"append","as":"ceo","body":"@qa 本轮方案已输出 \`plan-written\` 且含「验收语句」清单，请按你的测试设计流程审查并给出结论。"}`
  - `code-verified` 示例：`{"action":"append","as":"ceo","body":"@product-manager dev 已输出 \`code-verified\`，请按已确认「验收语句」逐条验收实现证据；任一不通过时指出未过语句、实际观察与期望差异。"}`
- 新增一条防回潮红线：CEO 交棒正文 MUST NOT 复制目标角色 persona 已有的审查 / 验收方法清单（防止模板双事实源再长回来）。

### 2. `agents/ceo-scripts/plan-review.md` / `post-implementation-retro.md`

frontmatter（id / action / title）不动；正文替换为与上面示例一致的一行轻交棒模板（retro 保留 `@{{requester}}` 占位符）。

### 3. `agents/product-manager.md`「验收职责」节

末尾追加一条：验收结论之后附一段简短复盘——① 有无方案当时未考虑、应回流为后续任务或规范修订的新发现；② 有无值得沉淀到规范、persona 或文档的经验；无则各写「无」。不新增轮次、不改逐条走查硬格式。（三问中的「实现是否符合方案」由既有逐条走查覆盖，不重复收录。）

### 4. `docs/roadmap/milestone-task-issue-template.md`

「触发目标」规则改写：出题人开 issue 前先自判拆分——能在 body 写出「倾向 no_spawn + 理由」的（文件范围集中、验收面单一），直接走既有例外 (b) `@dev`，并在协作方式里保留该理由；只有拆分真不确定（跨模块、验收面分散、疑似需并行）才 `@ceo` 按 `milestone-spawn-child-issues` 判定。Body 模板首行相应给出 `@dev` / `@ceo` 两个变体。

### 5. 测试影响（测试门槛评估）

本 change 为 persona / 剧本 / 文档文本改动，**无新增可测逻辑**，不新增单测；既有测试的适配与回归：

- `tests/format-ceo.test.ts`：`:440` 断言 prompt 含「执行后复盘模板」、`:893` / `:906` 的模板 fixture 正文——同步为轻交棒新文本（断言意图不变：persona 拼装包含剧本正文）。
- `tests/ceo-scripts.test.ts`：只断言 id / action / 解析，不受正文影响，应保持全绿。
- AI 验证流程：跑 `pnpm vitest run tests/format-ceo.test.ts tests/ceo-scripts.test.ts tests/ceo-orchestration.test.ts` 与 `pnpm test`、`pnpm typecheck`，全部退出码 0；grep 验证 ceo.md 与两个剧本内不再含六项 / 三问模板全文。

## 权衡

- **保留两轮转发 vs 彻底砍轮次**：砍轮次需要 dev 直接交棒（改 `agents/dev.md`）或 runner 机制化自动交棒（改 TS），均超出本次裁决范围。本 change 的收益上限是「模板税与上下文税归零」，不是「轮次归零」——诚实记账。
- **剧本文件保留 vs 删除**：删除更「干净」但要动 `REQUIRED_CEO_SCRIPT_IDS` + 多个测试；保留文件正文薄化收益相同、改动面小一个数量级。选保留。
- **复盘三问并入 PM vs 删除**：并入保留流程改进回路（新发现回流、经验沉淀），成本仅为验收评论末尾两行；#126 中三问回答质量低的根因是「模板由 CEO 硬塞」，并入 persona 后由角色自律，质量不至更差。选并入（用户裁决）。
