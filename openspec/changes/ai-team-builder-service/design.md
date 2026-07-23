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
  streamdown-adapter.tsx   — streamdown + allowedTags 注册表(见 § 权衡)
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

### Codex spawner 契约

- **execution profile**:只读 sandbox、隔离 cwd(不含项目素材)、不加载项目 `AGENTS.md` / MCP / 个人指令
- **developer instructions**:固定短提示契约(onboarding.md L275-283 的那段)
- **user prompt**:本轮用户输入
- **output schema**:`--output-schema` 约束 phase ∈ {clarifying, proposal} + 每种 phase 的字段
- **idle / max timeout**:有界(具体值见 § PRD 缺口)
- **不使用**:`model_instructions_file`(不替换 Codex 自带基础指令)、`--yolo`

### 输出协议 schema 概要

```typescript
type CodexOutput =
  | { phase: "clarifying"; question: string }
  | {
      phase: "proposal";
      revision: number;
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
3. 完整重读 tmpDir(用 team-store 的 read 路径)+ 再跑一次 validator
4. rename tmpDir → teams/<slug-derived-from-team-name>
5. registerUserTeamSnapshot(...)
6. 任一步失败:清理 tmpDir,回到 committing failed
```

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
};
```

不进 DTO:`threadId`、`jsonlPath`、`schemaPath`、`cwd`、原始 stack trace、内部错误码。

## 权衡

### streamdown / codex 交互式消息调研备忘录

**现状扫描**:原型 `prototypes/src/main.tsx:613-880` 的 `TeamStep` 把「对话流」和「团队方案卡」都塞在同一段手写 React 里(`BuilderMessage` + 硬编码 `<section className="team-proposal">`),AI 动作用 `setTimeout` 模拟,phase 状态机 `goal | clarify | proposal` 由本地 reducer 驱动。原型明确不与产品代码共享源码。

**streamdown 能力**:Vercel `streamdown` 是 `react-markdown` 的 drop-in,流式增量渲染;通过 `components` prop 覆盖任意 markdown 元素,并通过 `allowedTags` 白名单允许 **MDX 风格自定义标签**——即模型输出 `<team-proposal id="draft-1">…</team-proposal>`,渲染层可映射到 React 组件,组件内部就是普通 React,按钮点击可直接调 IPC / team store。

**codex 原生模式**:codex CLI 走 OpenAI Responses API 的 `function_call` / `function_call_output` 结构化事件流。审批流程 = 模型发 `function_call` → CLI 拦截并渲染 UI → 用户 y/N → CLI 回填 `function_call_output` → 下一轮。对本 change 语义完全对得上:把「团队方案」定义成 codex 自定义 tool `propose_team({members, primary, relay})`,desktop 拦截该 call → React 卡片渲染 → 按钮回填 `{decision:"accept"}` 或 `{decision:"adjust", note:"..."}` 触发下一轮 exec resume。**限制**:codex CLI 的 tool schema 扩展路径需读源码或 `codex --help` 确认;若走 codex-rs 内嵌 tool 白名单会麻烦;更安全是走 `codex exec --json` 让模型输出结构化 markdown / JSON,由 desktop 解析。

**候选范式对比**:

| 方案 | 复杂度 | 契合度 | 扩展性 | 备注 |
| --- | --- | --- | --- | --- |
| A. streamdown + `allowedTags` 自定义标签 | 2 | 高 | 高 | codex 输出 `<team-proposal>` 标签,streamdown 渲染成 React 卡;新卡类型只需加标签+组件 |
| B. codex 自定义 function tool(仿 apply_patch) | 4 | 中 | 高 | 语义最纯,但要改 codex 侧或用 MCP 中转,desktop 需实现 tool broker |
| C. Vercel AI SDK generative-ui | 3 | 中低 | 中 | 需切到 AI SDK message 模型,与现有 codex driver 并存别扭 |
| D. 保持纯 React 组件树,markdown 只渲染文字段 | 1 | 高(现状) | 低 | 每加一种卡片都要改 phase 状态机与 codex 输出解析,重蹈原型耦合 |

**推荐 A**(streamdown + `allowedTags`)——codex 侧只需约定「在 markdown 里输出自定义标签+ JSON 属性」,不改 codex 二进制;desktop 侧一次性搭好 `<team-proposal>` / 未来 `<step-plan>` 等注册表,新卡片零协议成本。B 更纯净但依赖 codex tool 扩展未验证。最终由 change 实施者结合 codex driver 现状拍板。

Sources: [vercel/streamdown](https://github.com/vercel/streamdown)、[Streamdown docs · Components](https://streamdown.ai/docs/components)、[OpenAI Codex CLI · Phil Schmid](https://www.philschmid.de/openai-codex-cli)、[Apply Patch tool · OpenAI](https://platform.openai.com/docs/guides/tools-apply-patch)。

### 原型对照

高保真原型 `docs/product/pages/onboarding.prototype.html` + `prototypes/src/main.tsx:613-880` 给出的 AI 建队子流程视觉/交互(消息气泡、方案卡结构、按钮态、返回选团队)是本 change UI 实现的事实源。实施时必须逐一对照原型来实现,不允许自造 UI 语言;冲突时以 onboarding.md 正文为准。

### 不做的事

- 不改 `team-store.ts:createUserTeam` / `addTeamMember` 现有签名(空白路径不受影响,除非选 PRD 缺口 (b))
- 不改 `team-conversation-preference.ts`(AI 建队不记 last-used)
- 不建 codex CLI 侧的 tool schema 扩展(除非选方案 B)

## 风险

- **codex `--output-schema` 契约不稳**:若 codex CLI 该 flag 行为随版本变化,业务校验必须能兜住;二次 validator + 一次修复 turn 就是这层保险。
- **streamdown allowedTags 与 CSP**:若 desktop renderer 有严格 CSP,自定义标签是否被浏览器解析需实测。原型可离线单 HTML 直接跑,产品 Electron 环境需验证。
- **临时目录 rename 跨文件系统**:mac 上 `teams/` 与 tmpDir 应在同分区,否则 `rename` 会退化为 copy+delete,破坏原子性。team-writer 需 assert 同分区或改用 copy+fsync+rename+cleanup。
- **thread 丢失重建的对话完整性**:PRD 允许「用已保存对话重建一次」,重建后 revision 计数须清零并显式提示用户,避免旧 revision 与新 thread 混淆。
