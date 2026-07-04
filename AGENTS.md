# agent-moebius · AI 项目操作手册

## 项目概览
本项目是一个 Node.js + TypeScript 常驻脚本：运行后按白名单扫描 GitHub repository 的 open issue 更新，把 issue body 与 comments 归一化为带 speaker 的共享时间线，再通过独立 mention trigger 决定是否运行本机 `codex`；真正进入 Codex driver 前会给本轮触发源消息添加 `eyes` reaction 作为即时反馈（issue body 触发则打到 issue，comment 触发则打到该 comment）。提交版 `config.toml` 只作为示例，默认白名单为空；本机通过被忽略的 `config.local.toml` 配置监听 repository，并为每个 issue + role 维护独立 Codex thread。

## 项目结构
```text
.
├── agents/
│   ├── dev.md                  # 开发者 agent 角色素材，带 dev worktree pre script
│   ├── dev-manager.md          # 技术负责人 agent 角色素材（技术决策 / 架构选型 / 质量保证，不写代码）
│   ├── ceo.md                  # CEO 共享身份素材：guardrail + 普通编排 agent，带 ledger context pre script
│   ├── ceo-scripts/            # CEO 剧本数据文件，不作为可 mention agent
│   ├── hermes-user.md          # Hermes 用户画像素材
│   ├── secretary.md            # CEO guardrail 规则维护秘书，带 current repo pre script
│   ├── qa.md                   # 测试设计 agent 角色素材（方案阶段对抗性审查，oracle 为 docs/architecture/invariants.md）
│   └── product-manager.md      # 产品经理 agent 角色素材
├── src/                        # TypeScript 运行时代码
│   ├── runner.ts               # 常驻心跳编排入口（扫描派发与执行解耦）
│   ├── scanner.ts              # 发现层：due 仓库扫描，产出 changed issues
│   ├── issue-dispatcher.ts     # 派发层：in-flight 防重、完成即折叠回写
│   ├── state-persister.ts      # intake state 单写者：写串行化 + 合并 + 原子落盘
│   ├── github-response-intake.ts # GitHub 响应接入的纯业务调度规则
│   ├── github-intake-state.ts  # .state/github-response-intake.json 状态读写适配
│   ├── goal-ledger.ts          # 目标账本 schema、入账流程、ready gate、阶段切换与上下文投影纯业务逻辑
│   ├── goal-ledger-state.ts    # .state/goal-ledger.json 状态读写适配
│   ├── issue-source.ts         # repo / issue source key 与 clone URL 生成
│   ├── local-config.ts         # config.toml / config.local.toml 解析与 shape 校验
│   ├── conversation.ts         # 共享时间线、speaker、agent mention、full/resume prompt 纯业务逻辑
│   ├── conversation-interrupt.ts # driver-agnostic conversation message count 中断检测
│   ├── issue-media.ts          # issue 图片 / 视频引用提取与媒体 manifest 纯业务逻辑
│   ├── media-assets.ts         # issue 媒体下载校验、输出 artifact 发现与 Markdown 生成
│   ├── github.ts               # gh CLI 读取 issue / 发表评论 / reaction / release artifact 发布
│   ├── retry.ts                # gh 调用错误分类 + 指数退避重试原语（可注入 sleep、支持 AbortSignal）
│   ├── codex.ts                # codex CLI 调用与 jsonl 解析
│   ├── driver-pool.ts          # codex driver job 并发策略抽象，默认由 runner 注入 5 并发上限
│   ├── stages.ts               # stage 枚举与 marker 宽容解析
│   ├── format-ceo.ts           # CEO guardrail 完整公开 issue context 校正与 fail-open 处理
│   ├── ceo-scripts.ts          # CEO 剧本文件加载与 workflow 校验
│   ├── ceo-orchestration.ts    # CEO agent 结构化编排输出解析、校验、key 与 child issue body 渲染
│   ├── observer/               # 本地只读观察页：读配置、.state 与 run manifest，不写状态
│   ├── triggers/               # mention 触发方式
│   ├── agent-prescripts/       # agent 级 Codex 执行前准备脚本
│   ├── agent-context-state.ts  # .state/agent-contexts.json 状态读写适配
│   └── state.ts                # .state/role-threads.json 状态读写适配
├── tests/                      # Vitest 单元测试
├── docs/
│   ├── adr/                    # 架构决策记录
│   ├── architecture/           # 模块地图
│   └── protocols/              # GitHub issue 交互协议等协作规则事实源
├── openspec/
│   ├── changes/                # 先设计再实现的变更工作区
│   └── specs/                  # 当前行为事实规格
├── package.json                # pnpm 脚本与开发依赖
├── pnpm-lock.yaml              # 依赖锁定文件
├── tsconfig.json               # TypeScript 严格模式配置
└── LICENSE
```

