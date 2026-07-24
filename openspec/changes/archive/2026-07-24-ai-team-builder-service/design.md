# 设计:ai-team-builder-service

## 覆盖的验收落点

从 `~/dev-loops/agent-moebius/onboarding/rule-binding.md` 抄过来的本 change 承接行:

### onboarding.md 验收
- **#6** AI 建队子流程在同一步内展开,首问聚焦长期工作目标,每轮 ≤1 追问,用户可退出并恢复未确认草稿 — 落点由本 service 的状态机 + IPC DTO 承接;UI 触发面在 onboarding-shell / agent-teams-ai-entry
- **#7** AI 方案含 2–6 成员/唯一主 Agent/唯一 slug/结构化职责+交棒/接力示例;未确认不创建;确认后原子可用+选中 — validator + team writer + IPC state machine 全套
- **#20** AI 建队使用独立 Codex thread、developer instructions、output schema 和独立只读 execution profile;普通 Agent 的 `--yolo` 不得泄漏 — Codex spawner + execution profile 装配
- **#21** 非法结构/超时/resume 失败/创建失败 → 保留对话+方案、有界结束、重试;不无限自动重试、不静默丢草稿、不半成品 — service 状态机的错误分支
- **#22** Codex thread、原始 JSONL、schema 路径、运行目录和内部错误不进 renderer DTO — IPC DTO 白名单

### agent-teams.md 验收
- **#6** AI 建队未确认时不产生列表项;确认后一次创建含 2–6 成员/唯一主 Agent/全部有效 AGENT.md;失败不留半成品 — team writer 原子性 + `listAgentTeams` 不含草稿

## 方案

### 目录结构

```
desktop/src/ai-team-builder/
  index.ts            — service 入口
  state-machine.ts    — 状态机(idle/running/clarifying/proposal/failed/committing/selected)
  codex-spawner.ts    — 独立 execution profile + exec / resume
  output-schema.ts    — clarifying / proposal 的 JSON schema
  validator.ts        — schema 之外的业务校验(2-6 成员、唯一 slug、主 Agent 引用、接力成员引用)
  team-writer.ts      — 临时目录 → 校验 → rename → registerUserTeamSnapshot
  dto.ts              — AiTeamBuilderState / 消息 / 方案预览 / 错误摘要类型
desktop/src/ai-team-builder-ipc.ts

packages/console-ui/src/ai-team-builder/
  team-builder-view.tsx    — 主组件(消息流 + 方案卡 + 输入)
  team-proposal-card.tsx   — 方案卡(2-6 成员 + 主 Agent + 接力示例 + 「继续调整」/「创建并选中」)
```

### 状态机

```
idle
  ↓ start(userGoal)
running
  ↓ codex 首 turn 返回
  ├─→ clarifying(question)  ← 用户回答后回到 running
  ├─→ proposal(revision N)  ← 用户点「继续调整」→ running / 「创建并选中」→ committing
  └─→ failed(reason)         ← 用户点「重试」→ running / 「返回选团队」→ 保留草稿退出
committing
  ↓ team-writer 完整流程
  ├─→ selected(teamId)       ← 通知 onboarding / agent-teams-ai-entry
  └─→ failed(reason)         ← 保留 proposal 与 revision,允许重试
```

**proposal revision**:每次生成新 proposal 递增;`commit(revision)` 只接受 `revision === current`;运行中输入锁定。

`AiTeamBuilderPhase` 是 AI 建队 service 独立状态，不能并入 `team-model.ts:TeamStatus`。其中
`idle / running / clarifying / proposal / failed` 是可恢复草稿态，`committing / selected`
是同一 service 的提交态与终态；`TeamStatus` 继续只描述已经落盘的团队目录是否可用。

### Codex spawner 契约

- **execution profile**:只读 sandbox、隔离 cwd(不含项目素材)、不加载项目 `AGENTS.md` / MCP / 个人指令
- **profile 载体**:由 agent-moebius 显式装配专用参数，不使用叠加用户基础配置的 Codex CLI profile
- **developer instructions**:固定短提示契约(onboarding.md L275-283 的那段)
- **user prompt**:本轮用户输入
- **output schema**:`--output-schema` 约束 phase ∈ {clarifying, proposal} + 每种 phase 的字段
- **idle / max timeout**:独立常量，idle 2 分钟、max-duration 10 分钟
- **不使用**:`model_instructions_file`(不替换 Codex 自带基础指令)、`--yolo`

专用参数 builder 为 `buildTeamBuilderExecOptions()`，不参数化也不复用含 `--yolo` 的普通
`buildCodexExecOptionsBase()`。首 turn 显式带 `--ignore-user-config`、`--ignore-rules`、
`--sandbox read-only`、隔离 cwd 与 `--output-schema`；resume 继续使用同一 thread 和同一
输出契约。

### 输出协议 schema 概要

```typescript
type CodexOutput =
  | { phase: "clarifying"; question: string }
  | {
      phase: "proposal";
      team: { name: string; purpose: string };
      members: Array<{
        slug: string;             // 稳定,唯一
        name: string;             // 显示
        role: string;
        responsibilities: string[];
        handoffs: string[];       // 引用其他 member.slug
      }>;
      primaryAgentSlug: string;   // 必须在 members 中
      relayBeats: Array<{         // 供第 3 步演示
        speakerSlug: string;      // 必须在 members 中
        message: string;
      }>;
    };
```

