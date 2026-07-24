# 设计：desktop-console-t65-integration-closeout

## 方案

### 1. 两级硬门与接口核对

本 change 有两个串行硬门：

1. **实现门**：#143、#144 均已 merge，且真人在 #145 明确通知解阻。未满足时只保留本 OpenSpec 方案。
2. **收尾门**：场景截图、可见文案零命中、console-ui 测试、desktop build、根 typecheck、Storybook 静态构建和 OpenSpec 严格校验全部通过。未满足时不勾 roadmap、不提交、不推送、不创建 PR。

实现门打开后的第一步不是直接改调用点，而是核对两个依赖的 merge commit 与真实文件：

- 确认 #143 的 agent 消息、运行块、运行结局组件名称、props、公开类型、默认折叠语义、固定错误文案、测试和 Story。
- 确认 #144 的侧栏、角色 composer、空状态、上下文顶栏组件名称、props、排序状态、角色白名单、受控输入契约、测试和 Story。
- 对比两个 change 的 `spec-delta/console-ui/spec.md` 与 CLI 镜像，确认实现没有偏离已确认方案。
- 先跑两个依赖自己的 console-ui 测试和 Storybook 静态构建；依赖本身未绿时不开始整合。

本方案中提到的组件名和 props 仅是暂定输入。若合并实现与方案文件不一致，以已合并代码和已确认规格为准，在本 change 内做窄适配；不得擅自回改依赖验收目标。

### 2. 共享出口和所有权

`packages/console-ui/src/index.ts` 统一导出两个依赖交付的七个复合组件及其公共 presentation types，使 desktop renderer 和后续消费者不必越过包根引用内部文件。

`packages/console-ui/src/console/operator-console.tsx` 仍拥有真实整页组合：

- `ConversationSidebar` 负责项目目录名、四档稳定排序、选中态和已完成折叠。
- `SessionContextHeader` 负责当前会话面包屑、任务状态和进展摘要。
- `AgentMessage` 负责 agent 消息摘要和全文披露。
- `RunBlock` 负责 active run 的中文角色、耗时、中断和无步骤降级。
- `RunOutcome` 负责 failed、stuck、interrupted、dead-letter 的固定中文概括与原始原因披露。
- `ConversationEmptyState` 负责没有消息和 active run 时的邀请式入口。
- `RoleComposer` 负责普通会话输入、七角色补全、单合法 mention 约束和发送。

`desktop/src/console-page/app.tsx` 继续拥有 HTTP 请求、轮询和事件回调。如果合并后的组件 props 只依赖现有 `OperatorConsoleProps`，该文件保持不变；只有必须装配新回调或选中父会话时才做薄修改。展示文本、角色映射、错误映射和机器词过滤不得复制到 desktop app。

### 3. 纯呈现 adapter

整合层通过可单测的纯函数把现有真实数据映射到 presentation types，不导入 runner 或 local-console 内部模块。

#### 3.1 项目与会话

- 项目显示名优先由依赖组件按 `folderPath` 末级目录推导，现有 `title` 仅作无法推导时的 fallback。
- `waiting`：现有 status 为 waiting 或 `waitingCount > 0`。
- `running`：现有 status 为 running 或当前 session 存在 active run。
- `idle`：现有 idle、failed、stuck、interrupted 在侧栏均保持非运行的中性条目；具体异常在时间线表达，不用侧栏彩色机器态替代用户注意力排序。
- `completed`：只接受上游明确完成事实。当前 `OperatorSession` 没有该事实，禁止把 idle 或“暂无运行”推断为完成。测试／验收 fixture 可以提供明确的 presentation completed 状态来验证折叠组件；若实现门打开后上游仍无完成字段，生产主界面不显示虚假的完成分组。
- 父子关系不在侧栏缩进；选中任务会话时由顶栏面包屑表达父会话，并复用 `onSelectSession` 回到父会话。

#### 3.2 消息

- user：作者标签显示「你」，正文始终全文。
- agent：角色句柄映射中文名，原始 Markdown 原样交给 `AgentMessage`；默认折叠显示阶段、结论和交棒行，展开后可查完整协议原文。
- system failed/stuck/interrupted/dead-letter：映射到 `RunOutcome`；结构化 status 优先，dead-letter 只做窄的已知系统记录识别。固定中文概括来自 #143，body、error、runDir 等原值合并进入原始信息详情。
- 其他 system：显示窄中文事件概括；原始 body、error、runDir 保存在默认关闭的原始信息详情。不得在折叠态直接回显英文系统句或机器路径。
- pending/running/completed/displayed 等非终局 message status 映射为已确认中文状态，不显示 `user/agent/system` 英文作者标签。