## 常用命令
- 安装：`pnpm install`
- 运行常驻脚本：`pnpm start`
  - 需要本机 `codex` CLI 在 `PATH` 中。
  - 需要已完成 `gh auth login`。
  - 会真实扫描 `config.local.toml` 中配置的白名单 repository 的最近更新 open issues；没有本机覆盖时默认不监听任何 repository。首次扫描默认只建立 baseline，不批量处理历史 issue。最新 issue body/comment 命中 mention trigger 时，可能调用 Codex 并发表评论；只有真正调用 Codex driver 前会先给本轮触发源消息添加 `eyes` reaction。
- 运行本地只读观察页：`pnpm observer`
  - 默认监听 `127.0.0.1:8787`，可用 `OBSERVER_PORT` 覆盖端口。
  - 只读读取 `config.toml` / `config.local.toml`、`.state/github-response-intake.json`、`.state/role-threads.json`、`.state/agent-contexts.json` 与 `.state/run-manifests.jsonl`，渲染白名单 issue、阶段来源和 artifact 发布状态。
  - 不调用 GitHub、Codex 或 artifact publisher，不写 `.state` / manifest / release / worktree 文件；观察页进程崩溃或关闭不影响 runner。
- 测试：`pnpm test`
- 类型检查：`pnpm typecheck`
- lint/格式化：TODO: 当前尚未配置 ESLint / Prettier；改代码时至少运行测试与类型检查。

## 编码规范
- TypeScript 使用 `strict`，ESM + `moduleResolution: NodeNext`，相对导入运行时代码时使用 `.js` 后缀。
- 运行入口使用 `tsx src/runner.ts`；自动化测试使用 Vitest。
- GitHub 认证复用本机 `gh auth login`，仓库内不得保存 token。
- 当前 repository 白名单先读取提交版 `config.toml` 示例，再由项目根目录 `config.local.toml` 覆盖；`config.local.toml` 为本地专用且被 `.gitignore` 忽略。默认白名单为空。
- `config.local.toml` 示例：
  ```toml
  [[watchRepositories]]
  owner = "tranfu-labs"
  repo = "tranfu-agents-app"
  ```
