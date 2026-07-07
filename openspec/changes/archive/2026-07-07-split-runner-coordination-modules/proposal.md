# 提案：split-runner-coordination-modules

## 背景

`src/runner.ts` 当前约 4200 行，已经同时承担心跳装配、单 issue 主流程、验收 pre-pass、外部无 mention 路由、roundtable recovery、CEO 编排副作用、Codex reaction、媒体准备、artifact 发布、CEO guardrail 发布边界、run manifest 写入等多类协调逻辑。

这导致三个维护问题：

1. **单文件体积过大**：修改任一 runner 子能力都需要在同一个超大文件内定位上下文，审查成本高。
2. **模块边界不清**：runner 主流程骨架与高内聚副作用协调块混在一起，难以看出哪些步骤是固定顺序，哪些步骤是可独立验证的子能力。
3. **测试隔离不足**：部分已有行为只能通过 `tests/runner.test.ts` 的大型 mock 覆盖，新增边界条件容易让 runner 测试继续膨胀。

## 提案

第一阶段只拆 `src/runner.ts` 的副作用协调块，不新增业务能力、不改变 GitHub issue 交互协议、不改变 stage 枚举、不改变 intake / ledger / orchestration 的事实语义。

优先抽出 3 个 runner 子模块：

- `src/runner/acceptance-prepass.ts`：承载验收 pre-pass、child task acceptance fact 入账、父级集成验收请求、closed child join blocked 上报、集成验收失败 repair child 创建协调。纯 ledger 规则仍来自 `goal-ledger.ts`，GitHub 写操作仍通过 runner 注入的 dependencies。
- `src/runner/external-route.ts`：承载 active issue 最新外部无 mention 评论的 CEO fallback route、agent-authored child issue route gate、roundtable no-handoff recovery。实际路由判据仍由 `agents/ceo.md` 与 `format-ceo.ts` 承担。
- `src/runner/codex-execution-reaction.ts`：承载 Codex driver 启动前的 `eyes` reaction target 解析与 best-effort 添加，保持 reaction 时机不变。

`src/runner.ts` 保留：

- 默认依赖装配、runner heartbeat、scanner / dispatcher 接线。
- `processIssueSource` 的主流程顺序。
- Codex driver 调用与 watchdog / interrupt 主流程。
- CEO agent result 编排入口（本阶段不拆 CEO spawn / goal-intake / roundtable executor，避免一次改动过大）。

方案按 production 质量基准执行，首批拆分必须显式守住系统级不变量：

- **L1 liveness**：新模块内所有会等待 GitHub、ledger state、formatter、issue create / lookup、reaction 或 comment publish 的路径，必须继续使用既有有界超时 / watchdog / injected dependency contract，不能引入永不 settle 的等待点。
- **S1 safety**：迁移后任何 comment publish、ledger write、repair child create / lookup、route append 等失败，都不得让 runner 把失败伪装成已处理成功；首条可见评论发布边界前失败仍应返回 failed 或可重试结果，不推进已处理游标。
- **V1 visibility**：格式提醒、blocked 上报、repair child failure、external route append failure 这类“放弃 / 降级 / 失败可见性”路径必须保留可见痕迹；可见痕迹本身发布失败时不得静默吞掉。

## 影响

- **受影响模块**：`github-issue-runner`、`docs/architecture/module-map.md`、`openspec/specs/github-issue-runner/spec.md`、runner 相关测试。
- **不变行为**：reaction 添加时机、media preparation 失败处理、artifact 发布边界、role thread 保存边界、acceptance pre-pass 顺序、external no-mention route 防重、CEO fail-open / fail-closed 语义、GitHub/Codex/shell 调用方式。
- **测试影响**：新增或迁移 runner 子模块单测，用 mock dependencies 覆盖成功、失败、幂等 / 防重路径；保留必要的 `tests/runner.test.ts` 集成式主流程断言。
- **文档影响**：实现完成并归档时，把 spec-delta 合并进 `openspec/specs/github-issue-runner/spec.md`，并更新 `docs/architecture/module-map.md` 中 runner 子模块边界说明。
