# 提案：local-console-primary-agent-closeout

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/prd.md` | 价值主张、核心用户旅程、开发域 MVP | 把主 Agent 定义为每轮会话的编排与收尾责任人，取消自然语言验收入账 | 已写入 |
| `docs/product/pages/agent-teams.md` | 页面目标、主 Agent | 主 Agent 从默认接单者升级为控制权归属者和可见收尾者，但不形成上下级或固定工作流 | 已写入 |
| `docs/product/pages/main-conversation.md` | 说话与提及、专业判断与程序状态、待讨论 | 定义所有接力最终回主 Agent，普通正文不触发程序化验收，结构化裁决协议延期 | 已写入 |

## 背景

本地会话当前在普通 mention trigger 之前运行 acceptance pre-pass。只要消息来自 `qa`、`product-manager` 或 `hermes-user`，且正文任意位置出现“验收”“通过”或“不通过”，runtime 就会尝试把它解析为正式验收。普通协作消息因此可能生成 `missing-acceptance-statements`、写入格式诊断或验收事实，并在 pre-pass 已处理后跳过同消息的普通交棒。

“所有人依次报数”的实际对话暴露了这个边界错误：QA 仅在小节标题写了“测试与验收”，消息就被当成正式验收，`@product-manager` 接力被截断。这里的问题不是关键词集合不够精确，而是程序把自由文本专业判断提升成了会改变会话控制权的机器事件。

与此同时，产品事实源只把主 Agent 定义为新任务的默认接单者，没有规定成员接力结束后谁重新取得控制权。于是删除 acceptance pre-pass 后，如果成员忘记写下一棒 mention，接力仍可能直接停在专业成员，无法兑现“主理人负责到底”的团队心智。

## 提案

本 change 只改本地会话与内置本地团队：

1. 把团队主 Agent 明确定义为每轮会话的编排者和可见收尾者。用户不提及成员时先到主 Agent；用户直接点名成员时先执行该成员，但最终仍回主 Agent，不设例外。
2. 保留显式 `@` 的自由接力优先级。非主 Agent 回复没有合法 mention 时，runtime 确定性把下一棒交回主 Agent；主 Agent 回复没有合法 mention 时本轮结束，不自触发。
3. 复用现有“团队快照按主 Agent 排第一”的单一事实，runtime 以快照首成员识别主 Agent，不新增重复的 `primaryAgentSlug` 持久化字段。把主 Agent 身份、成员名单和收尾契约注入本地专用 Agent prompt。
4. 删除本地 acceptance pre-pass 的运行入口、自由文本解析器、自动验收事实写入、自动 repair 和 parent integration progress。正文中的测试、复核、“验收”“通过”“不通过”全部保留为普通对话内容。
5. 既有 `local_acceptance_facts` SQLite 数据仅作为历史兼容数据保留，不再由 runtime 读取或写入；本 change 不执行破坏性删表迁移。
6. 把内置开发团队的 `AGENT.md` 从 GitHub issue 与 formal acceptance 导向改为本地会话原生 persona：开发经理承担主理与收尾；开发、QA 自由提供专业工作和证据，无法判断下一专业成员时返回开发经理。现有 stage marker 生命周期协议继续保留，因为本地 worktree diff 仍以 `code-verified` 作为明确触发，不在本 change 顺带重写。任意用户团队仍由 runtime 注入的团队上下文保证结构规则可见。
7. 把“无法机器判断子任务是否通过、无法自动可靠汇合”明确记录为 PRD 待讨论项。未来只允许显式、版本化、绑定 taskId 与裁决权限的结构化 Agent 事件协议，不在本 change 实现 JSON 裁决。
8. 修正会话状态读模型：只要 cursor 之后仍有未评估的 user/agent trigger source，或 cursor 已有 active claim，就仍视为接力进行中；主 Agent 最终无 mention 回复被评估并推进 cursor 后才进入 idle、蓝点或子会话“已结束”。
9. 由后端派生唯一的 `hasPendingControlWork` 控制流事实，让蓝点、子会话“已结束”和后续结果卡片共用它，避免三个消费者分别从最后一条正文猜测。它只回答“还有没有消息待评估 / run 在执行”，不代表任务成功、验收通过或语义完成。
10. 去掉本地子会话创建对 formal `acceptanceStatements` 的硬依赖：本地结构化 child descriptor 使用可选 `taskChecks`，并只为旧输出兼容接受 `acceptanceStatements`；两者都缺失时仍可创建子会话。创建子会话仍是明确机器副作用，因此继续要求受控 JSON，而普通 Agent 回复不需要 JSON。

## 影响

受影响模块：

- `src/local-console/runtime.ts`：移除 acceptance pre-pass；按快照首成员解析无 mention 成员回复；改用本地专用 prompt 上下文。
- `src/local-console/acceptance-loop.ts`：删除本地自由文本验收解析模块。
- `src/local-console/prompt.ts`（新增）：构造本地会话原生 prompt，不再复用 GitHub Issue 运行说明。
- `src/ceo-orchestration.ts` / 本地 orchestration adapter：为 local caller 提供“任务检查可选”的解析策略，默认 GitHub caller 继续严格要求原 `acceptanceStatements`，并用回归测试锁定。
- `src/sqlite-state-worker.ts`、`src/local-console/types.ts`：派生并下发唯一的 `hasPendingControlWork`；会话状态计算纳入 cursor 未处理/active 事实；移除活跃验收写命令与副作用处理，保留旧表的非破坏性兼容。
- `src/local-console/t5-store.ts`、`src/sqlite-state.ts`：移除活跃验收写接口；历史诊断读取保持兼容。
- `seeds/teams/development/`：更新团队描述与三个成员的本地协作、回主理人规则。
- `tests/local-console.test.ts`、`scripts/acceptance/local-console-t5.ts`：删除旧验收入账预期，增加主 Agent 收尾和关键词不误触发回归。
- `docs/roadmap/milestone-4-local-console.md`：标记旧 acceptance-loop 证据已被新产品决策取代，记录新的验收命令与证据。
- `openspec/specs/local-console/spec.md`：归档时移除 acceptance pre-pass 现状规则，合入主 Agent 收尾规则。
- `AGENTS.md`、`docs/architecture/module-map.md`：删除本地 acceptance-loop 现状描述，写入主 Agent 收尾、本地 prompt 与 legacy 数据边界。

协调影响：

- 活跃 change `main-conversation-evidence-outlets` 的结果卡片 MUST 消费本 change 的 `hasPendingControlWork=false`，不得继续只凭 `lastMessageMentionsAgent` 或单步 run 结束自行推断；实现顺序以本 change 的后端事实先落地为准。

不受影响：

- GitHub runner、`src/runner/acceptance-prepass.ts`、GitHub goal ledger、顶层 `agents/`、GitHub issue 协议与现有 GitHub 测试语义。
- 桌面页面结构、布局、Agent 消息 stage 展示与 workspace diff 触发；本 change 不需要 `wireframes.md`。