`proposalRevision` 不由模型生成；service 在 proposal 通过 validator 后确定性递增并保存，
与 PRD 的“proposal revision 由 service 层判定”一致。由于实测 Codex CLI 0.144.1 的
`--output-schema` 不接受根级 `oneOf`，磁盘上的 schema 使用单对象 nullable envelope：
clarifying 时 proposal 字段为 `null`，proposal 时 `question` 为 `null`；validator 将该
传输形态收窄为上面的 typed union，renderer 不接触 nullable envelope。

### Validator 二次校验(schema 之外)

- 2 ≤ members.length ≤ 6
- 所有 slug 唯一
- primaryAgentSlug ∈ member slugs
- 每个 handoff / relay beat 的 slug ∈ member slugs
- 每个成员的 `AGENT.md` frontmatter 可从结构化字段生成且解析有效
- 校验失败 → 生成明确 error list → 最多执行一次修复 turn → 仍失败 → failed(可重试)

### Team writer 原子流程

```
1. tmpDir = mkTempDir()                       // 隔离于 teams/
2. 写 team.json + 每个成员的目录 / AGENT.md 到 tmpDir
3. 用 team-model 完整重读 tmpDir，逐字段比对方案 + 再跑一次 validator
4. rename tmpDir → teams/<slug-derived-from-team-name>
5. registerUserTeamSnapshot(...)
6. 任一步失败:清理 tmpDir,回到 committing failed
```

writer 采用独立 AI writer，不改 `createUserTeam`，也不复用其“先创建空团队”的持久化草稿
语义。writer 只复用 `team-model` 的序列化、解析与结构校验；AI 专用 IO 在同一文件系统的
临时目录完成，正式目录与团队记录在失败时一起回滚。

**不动 `last-used-team.json`**——AI 建队本身不算「成功创建会话」。

### IPC DTO 白名单

```typescript
type AiTeamBuilderState = {
  phase: "idle" | "running" | "clarifying" | "proposal" | "committing" | "selected" | "failed";
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  proposal: null | ProposalPreview;   // 与 CodexOutput proposal 同形,但删掉 thread 相关
  proposalRevision: number | null;
  error: null | { code: string; humanMessage: string; canRetry: boolean };
  actions: Array<"retry" | "cancel" | "commit" | "adjust">;
  selectedTeamId: string | null;  // 仅 selected 终态携带
};
```

不进 DTO:`threadId`、`jsonlPath`、`schemaPath`、`cwd`、原始 stack trace、内部错误码。

## 权衡

### UI 协议裁决

**现状扫描**:原型 `prototypes/src/main.tsx:613-880` 的 `TeamStep` 把「对话流」和「团队方案卡」都塞在同一段手写 React 里(`BuilderMessage` + 硬编码 `<section className="team-proposal">`),AI 动作用 `setTimeout` 模拟,phase 状态机 `goal | clarify | proposal` 由本地 reducer 驱动。原型明确不与产品代码共享源码。

**最终选择:纯 typed React 组件树。** Codex 权威输出是 `--output-schema` 约束的 JSON，
service 校验后把 `ProposalPreview` DTO 交给 `TeamProposalCard`。对话文本继续复用已有
`MarkdownMessage`，但 proposal 不经过 Markdown 自定义标签二次解析。这样 schema /
validator / DTO 是唯一结构协议，renderer 不需要信任模型生成的标签或属性。

不引入 Streamdown `allowedTags` 注册表：仓库当前 Streamdown 版本没有该公开契约，而且自定义
标签会在 JSON schema 之外形成第二套结构协议。不引入 Codex function tool：它需要新增 tool
broker 或修改 Codex 扩展边界，超出本 change 的 service 范围。

## implement clarifying 裁决

2026-07-24 用户确认以下实施选择：

1. 独立 AI team writer；不改 `createUserTeam`，只复用 `team-model` 的序列化、解析和校验。
2. 新增完全独立的 `buildTeamBuilderExecOptions()`，不参数化含 `--yolo` 的普通 base。
3. execution profile 由 agent-moebius 显式参数装配，不使用 Codex CLI profile 叠加用户配置。
4. 新增 AI 建队专用 timeout：idle 2 分钟、max-duration 10 分钟。
5. AI 建队状态使用独立 `AiTeamBuilderPhase`；`TeamStatus` 保持落盘团队可用性语义并加边界注释。
6. UI 使用纯 typed React 组件树；普通消息复用 `MarkdownMessage`，方案卡直接消费 DTO。

### 原型对照

高保真原型 `docs/product/pages/onboarding.prototype.html` + `prototypes/src/main.tsx:613-880` 给出的 AI 建队子流程视觉/交互(消息气泡、方案卡结构、按钮态、返回选团队)是本 change UI 实现的事实源。实施时必须逐一对照原型来实现,不允许自造 UI 语言;冲突时以 onboarding.md 正文为准。

### 不做的事

- 不改 `team-store.ts:createUserTeam` / `addTeamMember` 现有签名(空白路径不受影响,除非选 PRD 缺口 (b))
- 不改 `team-conversation-preference.ts`(AI 建队不记 last-used)
- 不建 codex CLI 侧的 tool schema 扩展(除非选方案 B)

## 风险

- **codex `--output-schema` 契约不稳**:若 codex CLI 该 flag 行为随版本变化,业务校验必须能兜住;二次 validator + 一次修复 turn 就是这层保险。
- **临时目录 rename 跨文件系统**:mac 上 `teams/` 与 tmpDir 应在同分区,否则 `rename` 会退化为 copy+delete,破坏原子性。team-writer 需 assert 同分区或改用 copy+fsync+rename+cleanup。
- **thread 丢失重建的对话完整性**:PRD 允许「用已保存对话重建一次」,重建后 revision 计数须清零并显式提示用户,避免旧 revision 与新 thread 混淆。
