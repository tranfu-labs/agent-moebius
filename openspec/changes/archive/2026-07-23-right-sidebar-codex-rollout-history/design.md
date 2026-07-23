# 设计：right-sidebar-codex-rollout-history

## 方案

### 1. run 与 Codex thread 建立事实关联

`codex exec --json` 的第一批事件包含 `thread.started.thread_id`。扩展现有 JSONL framer，在看到合法 threadId 时触发一次 `onThreadStarted(threadId)`；local runtime 通过 session fact 写漏斗追加只读关联事实：

```ts
interface LocalCodexThreadLinkFact {
  sessionId: string;
  runId: string;
  sourceMessageId: number;
  role: string;
  threadId: string;
  startedAt: string;
}
```

- 同一 `sessionId + runId` 重复收到同一个 threadId 时幂等；
- 同一 run 出现冲突 threadId 时 fail closed，过程视图报告关联损坏；
- callback 在 run 尚未结束时即可落盘，因此失败、中断和进程异常路径不依赖成功结果；
- SQLite 可保留可重建索引，但 session JSONL 是关联事实源；
- 不把 rollout 路径或内容写进普通 renderer DTO。

旧 session 没有 link 时直接返回 unavailable。实现不读取 `runDir` / tmp 补 link，也不按时间、角色、公开输入或最终回复猜 thread；从本 change 上线后的新 run 开始建立稳定关联。

### 2. 唯一定位 Codex rollout

新增 `codex-rollout.ts`，集中负责：

1. 从当前 Codex 数据根解析 sessions 根，不在 renderer 硬编码用户目录；
2. 以合法 threadId 匹配文件名末尾的 `rollout-*<threadId>.jsonl`；
3. 对候选做 `realpath` 与根目录包含校验，拒绝目录逃逸和符号链接越界；
4. 唯一匹配才可读；零个、多个、损坏或权限失败都返回结构化 unavailable reason；
5. 用文件身份（realpath + inode / size / mtime）保护游标。活动文件只允许追加；若被替换或缩短，旧游标失效并让 UI 明确重载。

关联与过程内容都不从 Moebius `runDir/stdout.jsonl`、`stderr.log` 或其他 tmp artifact 恢复。过程页只接受 session fact 中的 threadId，再直接读取 Codex rollout。

### 3. 本轮输入来自公开时间线快照

Codex rollout 的 user message 实际是「Agent persona + 本地团队规则 + 完整公开时间线 + 运行期附加上下文」的拼接，不能原样展示。

过程接口使用 thread link 的 `sourceMessageId`，按 Moebius session JSONL 的追加顺序重放消息事实，直到并包含该源消息，形成公开时间线快照：

- 用户、其他 Agent 与当前 Agent 的既有公开正文按原顺序、原角色恢复；
- Agent / 用户正文复用安全 Markdown；
- 结构化附件显示用户可见文件名和类型，不显示托管路径与 runDir；
- 系统 prompt、persona、团队规则、成员名单、workspace 内部信息和附件 manifest 不进入 DTO。

每个 attempt 都绑定自己的 source message 与时间线快照，重试时不复用上一 attempt 的输入。

### 4. rollout 事件投影

新增纯函数 projector，把 JSONL record 映射为判别联合 DTO：

```ts
type ProcessEvent =
  | { kind: "public-message"; speaker: "user" | "agent"; role: string | null; markdown: string }
  | { kind: "agent-markdown"; markdown: string }
  | { kind: "command"; phase: "started" | "completed"; command: string; output?: string; exitCode?: number }
  | { kind: "tool"; phase: "started" | "completed"; name: string; input?: string; output?: string; status?: string }
  | { kind: "file"; action: string; path: string; detail?: string }
  | { kind: "error"; message: string; detail?: string }
  | { kind: "unsupported"; eventType: string };
```

映射规则：

- `event_msg.agent_message` / assistant `response_item.message` → Agent Markdown，按稳定 id 去重；
- command、custom tool、function 与 MCP 调用 / 输出 → 结构化动作事件，保留用户可读输入、输出与错误；
- 文件类动作 → 文件事件；
- `session_meta`、`turn_context`、`world_state`、user prompt blob、token count、内部 id、加密或原始 reasoning → 丢弃；
- 未识别且不是明确协议噪音的类型 → `unsupported`，不得静默消失；
- malformed 完整行产出可见读取诊断；仍在写入的尾部半行等待下一次增量，不误报。

Agent Markdown 走 `MarkdownMessage` 安全管线；命令 / 工具输出走只读 `<pre>`，不执行 HTML、链接协议或终端控制序列。