- 闲时扫描间隔、忙时 issue 轮询间隔、运行中 agent 中断检测轮询间隔、扫描窗口、本地 agent Markdown 目录、role thread / 目标账本状态文件路径、issue 媒体大小限制、输出 artifact release tag 集中在 `src/config.ts`。
- GitHub response intake 默认闲时每 5 分钟扫描每个白名单 repo 的最近 20 个 open issues；issue 成功触发响应后进入 active；处理失败时不推进 intake `updatedAt`，而是记录 `failureCount` / `lastFailureReason`、保持 active 并按 1 分钟轮询重试，连续失败达 `FAILURE_RETRY_LIMIT = 5` 后尝试发布死信评论，死信发布成功才推进 `updatedAt` 并降回 idle；连续 5 次 active poll 无变化也会降回 idle；active poll / idle changed-issue 拉到 `state = CLOSED` 时从本地 intake state 移除，不触发 Codex / 评论。active issue 最新外部 user comment 无合法 mention 时，runner 会在 no-trigger 分支对该 comment id 执行一次 CEO 式轻量兜底路由判定；目标明确时可 append 具体角色，目标不清或需要编排裁决时可 append `@ceo`，无意图时 no_action；判定结果按 comment id 记录为 `no_action` / `append` / `fail_open`，同一 comment id 不重复判定。
- runner 每分钟一轮**心跳**：`src/scanner.ts` 扫描 due 仓库找 changed issue，加上 due 的 active issue 转成 issue processing jobs，批内按 `issueKey` 去重后交给 `src/issue-dispatcher.ts` 派发，**心跳从不等待 job 执行**（防重入只覆盖秒级的扫描派发阶段）；`createDefaultRunnerDependencies()` 通过 `createDefaultCodexDriverPool()` 注入默认并发上限 `CODEX_DRIVER_POOL_MAX_CONCURRENT = 5`，超额 job 排队等前面空槽；`src/driver-pool.ts` 抽象本身仍允许 `undefined` / `null` 表示不限，便于测试注入 fake pool。调度业务逻辑仍集中在 `github-response-intake.ts`，不得引入 Codex / GitHub adapter 或 driver pool 依赖。
- `src/issue-dispatcher.ts` 维护跨心跳的 in-flight issue 集合：在跑 issue 重复派发记 `skip-inflight` 跳过（同 issue 严格串行、不同 issue 互不阻塞，长跑 codex 只占驱动池 1 个名额）；每个 job **完成即**把结果以纯函数折叠进 `src/state-persister.ts`（intake state 单写者，写串行化 + 合并 + 原子落盘，写失败记日志不中断），并执行 active 上限策略（豁免在跑 issue）。job 运行期间该 issue 的 intake state 不推进，中途变化由后续心跳依据折叠后的状态重新推导，不排队重放。
- `docs/protocols/github-interaction.md` 是 GitHub issue 共享时间线交互协议的单一事实源：`@` 只表示移交下一步控制权且每条消息最多一个合法 mention；`#N` 只用于真实 issue / PR 引用；runner 专属 role envelope 不得人工手写；带路由意图的人工评论必须显式带一个合法 `@`。所有 `agents/*.md` 必须最小引用并遵守该协议。
- `agents/<name>.md` 对应 issue 消息里的 `@<name>`；当前每轮只看共享时间线最新消息作为触发源，但具体触发方式由 `src/triggers/` 决定。`src/conversation.ts` 的 mention 解析会忽略 fenced code block 与 inline backtick 内的 agent mention，代码区域外的最早合法 mention 仍会触发。`agents/ceo.md` 现在是 CEO 一个身份、两条路径的共享素材：发布前 guardrail 路径只读取正文 persona、保持无状态 fail-open；普通 `@ceo` agent 路径进入独立 role thread，执行 ledger context pre script，并由 runner 承担 fail-closed 编排副作用。`agents/ceo-scripts/*.md` 是独立剧本数据，不放在顶层 `agents/*.md`，不会被当作 agent。
- `agents/<name>.md` 可通过 frontmatter 声明 `preScript`；路径必须是仓库内 `src/agent-prescripts/` 下的受信任脚本，正文仍作为 persona 传给 Codex。
- `agents/dev.md` 声明 `src/agent-prescripts/dev-workspace.ts`；runner 在调用 Codex 前基于当前 GitHub issue source 创建 / 复用 issue 独占 worktree，并把 Codex cwd 切到该 worktree。该 pre script 每次准备前刷新目标仓库远端 `main` tracking ref，新建 worktree 从最新远端 `main` 创建；复用已有 context 时会先校验记录的 `worktreePath` 等于当前配置计算出的 issue 独占 worktree 路径，不一致则 fail closed；复用已有 worktree 时若当前 `HEAD` 未包含最新远端 `main`，会强制删除旧 worktree（失败时 fallback 到 `rm -rf` + `git worktree prune`）并从最新远端 `main` 重建；重建失败才 fail closed，不调用 Codex / 评论 / 推进 role thread。worktree 通过 `git worktree add -B agent/<role>/<owner>__<repo>__<issue> <path> refs/remotes/origin/main` 建立，停在受控本地分支上（不是 detached HEAD）；命名段经 `safePathSegment` 规范化。同一个 bare repo cache 的 clone / fetch / worktree add / worktree remove 在 `dev-workspace.ts` 内部按 `repoCachePath` 做进程内 keyed mutex 串行，避免同心跳同 repo 派发多个 issue 时踩到 git ref lock；跨不同 bare repo 的操作保持并发不受限。
- `agents/secretary.md` 声明 `src/agent-prescripts/current-repo-workspace.ts`；runner 在调用 Codex 前把 Codex cwd 固定到 agent-moebius 当前仓库根目录。该 pre script 不创建 worktree、不读写 `.state/*`，用于让 `@secretary` 独立维护 `agents/ceo.md`、OpenSpec、测试与文档，而不污染 `@dev` 的目标 issue worktree / thread。secretary 在该活仓库遵守 git 纪律：不建 / 不切 / 不 reset 分支、不开 PR，改动直接在当前分支完成，commit+push 前必须经用户 issue comment 同意。
- `agents/ceo.md` 声明 `src/agent-prescripts/ceo-ledger-context.ts`；runner 只在普通 `@ceo` agent 路径执行该 pre script。它 fail-closed 校验 `.state/goal-ledger.json` 可读、schema 合法、当前 issue 能唯一关联到 active phase projection、三类必需 CEO 剧本存在，并把当前阶段 projection、可见 task、ledger owner 和可用 workflow id 确定性注入 prompt；guardrail 路径不执行此 pre script。
- `@dev` Codex 运行期间会按 conversation message count 做运行中断检测；如果 GitHub issue 在本轮 Codex 完成前新增 comment，runner 会中断当前 Codex 子进程，不发表评论、不更新 role thread，并保持 issue active 以便下一轮基于最新 timeline 重跑。
- runner 只在 mention trigger 进入真实 Codex driver 路径、prompt plan 需要执行且 preScript 成功后，为本轮触发源消息添加一次 `eyes` reaction：触发源是 issue body 时打到当前 GitHub issue，触发源是 comment 时打到该 comment；no-trigger、preScript 失败、prompt plan skip 或 resume fallback 不重复添加 reaction。reaction 添加失败只记录日志，不阻断 Codex 执行。
- runner 在真正进入 Codex driver 前会解析本轮 prompt 范围内的 issue 图片 / 视频引用：full run 与 fallback full run 使用完整公开 timeline，resume 只使用新增外部 delta 消息。媒体引用提取由 `src/issue-media.ts` 纯函数完成，不访问网络 / 文件系统。
- issue 媒体下载与校验由 `src/media-assets.ts` 完成，文件只写入本轮 Codex `runDir/input-media/`，不写入目标 worktree、`agents/` 或 `.state/`。图片默认上限 10MB，视频默认上限 100MB；只接受 `http:` / `https:` URL 与图片 / 视频 MIME。媒体准备失败时 runner 发布一条带当前 agent role envelope 的错误评论，且不调用 Codex、不更新 role thread，并把该触发视为已处理，避免同一坏链接每分钟重复刷屏。
- Codex 图片输入通过 `codex exec --image <file>` / `codex exec resume --image <file>` 传递；视频因当前 Codex CLI 没有视频 attachment 参数，以本地文件路径 manifest 的形式注入 prompt，供 Codex 用本地工具检查或抽帧。
- Codex 成功后，runner 会发现本轮新增 / 修改或最终回复明确引用的 SVG、图片、视频产物，复制到 `runDir/output-artifacts/` 后通过 artifact publisher 发布为 GitHub comment 可查看链接；默认 publisher 使用同仓库 GitHub release tag `agent-moebius-artifacts` 上传 release assets，不把生成产物提交到业务仓库。artifact 发布失败时发布错误评论，不更新 role thread，不伪装成已交付。
- 普通 `@ceo` agent 成功返回后，runner 只接受带合法 `in-progress` stage marker 的结构化 JSON 编排输出。`spawn_child_issues` 工作流会先校验 workflow id、ledger task id、initialRole、qualityBaseline、验收语句、依赖、分组与 provenance，再通过 `src/github.ts` 的受控 adapter 在父 issue 同仓库串行创建子 issue，body 必须包含 parent reference、ledger task id、质量基准、验收语句、依赖、初始交棒角色、provenance、冲突分组理由与 hidden orchestration key。orchestration key 只由 parent issue source + workflow id + ledger task id 派生；重试时先查 ledger child ref，再按 hidden key 查询父 repo，唯一命中则补写 ledger，不重复创建。创建、查询、ledger 保存和 fail-closed 可见评论都必须有界；全部副作用成功后才保存 ceo role thread，失败不保存 thread，已创建 issue 不删除补偿，失败原因保留已创建 / 找回 URL 供 dead-letter 留痕。
- 所有 Codex agent 的每条响应末尾都必须显式声明 stage marker；stage 枚举集中在 `src/stages.ts`，当前为 `plan-written`、`code-verified`、`in-progress`。`agents/dev.md` 可用 `plan-written` / `code-verified` 声明开发阶段，普通进度、采访、澄清或其他 agent 默认使用 `in-progress`；stage 只声明阶段，不直接指定后续 agent。
- `agents/dev.md` 的 `plan-written` 响应正文末尾必须包含「验收语句」一节，并位于最终 stage marker 之前；每条验收语句必须是一句可机械执行的检查，UI 类使用 `打开 X → 做 Y → 应看到 Z`，非 UI 类使用等价命令 / 断言格式（如 `跑 X → 应输出/退出码 Z`），数量与方案功能点一一对应。
- runner 在 Codex agent 生成 `LAST_RESPONSE` 后、发布 GitHub 评论前调用 `src/format-ceo.ts`，用 `agents/ceo.md` 的 persona body、CEO 剧本摘要和完整公开 issue context（issue 链接、issue body、所有 comment body 原文、最新响应、agent 名、allowedStages）做一次无状态 CEO guardrail 校正；`latestResponse` 仍是本轮唯一待发布的 agent 响应，完整 issue context 只作为理解用户流程、后续覆盖指令、历史上下文和交付规范的背景。CEO 输出统一为 JSON，三态 `action`：`no_change` 直接发原文；`replace` 用改写后的 `body`（末尾必带合法 stage marker）替换原评论，runner 追加 `ceo-corrected` metadata 后发布；`append` 让 runner 先发原评论、再发一条独立评论（前缀与 `role=<as>` metadata 按 `as` 字段决定，`as` 允许 `{ceo, dev, dev-manager, product-manager, hermes-user, secretary, qa}`；独立评论末尾追加 `ceo-corrected` metadata）。所有 runner 发布的 role envelope 评论必须带 `ceo-reviewed` 审计 metadata；实际经过 CEO 的评论标明 `no_change` / `replace` / `append_*` / `fail_open`，未实际调用 CEO 的系统错误、dead-letter、兜底 route append 标明 bypass 或 not-applicable reason；`ceo-corrected` 只表示 replace / append 修正子类。CEO 超时、失败、返回非法 JSON / 未知 action / 未知 as / body 空 / stage marker 缺失时 fail-open 发布原文；当 `agent=ceo` 时，guardrail 对 `append as=ceo` 或 append body 回交 `@ceo` 的结果 fail-open，防止自激。业务判据（触发条件、模板措辞、`@mention` 与否等）全部由 `agents/ceo.md` 和 `agents/ceo-scripts/` 承担，`format-ceo.ts` 只做格式红线校验与防自激后置校验。persona 层（`agents/ceo.md`）当前只承载 `no_change` / `append` 两种 guardrail 输出（`replace` 保留为代码层能力），并承载协作生态认知：真实可触发 agent 清单、阶段验收回流路由（`plan-written` 先派 `@qa` 测试设计审查并套方案评审六项固定模板，`code-verified` 回流发起需求角色并套执行后复盘三问固定模板）、qa 交棒兜底、缺验收语句时要求补齐、交付规范、死锁等待、PR 冲突提醒和免确认操作放行识别场景。CEO 对 PR 下判断前必须在其 Codex 子进程内用 `gh pr view <完整URL> --json title,body,state,mergeable,mergeStateStatus` 核实 PR 真实状态（`format-ceo.ts` 代码层仍不调用 GitHub），`gh` 失败时不基于猜测介入；免确认清单（只写在 `agents/ceo.md`，dev 行为不变）为从最新 `origin/main` 建 feature 分支、落盘 `openspec/changes/`、方案经 qa 测试设计审查通过且发起角色验收通过后进入实现阶段（不再要求用户口头"开始写代码"），清单外操作（push、建/合 PR、删除类）仍等用户。CEO 规则进化入口是 `@secretary`；CEO 默认超时为 300 秒（`DEFAULT_CEO_TIMEOUT_MS`），为子进程内 `gh` 核实留余量。
- `agents/ceo.md` 承载 CEO speaker，且 `@ceo` 是普通 mention 可触发 agent；`src/conversation.ts` 的 `normalizeComment` 对 `<!-- agent-moebius:role=ceo -->` metadata 特殊处理直接归为 `speaker=ceo`，不依赖 mention trigger 白名单。
- `plan-written` / `code-verified` 阶段由 CEO guardrail persona 承接验收回流：有可用「验收语句」时，`plan-written` 必须 `append as=ceo` mention `@qa` 并套方案评审六项固定模板；`code-verified` 必须 `append as=ceo` mention 发起需求 agent 并套执行后复盘三问固定模板，执行方 `dev` 只能裸写、不得额外 mention；缺验收语句时 `append as=ceo` mention `@dev` 要求补齐；若发起者是真人用户而非 agent 则维持 `no_change` 等用户。若 CEO append 正文包含有效 agent mention，后续由下一轮 active poll 按普通 mention trigger 处理。
- `agents/hermes-user.md` 与 `agents/product-manager.md` 被 mention 请求验收方案或实现时，必须按可用「验收语句」逐条走查并输出结构化结论；每条结论包含 `通过` 或 `不通过` 与依据。方案阶段基于 dev 方案推演，代码阶段基于 dev 提供的测试输出、截图 artifact、文件路径或命令输出等证据；全部通过时声明验收通过并说明下一步等待谁，任一不通过时 mention `@dev` 并指出未过语句、实际观察与期望差异。
- runner 写回 agent 评论时使用 GitHub 页面可见的 `<role>:\n${LAST_RESPONSE}` 前缀；comment body 中落 `&lt;role&gt;:\n${LAST_RESPONSE}`，并追加 `<!-- agent-moebius:role=<role> -->` metadata，便于后续归一化 speaker。
- 每个 role 在同一个 issue 内维护独立 Codex thread；状态保存在被忽略的 `.state/role-threads.json`，包含 issue、role、threadId、lastSeenIndex。并发 Codex 成功写回时必须使用 issue + role entry 级别的串行 merge helper，不能用旧 state snapshot 覆盖整文件。
- agent pre script 上下文保存在被忽略的 `.state/agent-contexts.json`；当前 `@dev` 记录 issue、role、preScript、目标仓库、worktreePath 与 preparedFromMessageIndex。并发 pre script context 写回时必须使用 issue + role entry 级别的串行 merge helper。
- GitHub response intake 状态保存在被忽略的 `.state/github-response-intake.json`，记录 repo 闲时扫描时间、issue `updatedAt`、active/idle 模式、active 无变化次数、失败次数 / 最近失败原因、下次轮询时间，以及可选的外部无 mention 兜底路由判定 ledger（按 comment id 记录 outcome、判定时间、reason 与 targetRole）。
- 目标账本状态保存在被忽略的 `.state/goal-ledger.json`，记录 goal / milestone / task / phase、质量基准、验收语句、依赖、provenance、父子 issue reference（含有界 note）、run manifest reference 与阶段归档引用；`src/goal-ledger.ts` 只做纯业务 schema、部分入账、ready gate、阶段切换、当前阶段上下文投影与归档引用回查，`src/goal-ledger-state.ts` 负责原子读写、entry-level merge、同文件写串行化、可注入 IO 与 timeout / AbortSignal 包装。CEO 编排可以通过 runner 显式读取当前 projection 并写入 task child issue reference / orchestration key；目标账本自身不得调用 GitHub、Codex、shell，不得成为 runner 心跳、observer UI、worktree 或 fan-out 拓扑的隐式入口。
- Codex stdout/stderr 运行目录格式为 `/tmp/agent-moebius-<ISO>-c<count>-r<sequence>/`；`<sequence>` 是 runner 进程内递增后缀，用来避免并发 runs 在同一 timestamp + count 下复用同一目录。本轮下载的输入媒体位于 `input-media/`，准备发布的输出产物位于 `output-artifacts/`。
- 默认工作根目录为仓库同级 `agent-moebius-workdir`，可通过 `AGENT_MOEBIUS_WORKDIR_ROOT` 覆盖；启动日志会打印解析后的路径。
- `github-response-intake.ts`、`goal-ledger.ts`、`local-config.ts`、`conversation.ts`、`conversation-interrupt.ts`、`issue-media.ts` 与 `ceo-orchestration.ts` 只做业务数据操作；`ceo-scripts.ts` 只读剧本数据并校验 workflow；`src/triggers/` 封装 mention 触发规则；`driver-pool.ts` 只承载 driver job 并发策略；`scanner.ts` 只做发现、`issue-dispatcher.ts` 只做派发与折叠、`state-persister.ts` 只做单写者状态持有与落盘；GitHub、Codex CLI、媒体 IO、状态文件读写分别由 `github.ts`、`codex.ts`、`media-assets.ts`、`state.ts`、`agent-context-state.ts`、`github-intake-state.ts`、`goal-ledger-state.ts` 适配；`runner.ts` 只做心跳编排与组装，并持有 CEO 编排副作用边界；`src/observer/` 是本地只读旁路，只读消费配置、`.state` 与 run manifest，禁止被 runner 主链路依赖。
- 本地脚本执行必须把 GitHub issue 内容当作数据处理，不能拼接成 shell 命令；调用外部命令必须使用 `child_process.spawn(cmd, args[])`，不得使用 `exec` / `execSync` / `shell: true`。

