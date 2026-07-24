# 提案：ceo-stage-relay-slim

## 背景

以 issue [#126](https://github.com/tranfu-labs/moebius/issues/126)（M4 T6，一个「两个组件改样式 + 单文件回收」的小任务）为样本，编排流程的实录是 15 条评论、约 48 分钟，其中真正产出判断内容的只有 5 条（dev 方案、qa 审查、product-manager 方案验收、dev 实现、product-manager 实现验收）。开销集中在三类：

1. **模板背诵轮**：CEO 在 `plan-written` / `code-verified` 阶段回流时，把「方案评审模板」六项 / 「执行后复盘模板」三问全文抄进交棒评论。而 `agents/qa.md` 自带比六项更细的四步审查方法（经验假设清单、故障矩阵、用例二分、对抗性审查）与豁免判据，`agents/product-manager.md` 自带完整「验收职责」（逐条走查硬格式）。CEO 模板对接收方是重复投喂，且与目标 persona 构成方法论双事实源。
2. **spawn 判定轮**：`docs/roadmap/milestone-task-issue-template.md` 已有例外 (b)「明显不可拆的最小切片可直接 `@dev`」，但主路径默认 `@ceo` 判定；#126 的出题人已在 body 写明「倾向 no_spawn + 理由」，CEO 那轮只是复述出题人的预判。
3. 重复评论（qa ×2、PM 验收 ×2 ×2）——那是 runner 发布重试的 bug，**不在本 change 范围**，另行承接。

## 提案

**精简阶段回流的交棒正文，不动路由本身**：

- `agents/ceo.md`「阶段验收回流路由」保留全部触发判定与路由映射（`plan-written` → `@qa`、`code-verified` → 发起需求角色、缺验收语句 → `@dev` 补齐、真人发起者 → `no_change`、qa 幂等重审），删除六项模板全文、三问模板全文、「不得删项」硬约束与两个全文 JSON 示例；交棒正文改为一行轻交棒，方法论由目标角色 persona 自持。
- `agents/ceo-scripts/plan-review.md` / `post-implementation-retro.md` 文件保留（`src/ceo-scripts.ts` 的 `REQUIRED_CEO_SCRIPT_IDS` 校验依赖其存在，零 TS 改动），正文改为一行轻交棒模板。
- 复盘三问中的流程改进回路（新发现回流、经验沉淀）并入 `agents/product-manager.md`「验收职责」，作为验收结论后的简短附注；「实现是否符合方案」由其既有逐条走查覆盖，不重复。
- `docs/roadmap/milestone-task-issue-template.md`：出题人已能预判 no_spawn 的任务，直接走既有例外 (b) `@dev`；`@ceo` 拆分判定只留给拆分真不确定的任务。

## 为什么不是删掉路由轮

`agents/dev.md` 本次明确不动（用户裁决）：dev 仍在 `plan-written` / `code-verified` 停下等待指示。删掉 CEO 阶段回流会让流程停在 dev 的停等上无人接棒。因此本 change 只削模板税，不动轮次结构；两轮转发仍在，但评论从模板背诵变为一行。

## 影响

- 改：`agents/ceo.md`（阶段回流节精简）、`agents/ceo-scripts/plan-review.md`、`agents/ceo-scripts/post-implementation-retro.md`（正文薄化）、`agents/product-manager.md`（验收职责加复盘附注）、`docs/roadmap/milestone-task-issue-template.md`（触发目标规则）、`tests/format-ceo.test.ts`（模板文本断言与 fixture 同步，纯文本适配）。
- 不改：`agents/dev.md`、`agents/qa.md`、全部 `src/*.ts` 机制码、「交棒完整性裁决（第 0 检查）」、「GitHub 交互协议违规纠偏」（用户裁决保持原样）、验收治理、死锁等待、PR 冲突、免确认放行、其余剧本。
- spec-delta：`github-issue-runner` 域中「方案评审模板六项」「执行后复盘模板三问」两条 MUST 移除，模板套用两条 MUST 改为轻交棒表述，新增 PM 验收复盘附注与「CEO 交棒正文不复制目标 persona 方法论」两条。
- 运行时行为变化：CEO 阶段回流 append 的正文变短；qa / PM 的审查与验收行为不变（方法论来源从「CEO 评论里的模板」变为「自己 persona 里既有方法」，两者本就同源）。
