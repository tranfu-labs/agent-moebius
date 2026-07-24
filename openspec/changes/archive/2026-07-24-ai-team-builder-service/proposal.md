# 提案:ai-team-builder-service

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/product/pages/onboarding.md | 「AI 建队技术约束」/ 验收 #6 #7 #20 #21 #22 | 定义 AI 建队 service 的提示契约、Codex 边界、结构化输出、原子创建、DTO 边界 | 已写入 |
| docs/product/pages/agent-teams.md | 「跟 AI 聊出一支新团队」/「AI 建队」/ 验收 #6 | 定义 AI 建队 UI 触发面共享同一 service | 已写入 |
| docs/product/pages/onboarding.prototype.html | 全文 | 高保真原型,含 AI 建队子流程的对话形态、方案卡结构、按钮态。**实施时必须对照原型来实现**,原型是本 change 视觉/交互的事实源;冲突以 onboarding.md 正文为准 | 参考 |

## 背景

现有 `desktop/src/team-store.ts` 只支持「从空白开始」的用户团队创建路径(先立目录 + 写空 `team.json`,后续 `addTeamMember` 逐个加员)。AI 建队(onboarding 第 2 步子流程 + Agent 团队页新入口共享)要求:

- 用独立 Codex 子会话生成结构化团队方案(2–6 成员、唯一主 Agent、稳定 slug、结构化职责 / 交棒规格、接力示例)
- 未确认前不占用户团队目录、不进 `listAgentTeams`
- 确认后一次性原子写入整支团队(团队目录 + 所有成员 `AGENT.md`)
- 独立 execution profile,不复用普通 Agent 的 `--yolo` / 项目 `AGENTS.md` / MCP / 个人指令
- IPC DTO 白名单化,不把 Codex thread、原始 JSONL、schema 路径、内部错误泄漏到 renderer

现状里这层 service 完全不存在——所有 #6 #7 #20 #21 #22 号验收的落点都是「待新建」。这是 onboarding-shell / agent-teams-ai-entry 两个 change 的前置。

## 提案

新增 desktop 主进程 service `AiTeamBuilder`,承担五件事:

1. **Codex 子会话管理**:独立 execution profile(只读 sandbox、隔离 cwd、不加载 `AGENTS.md` / MCP、`--output-schema` 约束、有界 idle / max-duration),用 `codex exec` 起首 turn、用 `codex exec resume <threadId>` 续 turn。thread 丢失时可从应用侧保存的对话重建一次。
2. **结构化输出协议**:output schema 只允许 phase ∈ {clarifying, proposal};应用在 schema 之外二次业务校验(2–6 成员、唯一 slug、主 Agent 引用、接力成员引用、结构化字段);业务校验失败最多执行一次带明确错误列表的修复 turn,仍失败进入可见 / 可重试的失败状态,不无限重试。
3. **状态机**:`idle → running → clarifying / proposal / failed → committing → selected`;每次新 proposal 生成一个 proposal revision,只有当前显示且仍匹配 revision 的方案能被 commit;运行中输入锁定,退出可恢复未确认草稿。
4. **原子团队写入**:确认时把最后一版有效方案写入临时目录 → 完整重读校验 → rename 到 `teams/` → `registerUserTeamSnapshot`;任一步失败一并回滚,不留半成品。**不改 `last-used-team.json`**(该记录仍只在真正创建会话后更新)。
5. **IPC DTO 边界**:`AiTeamBuilderState` 只含消息文本、方案预览、状态、错误摘要、可执行恢复动作;Codex thread id、JSONL 路径、schema 路径、cwd、内部堆栈一律不进 DTO。

## 影响

- **新增**:
  - `desktop/src/ai-team-builder/` service 目录(状态机、Codex spawner、validator、team writer、DTO 类型)
  - `desktop/src/ai-team-builder-ipc.ts` IPC channel
  - `packages/console-ui/src/ai-team-builder/` UI 组件(供 onboarding-shell 与 agent-teams-ai-entry 消费)
- **修改**:
  - `src/config.ts` / `src/codex.ts` — 抽出 team-builder 专用 exec options(不复用 `CODEX_EXEC_OPTIONS`);具体拆法留待 codex implement 段决定(见 § PRD 缺口)
  - `desktop/src/team-model.ts` — 仅增加 `TeamStatus` 与独立 `AiTeamBuilderPhase` 的边界注释(按 implement clarifying 结论)
  - `packages/console-ui/src/index.ts` — 导出新增的 AI 建队组件供后续两个入口 change 消费
  - 对应 `tests/` / `desktop/tests/` / console-ui 同目录测试 — 验证 profile、validator、writer、状态机、IPC DTO 与组件
- **不动**:
  - `desktop/src/team-store.ts:createUserTeam / addTeamMember`(空白路径继续用,除非选 § PRD 缺口 (b)/(c))
  - `desktop/src/team-conversation-preference.ts`(AI 建队不写 last-used)

## PRD 缺口(供 codex 在 implement 段前 clarifying)

以下由 1c 规则句绑定摊出、用户已明确「留待 codex 问」的裁决点:

- **规则句 10 / 17 · 团队 writer 拆分**:(a) 新增独立 AI 团队 writer 不改 `createUserTeam`;(b) 扩 `createUserTeam` 接受批量入参;(c) 新 writer + 复用底层原语。**推荐 (a) 或 (c)**。
- **规则句 13 · `--yolo` 拆法**:(a) 拆 `buildTeamBuilderExecOptions()` 完全独立;(b) 参数化 `buildCodexExecOptionsBase({ yolo, sandbox })`。
- **规则句 13 / 14 · 独立 execution profile 载体**:codex CLI 的 `[profiles.xxx]` 配置 vs agent-moebius 层拼一串独立 args。
- **规则句 14 · idle / max timeout**:是否与普通 run 共享 `CODEX_RUN_IDLE_TIMEOUT_MS` / `CODEX_RUN_MAX_DURATION_MS`,还是新增更短的一对。
- **规则句 21 · AI 建队草稿状态机**:五种 AI 建队态明确记进 spec-delta,不入 `team-model.ts:TeamStatus`;是否需要在 `team-model.ts` 加 comment 显式禁止后续并入。

## 设计输入:streamdown / codex 交互式消息

见 `design.md § 权衡` 里的调研备忘录。初步推荐 **streamdown + `allowedTags` 自定义标签**——codex 输出 markdown 里注入 `<team-proposal>...</team-proposal>` 标签,streamdown 映射到 React 卡片组件承载「继续调整 / 创建并选中」按钮。设计输入,由 change 实施者最终决定。