#### 3.3 active run 与 workspace 信息

- `RunBlock` 使用 `role`、格式化耗时、`lastOutputSummary` 和 `onInterrupt`；现有 snapshot 没有计划步骤时走单行人话降级，不伪造步骤。
- stdout/stderr tail、tailDiagnostic、cwd、runDir、workspace mode、workspace unavailable reason 按带标签的原始文本进入默认关闭详情。
- 项目 workspace 开关继续可操作，但按钮和默认文案使用「隔离工作区」等中文产品措辞；`worktree/direct` 仅在用户主动展开的原始信息中出现。
- 打开项目、新建会话、切换 workspace、中断和诊断能力必须保留，不因替换视觉组件而丢失。

### 4. composer 与空状态组合

有消息或 active run 时，footer 使用受控 `RoleComposer`，继续由现有 `composerValue`、`onComposerChange`、`onSend` 和 `isSending` 驱动。

空会话使用 `ConversationEmptyState` 内嵌同一受控 composer；为避免两个输入框同时存在，空状态出现时 footer composer 不渲染。两处共享相同 can-send 规则和回调：空文本、发送中或 active run 时不可提交。

控件生成协议句柄，但不得静默修改用户已输入的普通文本；同一消息已有一个合法角色时不得插入第二个。发送链路和后端 mention 语义不变。

### 5. 验收运行生命周期与证据新鲜度

`scripts/acceptance/local-console-t65.ts` 必须把一次验收视为有唯一身份、可失败清理、成功后才发布证据的事务：

1. 启动时生成 `runId=t65-<UTC timestamp>-<random suffix>`，记录 `startedAt`、当前分支、当前基准 `baseHead` 和被测源码身份。
2. 在启动任何服务前删除精确列举的 T6.5 最终 artifact、旧 `t65-*` staging 和 Storybook 临时目录；不得通配删除其他任务 artifact。
3. 本轮文件先写入 `artifacts/acceptance/.t65-<runId>/`。场景断言、机器词门和命令检查全部成功前，最终固定路径不存在。
4. 每个预期文件生成后校验存在、非空、mtime 不早于 `startedAt`，并计算 SHA-256 与字节数。截图还需验证 PNG signature，文本／JSON 需可解析或符合预期格式。
5. 计算 canonical tested-source manifest：记录 `baseHead`；枚举排序后的交付实现、测试、脚本和 OpenSpec 文件，包含 tracked 修改与 untracked 文件；排除生成的 T6.5 artifact、临时 staging、构建缓存和 roadmap-only closeout metadata；对每个文件记录相对路径、git/file mode、字节数和 SHA-256；对规范化 manifest 再计算 `testedSourceDigest`。
6. 全部通过后，把 staging 文件原子 rename 到固定 artifact 路径；`t65-evidence.json` 最后通过临时文件原子 rename 写入，记录 `runId`、`startedAt`、`finishedAt`、branch、`baseHead`、`testedSourceDigest`、tested-source manifest、命令结果，以及 payload artifact 的相对路径、字节数、mtime、SHA-256。
7. `t65-evidence.json` 只摘要截图、可见文字、ARIA snapshot 和其他 payload artifact，明确排除自身与 sidecar，避免递归摘要；随后生成 `t65-evidence.sha256`，只记录最终 `t65-evidence.json` 的 SHA-256。sidecar 不摘要自身，也不出现在 evidence 的 payload artifact 列表中。
8. 任一断言、命令、超时、发布或摘要核对失败时非零退出；`finally` 删除本轮 staging 和临时静态目录，最终 JSON 与 sidecar 不产生。由于运行前已清场，旧证据不能被失败重跑误用。

验收测试必须预置上一轮同名截图、快照和 JSON，再令本轮场景断言失败：旧文件应在运行前被删除，本轮不得发布最终证据；随后成功重跑时，JSON 的 run id、时间、`baseHead`、`testedSourceDigest`、payload artifact 摘要与 sidecar 摘要必须与本轮文件逐项一致。

