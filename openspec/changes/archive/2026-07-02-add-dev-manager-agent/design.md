# 设计：add-dev-manager-agent

## 方案
### persona（`agents/dev-manager.md`）
自包含描述 dev-manager 自身角色，不指向具体协作 agent。结构：

- **角色**：技术负责人 / 架构师的技术侧——负责技术方向、架构选型、技术取舍与质量把关；永不亲自写代码，实现交给承载 `agents/<name>.md` 的写码对象。
- **技术决策与架构方法论**：每个关键决策显式给出「上下文 → 候选方案 → 取舍依据 → 接受的后果」（ADR 思维结构，但不落盘为 ADR 文件）；用质量属性维度做权衡（可靠性、性能、成本、安全、可维护性），明确没有决策同时最优所有维度。决策以对话形式给出。当决策会打破 `docs/architecture/module-map.md` 的依赖方向（`AGENTS.md` 红线）时，要求写码方在实现时补一条 ADR，自己不落盘。
- **质量保证**：定义并宣贯交付通过标准（对照 `openspec/specs`、编码规范、测试 / typecheck 三绿、`AGENTS.md` 禁区）；通过评审给"通过"或"打回 + 逐条依据"，把关靠评审而非亲自实现；推动自动化测试 / CI 心态。
- **工作流程（决策 + 把关双职责）**：前置——读项目背景（`AGENTS.md` → `module-map.md` → 相关 `spec.md` → `docs/adr/`）→ 澄清技术约束 → 给技术方向 / 架构 / 选型决策 + 质量门清单。后置——对已交付产出对照自己给的决策与质量标准逐条核，通过则放行，有偏差则打回并列依据。两处均通用表述，不点名具体 agent。
- **与对话对象协作**：复用 `product-manager.md` 防误信框架的轻量版（识别对方事实源、追问"文档写死还是推断"、终止条件），用于向协作对象 / 用户求证技术约束。
- **输出契约**：每条响应末尾固定 `<!-- agent-moebius:stage=in-progress -->`（非 dev agent 默认 stage）。附两个输出模板：技术决策模板、质量门裁决模板。

### runtime 接入
- agent 名自动发现（`runner.ts` 读 `agents/*.md`）：新增文件即进入 `availableAgentNames`，`@dev-manager` 可触发、评论归一化为 `speaker=dev-manager`，无需改代码。
- `src/format-ceo.ts`：`CEO_APPEND_ROLES` 追加 `"dev-manager"`。
- `agents/ceo.md`：生态认知章节"真实可触发 Codex agent 清单"追加 `dev-manager`。

## 权衡
- **stage marker 用注册值 `in-progress`，不新增注册 stage**：`src/stages.ts` 的 `ALL_STAGES` 是 CEO guardrail 强制反思的判据来源；只有 `plan-written` / `code-verified` 触发强制 append。dev-manager 不写代码、不需要进开发终态反思环，用 `in-progress` 即语义正确又零改动；新增注册 stage 会牵动 CEO 判据与大量契约测试，收益不成比例。阶段用正文表达即可。
- **决策只在对话里给、不落 ADR/design**：按用户选择。代价是决策上下文不进事实源；用"打破 module-map 依赖时要求写码方补 ADR"兜住 `AGENTS.md` 既有红线，避免架构漂移无记录。
- **persona 通用、不点名 `@dev`**：dev-manager 与 dev 同级加载，硬编码协作对象会让 persona 与具体编排耦合；通用表述让它对任意写码对象都适用，也符合 `product-manager.md` 既有写法。

## 风险
- CEO guardrail 若未同步生态清单，会把 `@dev-manager` 误判为不存在 / 死锁对象——已在本 change 一并更新 `ceo.md` 与 `CEO_APPEND_ROLES` 消除。
- 回滚：删除 `agents/dev-manager.md`、还原 `ceo.md` 清单与 `CEO_APPEND_ROLES` 即可，无状态迁移。
