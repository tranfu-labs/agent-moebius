# 提案：add-dev-manager-agent

## 背景
当前系统有两个 Codex driver agent 承担研发链路：`product-manager` 定义"做什么"、`dev` 亲自写代码。中间缺一层**技术负责人**：谁来做技术方向 / 架构选型 / 技术取舍，谁来对交付做质量把关。现在这些判断要么散落在 `dev` 自己身上（既当运动员又当裁判），要么落到 CEO guardrail（它只做发布前的无状态校正，不是技术评审角色）。缺这一层导致技术决策无人显式负责、质量标准不统一。

## 提案
新增一个与 `dev`、`product-manager` 同级、同样以 `agents/<name>.md` 文件名寻址加载的 Codex driver agent：`dev-manager`（技术负责人）。

- 新建 `agents/dev-manager.md` persona，核心职责三块：技术决策、架构选型、质量保证；**永不亲自写代码**。决策以对话形式给出，不落 ADR / design 制品（当决策打破 `module-map` 依赖方向这一 `AGENTS.md` 既有红线时，要求写代码方在实现时补 ADR，自己不落盘）。
- persona 保持通用、自包含：只描述 dev-manager 自身职责与方法论，NEVER 硬编码指向某个具体协作 agent（如 `@dev`）；协作对象一律按"承载 `agents/<name>.md` 的通用对象"表述。
- 按项目"新增 driver agent 的同步义务"接入 runtime：
  - `agents/ceo.md` 生态认知章节的"真实可触发 Codex agent 清单"加入 `dev-manager`。
  - `src/format-ceo.ts` 的 `CEO_APPEND_ROLES` 白名单与 `agents/ceo.md` 的 `as` 允许集合同步加入 `dev-manager`。
- agent 名从 `agents/*.md` 自动发现，`dev-manager.md` 落地后自动进入 `availableAgentNames`：`@dev-manager` 即可触发、其评论也自动归一化为 `speaker=dev-manager`，无需改发现 / 归一化逻辑。

## 影响
- 业务域：`github-issue-runner`。
- 新增文件：`agents/dev-manager.md`。
- 修改文件：`agents/ceo.md`（生态清单）、`src/format-ceo.ts`（`CEO_APPEND_ROLES`）。
- 对外行为：新增可被 `@dev-manager` 触发的 Codex agent；CEO guardrail 不再把 `@dev-manager` 当未知 / 死锁对象，并可用 `as=dev-manager` 追加评论。
- 测试：`tests/conversation.test.ts`（`@dev-manager` 选择 / 归一化）、`tests/format-ceo.test.ts` 等价（`isCeoAppendRole("dev-manager")`）、`tests/runner.test.ts` CEO guardrail 循环纳入 `dev-manager`。