## 修改前检查
- 读 `docs/architecture/module-map.md` 确认依赖边界。
- 读相关 `openspec/specs/<domain>/spec.md`。
- MUST 确认改动 NEVER 引入 module-map 中被禁的依赖方向；若必须破坏，先写一条 ADR 记录再改。

## 修改后检查
- 跑测试 / lint / 构建，三者全绿（退出码 0）方可提交；任一失败 → 先修复，NEVER 带红提交。
- 更新受影响的 spec 与 ADR。
- 必要时在 `openspec/changes/` 记录变更。

## 禁止事项
- MUST NOT 提交 GitHub token、个人访问令牌、本地绝对路径、执行日志中的敏感内容或 `.env` 文件。
- MUST NOT 提交本机 `config.local.toml`；它用于本地 repository 白名单。
- MUST NOT 把 issue title/body/author 等外部输入直接拼接到 shell 命令中执行。
- MUST NOT 把 `agents/` 当作运行时状态目录；它只存放可被 mention 寻址的 Markdown 角色素材。
- MUST NOT 允许 issue body/comment 或 agent Markdown 正文指定任意可执行脚本；只有 frontmatter 中指向 `src/agent-prescripts/` 的受信任 registry 脚本可执行。
- MUST NOT 编造尚未存在的运行命令；新增脚本后同步更新本文件、模块地图和相关 OpenSpec。
- 当前 `agents/` 是角色素材，不应被运行时代码隐式改写或当作状态存储目录。