验收成功后到 commit／PR 收尾前，必须重新计算同一 tested-source manifest。任何纳入交付的实现、测试、脚本或 OpenSpec 文件出现新增、删除、mode 变化或内容摘要变化，都必须判定 evidence 失效并重新跑验收。最终提交产生后，再从该 commit 的 blob 读取同一组被测文件并重算摘要，必须与 evidence 中的 tested-source manifest 完全一致；否则禁止推送和创建／回读 PR。

### 6. 默认可见与完整可访问文案硬门

新增 `scripts/acceptance/local-console-t65.ts`，复用 T4/T5/T6 的 Playwright、fake local console server 和 desktop 静态 renderer 方式。脚本以浏览器真实布局为准采集默认可见文字：

1. 加载固定项目、会话、消息、active run 和异常 fixture。
2. 保持所有原始信息 `<details>` 关闭。
3. 从页面可见节点提取 `innerText`，写入 `t65-visible-copy.txt`；作者槽位另以 `author:<label>` 规范行记录。
4. 使用 Playwright `page.locator("body").ariaSnapshot()` 或当前版本等价 API 抓取完整默认可访问树，写入 `t65-accessibility-snapshot.yml`。不能以“控件属性白名单”代替可访问树，因为 section、region、img 等非控件节点也可能贡献 accessible name。
5. 对两份快照分别执行等价于 `rg -niE 'worktree|direct|cwd|runDir|dead-letter|handoff'` 的硬门；对规范作者行执行 `rg -niE '^author:(user|agent|system)$'`，均期望退出码 1（零命中）。作者槽位独立检查可避免把项目品牌等普通内容误判为英文作者标签。
6. 在测试 fixture 的非控件可访问节点注入含 `runDir` 的唯一 accessible name，同时保持屏幕文字干净；硬门必须失败并在结构化结果中指出 ARIA snapshot 的命中行。移除注入后正常验收才可继续。
7. 逐个展开原始信息详情，断言对应机器原文仍存在，证明零命中不是通过删除信息实现。

源码标识符不进入浏览器快照，因此天然属于允许范围；原始详情关闭时不应进入可见文字或可访问树，展开后的存在性用独立断言记录，不参与零命中判定。

字段可追溯使用本轮 `runId` 派生的七个互不包含的唯一哨兵：`body`、`error`、`cwd`、`runDir`、`workspaceMode`、`deadLetterReason`、`handoffRaw`。默认态必须全部不可见；测试逐次只展开一个目标详情，目标哨兵必须逐字出现，其余六个不得出现，关闭后再次不可见。agent 的可见交棒摘要通过显式 `handoff` 字段传入中文概括，使 `handoffRaw` 只留在完整原文详情，不与“折叠态必须有人话交棒”冲突。

### 7. T6.5 (a)–(f) 截图与证据矩阵

验收脚本使用固定数据逐条执行并生成：

| 场景 | 操作与断言 | artifact |
|---|---|---|
| (a) agent 渐进披露 | 初始截图见中文角色、阶段、结论、交棒；点击展开后完整原文可查 | `artifacts/acceptance/t65-agent-message.png` |
| (b) 运行块 | 触发 fixture run，见中文角色、耗时、中断、单行概括；原始输出默认关闭且可展开 | `artifacts/acceptance/t65-run-block.png` |
| (c) 异常人话化 | 切换 failed、stuck、interrupted、dead-letter fixture，默认区见固定中文概括，展开可查机器原因 | `artifacts/acceptance/t65-run-outcomes.png` |
| (d) 侧栏 | 项目只显示目录名，会话按等你、运行中、静止、已完成排序，完成组默认折叠并可展开 | `artifacts/acceptance/t65-sidebar.png` |
| (e) 角色补全 | 输入 `@`，面板展示七角色；选择后生成单个合法句柄并可发送，第二个角色插入被阻止 | `artifacts/acceptance/t65-role-composer.png` |
| (f) Storybook 与命令回归 | Storybook 含独立复合组件 Story 和整合后的 OperatorConsole Story；console-ui test、desktop build、typecheck 全绿 | `artifacts/acceptance/t65-storybook-operator-console.png` |

结构化总证据写入 `artifacts/acceptance/t65-evidence.json`，包含每个场景的 DOM 断言、截图相对路径、可见／ARIA 机器词门禁、七哨兵逐项披露矩阵、artifact 新鲜度和命令退出码。截图只证明视觉状态；折叠前后、排序顺序、已完成默认关闭／展开、第二个角色插入阻止、中断回调等行为必须由同一 `runId` 下的 DOM 断言证明。Storybook 继续保留七个独立组件 Story，并更新真实 `OperatorConsole` Story 覆盖整合后的完整页面。

