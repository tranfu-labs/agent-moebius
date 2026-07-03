# 设计：route-ceo-stage-acceptance-feedback

## 方案
### 1. CEO persona 路由规则

在 `agents/ceo.md` 中重写“阶段反思强制介入”小节为“阶段验收回流路由”，保留 `plan-written` / `code-verified` 的阶段入口，但把 append 内容改为验收路由。

路由顺序：

1. 识别 `latestResponse` 最后一个 stage marker。
2. 仅当 stage 为 `plan-written` 或 `code-verified` 时进入本规则；`in-progress` 继续不触发阶段强制 append。
3. 检查可用的验收语句：
   - `plan-written` 必须在 `latestResponse` 里有「验收语句」小节，且小节内存在逐条、可机械执行的检查。
   - `code-verified` 优先从完整公开 issue context 中最近一次有效 `plan-written` 方案读取「验收语句」；若找不到，则视为缺失。
4. 若验收语句缺失或不可逐条核查，CEO 输出 `append as=ceo`，正文 mention `@dev`，要求补齐「验收语句」清单；此分支不 mention 验收角色。
5. 若验收语句存在，CEO 识别发起本需求的 agent 角色，并按下列优先级：
   - issue body 或后续明确流程说明中写明的“需求持有者 / 发起者 / 发起需求角色”。
   - 时间线中最早提出本需求的合法 agent speaker。
   - 若只识别到真人用户，则输出 `no_change`。
6. 识别时不得把执行或转交本任务的 `secretary` 方案评论误判为需求发起者，也不得把 `dev` 的澄清 / 方案评论误判为需求发起者。若上下文明确写明发起者是 `product-manager` 或 `hermes-user`，以该显式信息为准。
7. 发起者是可达 agent 时，CEO 输出 `append as=ceo`，正文 mention 该发起角色：
   - `plan-written`：要求其按验收语句逐条验收方案是否覆盖需求。
   - `code-verified`：要求其按验收语句逐条验收实现证据是否满足。

### 2. 测试策略

更新 `tests/format-ceo.test.ts`，不调用真实 Codex，也不新增 runtime 规则：

- 文本合约测试：读取仓库内 `agents/ceo.md`，断言“阶段反思/验收回流”规则包含“回流给发起需求角色验收”和“缺验收语句时要求补齐”两条路由规则。
- `hermes-user` 发起 + dev `plan-written` 含验收语句：构造完整 issue context 与 latestResponse，fake CEO 返回 `append as=ceo`，正文 mention `@hermes-user` 并引用逐条验收要求；断言 `formatCeoComment` 接受并返回 `APPEND`。
- dev 方案缺验收语句：fake CEO 返回 `append as=ceo`，正文 mention `@dev` 要求补齐「验收语句」；断言 `formatCeoComment` 接受并返回 `APPEND` 且正文包含补齐要求。

### 3. 文档同步

更新 `AGENTS.md` 中 `plan-written` / `code-verified` 阶段描述，使其说明 CEO append 会优先按验收语句回流给需求发起 agent；缺验收语句时要求 dev 补齐。归档时把 spec-delta 合入 `openspec/specs/github-issue-runner/spec.md`。

## 权衡
- 只改 persona，不改 `src/format-ceo.ts`：T2 的范围明确要求业务判据在 persona 层，当前 runtime 已支持 `append as=ceo` 与完整公开 issue context，足够承载本规则。
- 继续使用 `as=ceo`，不伪装成发起角色：`as` 是评论署名身份，验收对象通过正文 mention 表达。这样符合 product-manager 的消歧结论，也避免 CEO 以验收角色身份发言造成时间线归属混乱。
- 使用 fake CEO output 做 shape 测试：真实 persona 推理不适合在单测中调用 Codex；测试重点是锁定 persona 文本合约和 runtime 接受的 append 形态。
- 不为真人用户自动 append：真人用户不是可触发 agent，CEO mention 真人无法形成自动回流；保持 `no_change` 更符合现有人工验收闸门。

## 风险
- 发起角色识别依赖自然语言上下文，persona 可能误判。通过明确优先级、排除 `secretary` 转交评论和 `dev` 执行评论降低误判风险。
- 「可机械执行」仍是文本判断，无法由 runtime 强制。T1 的 dev persona 约束加上 T2 的 CEO 补齐兜底可以形成双层约束。
- 如果 CEO 追加的 mention 触发下一轮 active poll，流程会多一次轮询延迟；这是现有 CEO append 机制的既定行为，不在本次扩展 runtime。

回滚方式：恢复 `agents/ceo.md` 阶段规则到通用反思，删除新增 persona contract 测试，并通过后续 change 修改 spec 与 persona。

## 验证计划

- 文本检查：打开 `agents/ceo.md`，查找阶段规则，确认包含“回流给发起需求角色验收”与“缺验收语句时要求补齐”两条路由规则。
- 单元测试：运行 `pnpm test -- tests/format-ceo.test.ts`，确认 fake CEO append for `@hermes-user` 与缺验收语句补齐分支均被接受。
- 回归命令：运行 `pnpm test` 与 `pnpm typecheck`。
