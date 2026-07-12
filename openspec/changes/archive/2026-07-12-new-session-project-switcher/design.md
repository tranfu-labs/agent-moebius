# 设计：new-session-project-switcher

## 方案

### 1. 交互归属
这次修改首先属于显示框架：新会话动作从全局入口下沉到具体项目行，空白会话新增“项目菜单展开态”，历史会话保持“项目锁定态”。风格层只机械同步现有近单色设计语言中的图标按钮、菜单项、选中标记和键盘焦点，不引入新的品牌色或悬浮卡片体系。

字符图见 `wireframes.md`，完整视觉推导见 `visual/console/`。

### 2. 受控组件契约
`ConversationSidebar` 增加 `onCreateSession(projectId)`：

- 每个项目标题行右侧渲染一个带项目名的可访问名称按钮。
- 点击只回传该行 project id，不在组件内创建 session 或修改选中态。
- `OperatorConsole` 不再渲染侧栏顶部的全局“新会话”行。

`OperatorConsole` 把现有 `onCreateSession()` 改为 `onCreateSession(projectId)`，把侧栏选择收敛为一次传递 `{ sessionId, projectId }` 的 callback，并增加 `onChangeSessionProject(sessionId, projectId)` 与统一的 `isSelectionMutationPending` 受控状态：

- `ComposerContext` 接收所有项目、当前会话和当前消息/运行事实。
- 只有当前 session 存在、`messages.length === 0`、`activeRun === null`、`parentSessionId` 为空且 `childCount` 为零时，项目文件夹是下拉触发器。
- 下拉列出已打开项目，当前项目显示选中标记；选择当前项目不发请求，选择其他项目回调 renderer。
- 其他会话显示非交互项目文本。是否最终允许重绑仍由 store 原子校验，前端判定只用于交互提示，不能成为数据完整性的唯一防线。
- 任一 create/open/rebind mutation pending 时，侧栏 session 选择、每个项目行的新会话按钮、打开项目按钮和项目下拉全部 disabled；组件 click/select 回调也先检查该受控状态，避免 disabled render 前已排队的事件继续上抛。
- renderer 另向 `OperatorConsole` 提供由 mutation kind 派生的 `isSessionProjectUpdating`；为 true 时 `RoleComposer` 与提交保护同时禁止发送，避免重绑与首条消息并发竞争。

现有 `DropdownMenu` 基于 Radix 原语，复用其键盘导航、焦点恢复和菜单语义，不自造 popover 状态机。

### 3. 原子 session 项目重绑
新增 store 方法：

```ts
moveEmptySessionToProject(input: {
  sessionId: string;
  projectId: string;
  now: string;
}): Promise<LocalConsoleSessionSummary>
```

SQLite worker 在一个 transaction 中执行：

1. 读取 `source_type = 'local'` 的 session；不存在或非 local session 返回 `LOCAL_SESSION_NOT_FOUND`。
2. 验证目标 project 存在；不存在返回 `LOCAL_PROJECT_NOT_FOUND`。
3. 用 `EXISTS` 验证 `session_messages` 中该 session 没有任何行；运行、失败、等待和终态事实都在此表，任一行均返回 `SESSION_PROJECT_LOCKED`。
4. 检查当前 session 的 `sessions.parent_session_id IS NOT NULL`；命中则返回 `SESSION_PROJECT_LOCKED`。
5. 检查是否存在 `sessions.parent_session_id = 当前 session` 的 child；命中则返回 `SESSION_PROJECT_LOCKED`。
6. 独立检查 `session_edges` 中当前 session 是否位于 parent 或 child 任一端；命中则返回 `SESSION_PROJECT_LOCKED`。
7. 所有检查通过后更新 `sessions.project_id` 与 `updated_at`，再返回更新后的 summary。

`sessions.parent_session_id` 是 session summary / runtime lineage 的事实源，`session_edges` 是 orchestration key / relation 的事实源；即使历史或损坏 fixture 只写了其中一边，重绑也必须 fail closed。不删除或重建 session，因此 renderer 的草稿与 `selectedSessionId` 可保持不变；项目外键继续保护目标引用。失败时 transaction 回滚，不改 session、消息、cursor、edge 或 project。

SQLite worker 不直接抛出预期业务错误，因为 worker transport 当前只保留 message/stack。新 command 返回可序列化判别联合：

```ts
type MoveEmptySessionResult =
  | { ok: true; session: LocalConsoleSessionSummary }
  | {
      ok: false;
      code: "LOCAL_SESSION_NOT_FOUND" | "LOCAL_PROJECT_NOT_FOUND" | "SESSION_PROJECT_LOCKED";
    };
```

`SqliteLocalConsoleStore` 在主线程把 `ok: false` 映射为 `LocalConsoleSessionProjectError`；runtime 保留该类型，server 用 `instanceof` + `code` 映射 HTTP，不解析字符串。超时、SQLite 故障或未知异常继续走 500/既有诊断通道。

### 4. Runtime 与本地 API
`LocalConsoleRuntime.moveEmptySessionToProject` 通过现有 bounded store call 执行上述命令。