### 8. 有界执行、清理与验证顺序

所有可能阻塞的操作必须通过同一 Node `spawn` 有界执行 helper 或显式 Playwright timeout：

- console-ui test／typecheck、desktop build、根 typecheck、Storybook 静态构建、OpenSpec validate、git／gh 文件外操作：单项上限 180 秒；git／gh 查询和写操作单次上限 30 秒。
- fake server 启动上限 10 秒；页面导航上限 15 秒；单个 locator 等待／点击上限 10 秒；单个 (a)–(e) 场景上限 30 秒；完整浏览器验收上限 150 秒。
- page、browser、server 关闭各上限 5 秒；正常 close 超时后继续强制终止子进程或进程组，清理动作本身不得把主失败永久挂起。
- 子进程超时先发温和终止，等待 2 秒宽限后强制结束整棵进程树。macOS／Linux 使用独立进程组并以负 PID 发送 TERM 后 KILL；Windows 使用有界 `taskkill /PID <pid> /T /F`；其他不支持进程树终止的环境必须在验收开始前 fail-closed，不能降级为只杀直接 child。Playwright 浏览器优先使用可取得 server process PID 的启动方式，确保同一清理机制覆盖 browser server。
- 浏览器、page、static server、fake server 和临时目录句柄都在创建后立即注册清理器，并由逆序 `finally` 执行；部分初始化失败也必须清理已创建资源。

实现后按以下顺序执行，前一步失败即停止收尾：

1. `pnpm --filter @moebius/console-ui test`
2. `pnpm --filter @moebius/console-ui typecheck`
3. `pnpm --filter @moebius/console-ui build-storybook`
4. `pnpm --filter @moebius/desktop build`
5. `pnpm typecheck`
6. `pnpm exec tsx scripts/acceptance/local-console-t65.ts`（内部统一执行浏览器、可见／ARIA 门、哨兵、新鲜度与故障注入检查）
7. 核对 `artifacts/acceptance/t65-evidence.json` 的 run id、`baseHead`、`testedSourceDigest`、命令退出码、payload artifact SHA-256 与 `t65-evidence.sha256`
8. `pnpm exec openspec validate desktop-console-t65-integration-closeout --strict`
9. 比较每个 `spec-delta` 与对应 CLI 镜像，确认一致
10. `git diff --check`

自动化之外，在有界 Storybook 进程中检查独立 Story 无回退，并用生成的 desktop 截图逐张对照 `wireframes.md` 和 `ui-design.md`。故障注入至少覆盖挂起的 Storybook child、忽略温和终止且占用已知端口／文件的孙进程、永不满足的浏览器 locator、关闭超时、旧 artifact + 本轮断言失败、验收成功后修改被测实现文件；均须在上限内非零退出、清理整棵进程树并可立即复用同一资源重跑、无最终 evidence JSON 或拒绝沿用旧 evidence，并不得触发 roadmap／GitHub 收尾。

### 9. roadmap、commit 与幂等 PR 收尾

只有上述验证全部成功后：

- 将 `docs/roadmap/milestone-4-local-console.md` 的 T6.5 标为完成，并追加日期、run id、五张截图、可见／ARIA 快照、JSON 证据、摘要与命令退出码。
- 重新计算 tested-source manifest 并与 `t65-evidence.json` 的 `testedSourceDigest` 完全一致；不一致时必须重新验收，不能提交。
- 检查 `git diff --stat` 和 `git diff --check`，确认没有 runner／后端文件。
- 创建包含 `Closes #142` 的提交并检查提交正文。
- 提交后从当前 commit blob 重算 evidence 中同一组被测文件的摘要，确认与 tested-source manifest 完全一致。
- 推送当前 issue 分支。
- 先用当前 branch 的精确 head ref 调用有界 `gh pr list --state open --head <branch> --json number,url,headRefName,headRefOid,body`：唯一命中则复用，零命中才允许创建，多命中立即 fail-closed。
- PR body 先写入本轮临时文件，包含 `Closes #142`、run id、当前 commit SHA、`testedSourceDigest`、三条验收语句的证据摘要、artifact 路径和测试命令结果；`gh pr create --body-file` 单次上限 30 秒。
- 若 create 返回超时、网络错误或响应丢失，结果视为 ambiguous：不得再次调用 create；改为在总计 60 秒恢复窗口内每 2 秒按同一 head ref 有界查询。唯一命中即找回，零命中至窗口结束则 fail-closed，多命中同样 fail-closed。
- 最后用有界 `gh pr view <number>` 回读；必须唯一对应当前 head SHA，且 body 含 `Closes #142`、run id、commit SHA、`testedSourceDigest` 和验收摘要。任何不一致停止收尾，不把模糊状态报告为成功。