### 5. 跨 attempts 的反向分页

过程接口以 requested run 定位源消息，再恢复该步骤全部 attempts。客户端只看到不透明 cursor：

```ts
interface ProcessEventPage {
  attempts: ProcessAttemptMeta[];
  events: ProcessEvent[];
  previousCursor: string | null;
  appendCursor: string | null;
  atLatest: boolean;
  status: "running" | "settled" | "unavailable";
  unavailableReason: string | null;
}
```

- 初次请求从最新 attempt 文件末尾反向读取，页面内仍按时间正序返回；
- 继续向上时跨 attempt 边界，插入「第 N 次执行 / 本轮输入 / 本轮执行过程」结构事件；
- 每页同时受投影事件数和原始字节数约束；单个完整事件超过字节预算时允许独占一页并突破该预算，事件字段本身不得截断；
- 限制只作用于单页，不截断全程；用户继续翻页最终可到第一条；
- 活动 attempt 使用 append cursor 获取新增完整行，不重取历史；
- 输出结果与调用跨页时允许分别显示相邻事件，不为了合并而扫描整份文件。

### 6. 动态高度虚拟列表与跟随状态机

`process-tab.tsx` 使用动态高度虚拟列表；Markdown、命令输出和错误块由测量结果修正估算高度。滚动行为抽成可单测状态机：

- `initial`：首个 ready page 后锚定最新事件；
- `following`：距离底部在阈值内，新事件到达后保持底部；
- `reading`：用户向上离开阈值，新增事件只累计计数；
- `loading-previous`：顶部 sentinel 触发前页，插入后以首个旧可见 event key + 像素偏移恢复位置；
- `returning-latest`：点击到最新或手动回底，清计数并恢复 following。

每个 tab 持久化 `{anchorEventKey, offsetPx, followLatest}`，不保存绝对文件路径。重新打开时优先恢复锚点；锚点已不存在才回到底部。虚拟化保证 DOM 节点数只与 viewport + overscan 有关。

### 7. 可测性与文件拆分

预计 `runtime.ts`、`process-tab.tsx` 若直接承载全部逻辑会单文件 diff 超过 200 行。实现必须拆分：

- rollout 定位 / 反向读取 → `codex-rollout.ts`；
- 事件映射 → `process-event-projector.ts` 纯函数；
- 跟随 / 锚点状态 → `process-scroll-model.ts` 纯状态机；
- 单事件展示 → `process-event.tsx`；
- `runtime.ts` 只编排事实与 adapter，`process-tab.tsx` 只组合页面。

这些逻辑都必须有单元测试，不能以 DOM / IO 难测为理由跳过。

## 权衡

- **读 Codex 源文件，不复制内容**：避免双份记录和清理策略分裂；代价是 Codex 数据被清理或格式变化时历史不可用。产品已接受明确 unavailable。
- **保存 threadId，不保存绝对 rollout 路径**：threadId 跨当前数据根内位置稳定，也避免把机器路径扩散到 session DTO；代价是查看时需做一次唯一定位。
- **公开输入从 Moebius facts 恢复，不解析 rollout prompt blob**：角色和正文可控，不泄露 persona / 内部规则；代价是过程页是产品语义还原，不是对原始 prompt 字节的复刻。
- **反向分页而非一次读全文件**：首次到最新足够快且适合大记录；代价是 projector 不能依赖全文件预扫描，跨页调用与结果需容忍分开呈现。
- **未知事件显示占位而非 raw JSON**：不静默假装完整，也不把协议结构推给用户；代价是新 Codex 事件类型出现后，需要升级 projector 才能获得友好详情。

## 风险

- **Codex rollout 属内部格式**：用 fixture 覆盖已知类型、未知类型显式占位、格式失败显示 unavailable；适配器独立，回滚时可恢复旧过程 tab 而不改 session facts。
- **thread link 与并行 lane**：正在开发的多 Agent lane 可能让同 session 同时有多个 run。所有关联必须以 runId 为键，禁止使用「当前 active run」全局槽；实现前对新 lane callsite 做 sweep。
- **大型 Markdown / 工具输出高度抖动**：动态测量后保持锚点，前页插入与图片 / 代码块晚加载都以 event key 修正位置。
- **活动文件尾部半行**：只消费完整换行记录，append cursor 保留半行起点，避免重复或 malformed 误报。
- **Codex 数据根变化**：每次查看按当前环境解析根；旧根文件不自动搜索全盘，不存在就明确不可用。