新增：

```text
PATCH /api/local-console/sessions/:sessionId/project
body: { "projectId": "..." }
```

- 非法 JSON、缺少 `projectId`、空字符串或非字符串 `projectId` 返回 `400` 与 `INVALID_SESSION_PROJECT_REQUEST`；route 层在通用 500 catch 前完成该解析错误映射。
- `LOCAL_SESSION_NOT_FOUND` / `LOCAL_PROJECT_NOT_FOUND` 返回 `404`。
- `SESSION_PROJECT_LOCKED` 返回 `409`。
- 错误响应统一为 `{ error, code }`；测试只断言稳定 code/status，不依赖人类可读 message。
- 成功返回 `{ session }`。
- GitHub session key 在 local-only resource scope 中等价为 `LOCAL_SESSION_NOT_FOUND`，返回 404。

### 5. Renderer 状态流与乱序保护
新增 `desktop/src/console-page/state-sync.ts`，把可测的请求协调从 React 视图拆出：

- `refresh(selection)` 必须接收显式 `{ projectId, sessionId }`，不得在异步函数内捕获“稍后才 setState”的旧 selection。
- refresh 采用 single-flight：同一请求尚未完成时，周期轮询 tick 直接跳过，不得仅因下一轮到点就取消慢请求；请求完成后由下一轮 tick 继续。每个真正启动的 refresh 取得单调递增 generation 并关联 AbortController，只有 generation 仍为最新且 signal 未取消时才能提交 state。
- 只有明确切换 project/session、开始 selection mutation 或 effect 清理时才 invalidate 并 abort 当前 refresh；AbortController 不承担固定周期 timeout。若后续需要处理真正挂死的 state API，应另设独立有界 timeout，不能复用轮询周期。
- 普通 project/session 选择先使既有 refresh generation 失效，再以显式新 selection 刷新；不能只依赖 React state 变化后重建的 interval callback。
- `createSession`、`openProject` 与 session project rebind 等 selection-changing mutation 开始时，统一通过 coordinator 使所有既有 refresh generation 失效并 abort 当前请求；mutation 期间 1 秒轮询不启动新 refresh。
- coordinator 维护同步 mutation gate 与可渲染的 mutation kind（`create-session` / `open-project` / `rebind-session`）。`beginSelectionMutation(kind)` 必须在 handler 第一个 `await` 前原子检查并返回唯一 token；已被占用时返回 null，调用方不得继续打开 picker、发请求或改变 selection。React state 只镜像 kind 以渲染 disabled，不能代替 coordinator 的 handler 二次拦截。
- renderer 的组合 `selectSession({ projectId, sessionId })`、`createSession`、`openProject` 和 `rebindSessionProject` handler 都先检查同一个 gate；普通侧栏选择一次性提交明确的 project/session pair，不再拆成两个可能交错的 state setter。这样 mutation 进行中即使旧 DOM 事件或程序化 callback 晚到，也不会启动第二个 mutation 或覆盖当前 selection。
- 每个 refresh lease 记录可选的 mutation owner token。mutation pending 期间，非所有者 refresh 即使由非周期入口启动也不得提交；mutation 所有者的目标 refresh 必须抢占、abort 并取代期间插入的非所有者 lease，避免旧 selection 阻塞或覆盖目标提交。
- mutation 成功后先更新 selection ref/state，再携带当前 mutation token、用明确的新 `{ projectId, sessionId }` 发起唯一 owner refresh；该 refresh 成功或明确失败后才解除 pending。
- 文件夹选择取消或 mutation API 在成功响应前失败时，在 `finally` 释放 gate，并从 mutation 前保存的显式 selection 恢复/继续轮询；释放只允许由持有 gate 的 mutation token 执行，避免旧请求清掉新 pending。
- API 已成功但随后的唯一 refresh 失败时不得伪装回滚已经落盘的 mutation：保留响应给出的目标 selection、显示 refresh 错误、释放 gate，并让后续轮询继续请求目标 selection。
- 即使 mock/平台 fetch 在 abort 后仍返回，generation 检查也会丢弃旧响应；AbortController 是资源取消，generation 才是正确性边界。

具体 mutation：

- 项目行 `＋` 调 `createSession(projectId)`，POST 显式发送项目 id；成功后用响应 session 构造新 selection，清空 composer，再按新 selection refresh。
- 项目下拉调 PATCH；成功后保持 session id，把 project id 切到目标 project，再按该显式 selection refresh；composer state 不清空。
- 打开项目从 folder picker 开始到取消、失败或新 state 提交均持有同一 gate；项目行新建也从 POST 前持有到新 state 提交，二者都不能与侧栏选择或重绑交错。
- 重绑从 PATCH 前到新 state 提交期间 mutation kind 为 `rebind-session`；除统一禁用全部 selection 入口外，项目菜单与发送动作也禁用，`sendMessage` handler 直接检查同步 gate 的 kind，不能只依赖按钮 disabled。
- PATCH 失败时保留原 selection、state 与 composer，解除 pending 并走现有 client error 通道；随后轮询仍从原 selection 继续。