## 权衡

1. **在 OperatorConsole 内做 presentation adapter**：保留 desktop app 的数据获取职责，避免同一人话规则在 package 与 renderer 各维护一份。代价是主组件仍知道 API-shaped props，但这些类型本来就是其公开契约。
2. **真实浏览器可见文字 + 完整 ARIA snapshot，而不是属性白名单或源码全局 grep**：源码必须保留字段名和类型名；可见文字覆盖视觉用户，完整可访问树覆盖非控件 accessible name，七个字段哨兵证明原文没有被删除或串位。
3. **不从 idle 推断 completed**：这使当前生产数据可能没有“已完成”组，但避免展示虚假事实。后端完成事实不在本任务授权范围；组件能力用固定 fixture 验证。
4. **复用现有 API，不新增步骤数据**：现有 active run 没有计划步骤，主界面走设计允许的单行降级。伪造步骤会让截图好看却失真。
5. **完成后才改 roadmap 和 GitHub**：文档完成态、commit 和 PR 都属于交付证据，不应在门禁未绿时提前生成。
6. **staging 后原子发布证据**：比依赖 mtime 猜测更可靠，失败重跑不会留下可被误认的最终证据；代价是验收脚本增加摘要与清理逻辑。
7. **PR 先查后建、模糊结果只查不重建**：牺牲一次调用的简洁性，换取服务端慢成功或响应丢失时不产生重复 PR。

## 风险

- **依赖接口漂移**：#143、#144 当前只有方案，merge 后组件名称或 props 可能变化。通过实现门后的接口清单核对和窄 adapter 化解；不在本方案阶段预写调用代码。
- **完成态缺少上游事实**：当前 session status 没有 completed。固定数据可以验证折叠组件，但生产不得误判。若需求侧要求真实数据出现完成组，需要另行授权后端／状态投影变更，不能暗中扩入本 change。
- **dead-letter 只有原始消息线索**：优先使用结构化 status／error；只有现有系统记录确实没有结构化字段时才用受测的窄识别，原文始终保留。
- **替换侧栏造成旧能力丢失**：打开项目、新建会话、workspace 开关、项目选择和诊断必须进入整页回归测试；不能因为依赖组件范围较窄而删掉现有动作。
- **折叠内容被错误计入机器词门**：用浏览器默认状态的可见文字而不是 DOM `textContent`，并在测试中显式验证 `<details>` 初始关闭；展开后的机器原文另行验证。
- **可访问名称漏检**：保存完整 body ARIA snapshot，并用非控件 accessible name 故障 fixture 证明硬门能捕获，不能退回只扫按钮属性。
- **陈旧 artifact 假通过**：运行前精确清场、run-scoped staging、最终 JSON 最后原子发布，并用 SHA-256／mtime／`testedSourceDigest` 绑定本轮。
- **验收证据与最终提交漂移**：用 canonical tested-source manifest 绑定 `baseHead`、被测文件内容和最终 commit blob；收尾前后任何不一致都强制重新验收。
- **evidence 自引用摘要不可实现**：evidence JSON 只列 payload artifact，独立 `t65-evidence.sha256` 摘要 evidence JSON 本身，sidecar 不参与自摘要。
- **验证或清理永久挂起**：所有 child、等待和 close 都有上限；资源在创建后立即注册逆序清理，超时后强制结束且保持原失败。
- **跨平台进程树残留**：POSIX 使用进程组，Windows 使用 `taskkill /T /F`；无法保证进程树清理的平台在验收前失败，并用孙进程故障 fixture 与立即重跑证明资源已释放。
- **PR 服务端慢成功**：create 的未知结果只进入按 head ref 查询恢复，不重复 create；多匹配或 body/head 不一致 fail-closed。
- **Story 通过但真实 renderer 失败**：验收脚本必须加载 desktop build 的真实静态 renderer并连接 fake server，Storybook 只作为组件回归补充。
- **回滚**：回退 `operator-console.tsx`、共享出口、可选的 desktop 薄装配和 T6.5 验收脚本／roadmap 记录即可；独立组件和后端均不需要回滚。