### 6. 测试与验证
单元和集成测试：

- `conversation-sidebar.test.tsx`：两个项目分别点击 `＋`，断言回传对应 project id，且项目标题仍可扫描；统一 pending 时项目行 `＋` 与 session 行均 disabled 且不发 callback。
- `operator-console.test.tsx`：空白会话显示项目菜单、当前项选中、选另一项目发正确 session/project；已有消息、active run、parent/child 会话均为锁定文本；统一 pending 时打开项目、侧栏选择、项目行新建与项目菜单均不可触发，rebind pending 时发送也不可触发。
- SQLite/store/runtime/server 测试：空白 session 成功移动；缺失目标、已有消息、非 local session 均失败；关系 fixture 至少覆盖“仅当前 session 的 parent column”“仅反向 child parent column”“仅 edge 且当前 session 位于任一端”，失败后读取 facts 断言无部分写入。
- server 契约测试：malformed/空 `projectId` 为 400，缺失 local session/target project 为 404，消息或关系冲突为 409，并断言稳定 error code。
- `console-state-sync.test.ts` 使用 deferred fetch：慢 refresh 超过一个轮询周期时，下一 tick 跳过且原请求最终提交；旧 selection 轮询先开始，重绑后新 selection refresh 先完成，最后放行旧响应，断言旧响应不能让 project/session 回跳。另在挂起 rebind API 期间插入非所有者旧 selection refresh，再依次放行 rebind、owner 目标 refresh 与旧响应，断言 owner refresh 抢占旧 lease、旧响应无提交权且最终 selection 保持目标项目。分别让 create/open/rebind mutation 保持 pending，再依次触发侧栏选择、项目行新建、打开项目和项目菜单，断言 selection 不变、picker/API 调用数不增加且没有重复 mutation；待首个 mutation 完成后只提交其目标 selection。继续覆盖取消/API 失败保持原 selection/草稿、API 成功后 refresh 失败保持目标 selection、非持有 token 不能释放 gate，以及重绑 pending 时发送 handler 不发请求。

AI 验证流程：

1. 用两个 project fixture 打开操作台，点击第二个项目 `＋`，截图确认会话落在正确分组。
2. 在空白会话输入未发送草稿，展开项目菜单并选择另一项目，截图确认菜单、选中标记、目标项目和草稿保持。
3. 给会话写入一条消息后重开，确认项目上下文为锁定文本且无菜单。
4. 运行组件测试、local console 测试、全量 `pnpm test`、typecheck、desktop build 与 `git diff --check`。

## 权衡
- 选择“原子移动空白 session”而不是“切换时新建另一个 session”：避免遗留无意义的空白会话，并保持输入草稿与选中 id。
- 选择“有任何历史即锁定”而不是迁移完整会话：会话项目决定 Codex cwd/worktree 来源，迁移历史会让既有消息和运行证据指向错误 workspace。
- 选择项目行级新建按钮而不是保留全局按钮：归属在点击前可见，不依赖隐式 selected project。
- 复用 Radix 下拉而不是自管浮层：减少焦点、键盘、点击外部关闭等无障碍状态错误。

## 风险
- 前端对“空白”的判断可能与持久化事实短暂不同。缓解：store 始终重新校验并原子拒绝，UI 错判不会破坏数据。
- 多次快速触发 selection 变化可能造成 mutation 晚到后重新选中旧目标。缓解：create/open/rebind 共用同步 token gate 串行执行；pending 期间所有 selection 入口由 disabled 与 handler 二次检查共同拒绝，rebind 另与发送互斥。
- 固定轮询可能在 state API 响应慢于 1 秒时不断取消请求并造成提交饥饿。缓解：周期 refresh single-flight，下一 tick 跳过仍在执行的同 selection 请求；selection 变化仍通过 generation 主动废弃旧请求。
- mutation pending 期间，工作区切换等非 selection 操作仍可能触发 state refresh。缓解：lease 绑定可选 mutation owner；非所有者无提交资格，owner 目标 refresh 可抢占期间插入的旧 lease。
- 旧轮询即使被 abort 也可能晚到。缓解：显式 selection + generation + mutation owner 是提交门槛，AbortController 只负责尽早释放请求。
- 默认 session 可能为空且可移动。该行为符合“空白 session 可重绑”；一旦产生消息即按同一规则锁定。
- `sessions.parent_session_id` 与 `session_edges` 任一侧出现 parent/child 关系都必须锁定，避免双事实源暂时失配时破坏 child orchestration 的 project 一致性。

## 依赖与事实规格收敛
- 实现依赖 `local-console-t46-project-workspace-source` 的 schema、project API、state shape 与多 project UI 基座，不复制其 workspace resolver。
- 当前事实规格仍有 one/single project 旧句；本 change 的两个 delta 均以“替换冲突规则”明确最终多 project 语义。
- 归档顺序优先 T4.6 后本 change；若 T4.6 在本 change 归档时仍未归档，则本 change 必须把所列冲突句一并替换，不能仅追加新规则留下自相矛盾的事实源。
