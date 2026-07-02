# agent-moebius · AI 项目操作手册

## 项目概览
本项目是一个 Node.js + TypeScript 常驻脚本：运行后按白名单扫描 GitHub repository 的 open issue 更新，把 issue body 与 comments 归一化为带 speaker 的共享时间线，再通过独立 trigger 决定运行本机 `codex` 或发布确定性 hook 评论；真正进入 Codex driver 前会给本轮触发源消息添加 `eyes` reaction 作为即时反馈（issue body 触发则打到 issue，comment 触发则打到该 comment）。提交版 `config.toml` 只作为示例，默认白名单为空；本机通过被忽略的 `config.local.toml` 配置监听 repository，并为每个 issue + role 维护独立 Codex thread。

## 项目结构
```text
.
├── agents/
│   ├── dev.md                  # 开发者 agent 角色素材，带 dev worktree pre script
│   ├── ceo.md                  # 评论发布前 CEO guardrail persona
│   ├── hermes-user.md          # Hermes 用户画像素材
│   ├── product-manager.md      # 产品经理 agent 角色素材
│   └── reflector.md            # 通用反思接力 agent 角色素材
├── src/                        # TypeScript 运行时代码
│   ├── runner.ts               # 常驻心跳编排入口（扫描派发与执行解耦）
│   ├── scanner.ts              # 发现层：due 仓库扫描，产出 changed issues
│   ├── issue-dispatcher.ts     # 派发层：in-flight 防重、完成即折叠回写
│   ├── state-persister.ts      # intake state 单写者：写串行化 + 合并 + 原子落盘
│   ├── github-response-intake.ts # GitHub 响应接入的纯业务调度规则
│   ├── github-intake-state.ts  # .state/github-response-intake.json 状态读写适配
│   ├── issue-source.ts         # repo / issue source key 与 clone URL 生成
│   ├── local-config.ts         # config.toml / config.local.toml 解析与 shape 校验
│   ├── conversation.ts         # 共享时间线、speaker、agent mention、full/resume prompt 纯业务逻辑
│   ├── conversation-interrupt.ts # driver-agnostic conversation message count 中断检测
│   ├── github.ts               # gh CLI 读取 issue / 发表评论（读与 reaction 走重试，发评论不自动重试）
│   ├── retry.ts                # gh 调用错误分类 + 指数退避重试原语（可注入 sleep、支持 AbortSignal）
│   ├── codex.ts                # codex CLI 调用与 jsonl 解析
│   ├── driver-pool.ts          # codex driver job 并发策略抽象，默认由 runner 注入 5 并发上限
│   ├── stages.ts               # stage 枚举与 marker 宽容解析
│   ├── format-ceo.ts           # CEO guardrail 完整公开 issue context 校正与 fail-open 处理
│   ├── triggers/               # mention / stage 等触发方式；含 self-reflect.ts 同轮自反纯函数
│   ├── agent-prescripts/       # agent 级 Codex 执行前准备脚本
│   ├── agent-context-state.ts  # .state/agent-contexts.json 状态读写适配
│   └── state.ts                # .state/role-threads.json 状态读写适配
├── tests/                      # Vitest 单元测试
├── docs/
│   ├── adr/                    # 架构决策记录
│   └── architecture/           # 模块地图
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
  - 会真实扫描 `config.local.toml` 中配置的白名单 repository 的最近更新 open issues；没有本机覆盖时默认不监听任何 repository。首次扫描默认只建立 baseline，不批量处理历史 issue。最新 issue body/comment 命中 trigger 时，可能调用 Codex 并发表评论，也可能直接发布 hook 评论；只有真正调用 Codex driver 前会先给本轮触发源消息添加 `eyes` reaction。
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
- 闲时扫描间隔、忙时 issue 轮询间隔、运行中 agent 中断检测轮询间隔、扫描窗口、本地 agent Markdown 目录、role thread 状态文件路径集中在 `src/config.ts`。
- GitHub response intake 默认闲时每 5 分钟扫描每个白名单 repo 的最近 20 个 open issues；issue 成功触发响应后进入 active，处理失败时也会进入 / 保持 active backoff 窗口并按 1 分钟轮询；连续 5 次 active poll 无变化或处理失败后降回 idle；active poll / idle changed-issue 拉到 `state = CLOSED` 时从本地 intake state 移除，不触发 Codex / 评论。
- runner 每分钟一轮**心跳**：`src/scanner.ts` 扫描 due 仓库找 changed issue，加上 due 的 active issue 转成 issue processing jobs，批内按 `issueKey` 去重后交给 `src/issue-dispatcher.ts` 派发，**心跳从不等待 job 执行**（防重入只覆盖秒级的扫描派发阶段）；`createDefaultRunnerDependencies()` 通过 `createDefaultCodexDriverPool()` 注入默认并发上限 `CODEX_DRIVER_POOL_MAX_CONCURRENT = 5`，超额 job 排队等前面空槽；`src/driver-pool.ts` 抽象本身仍允许 `undefined` / `null` 表示不限，便于测试注入 fake pool。调度业务逻辑仍集中在 `github-response-intake.ts`，不得引入 Codex / GitHub adapter 或 driver pool 依赖。
- `src/issue-dispatcher.ts` 维护跨心跳的 in-flight issue 集合：在跑 issue 重复派发记 `skip-inflight` 跳过（同 issue 严格串行、不同 issue 互不阻塞，长跑 codex 只占驱动池 1 个名额）；每个 job **完成即**把结果以纯函数折叠进 `src/state-persister.ts`（intake state 单写者，写串行化 + 合并 + 原子落盘，写失败记日志不中断），并执行 active 上限策略（豁免在跑 issue）。job 运行期间该 issue 的 intake state 不推进，中途变化由后续心跳依据折叠后的状态重新推导，不排队重放。
- `agents/<name>.md` 对应 issue 消息里的 `@<name>`；当前每轮只看共享时间线最新消息作为触发源，但具体触发方式由 `src/triggers/` 决定。`agents/ceo.md` 是发布前 guardrail persona，不作为普通 mention Codex agent 运行。
- `agents/<name>.md` 可通过 frontmatter 声明 `preScript`；路径必须是仓库内 `src/agent-prescripts/` 下的受信任脚本，正文仍作为 persona 传给 Codex。
- `agents/dev.md` 声明 `src/agent-prescripts/dev-workspace.ts`；runner 在调用 Codex 前基于当前 GitHub issue source 创建 / 复用 issue 独占 worktree，并把 Codex cwd 切到该 worktree。该 pre script 每次准备前刷新目标仓库远端 `main` tracking ref，新建 worktree 从最新远端 `main` 创建；复用已有 context 时会先校验记录的 `worktreePath` 等于当前配置计算出的 issue 独占 worktree 路径，不一致则 fail closed；复用已有 worktree 时若当前 `HEAD` 未包含最新远端 `main`，会强制删除旧 worktree（失败时 fallback 到 `rm -rf` + `git worktree prune`）并从最新远端 `main` 重建；重建失败才 fail closed，不调用 Codex / 评论 / 推进 role thread。
- `@dev` Codex 运行期间会按 conversation message count 做运行中断检测；如果 GitHub issue 在本轮 Codex 完成前新增 comment，runner 会中断当前 Codex 子进程，不发表评论、不更新 role thread，并保持 issue active 以便下一轮基于最新 timeline 重跑。
- runner 只在 mention trigger 进入真实 Codex driver 路径、prompt plan 需要执行且 preScript 成功后，为本轮触发源消息添加一次 `eyes` reaction：触发源是 issue body 时打到当前 GitHub issue，触发源是 comment 时打到该 comment；no-trigger、stage hook、preScript 失败、prompt plan skip 或 resume fallback 不重复添加 reaction。reaction 添加失败只记录日志，不阻断 Codex 执行。
- 所有 Codex agent 的每条响应末尾都必须显式声明 stage marker；stage 枚举集中在 `src/stages.ts`，当前为 `plan-written`、`code-verified`、`in-progress`。`agents/dev.md` 可用 `plan-written` / `code-verified` 声明开发阶段，普通进度、采访、澄清或其他 agent 默认使用 `in-progress`；stage 只声明阶段，不直接指定后续 agent。
- `agents/reflector.md` 是通用反思接力展示身份；普通 `@reflector` 不启动 Codex，reflector 由 `src/triggers/reflector-stage-trigger.ts` 根据 stage metadata 触发，并直接发布 hook 评论。
- `src/triggers/reflector-stage-trigger.ts` 对 stage marker 的 metadata 名称与空白做宽容匹配，但只接受 `src/stages.ts` 中 `ReflectorStages` 白名单的 `plan-written` / `code-verified`；`in-progress` 不触发 reflector。
- runner 在 Codex agent 生成 `LAST_RESPONSE` 后、发布 GitHub 评论前调用 `src/format-ceo.ts`，用 `agents/ceo.md` 和完整公开 issue context（issue 链接、issue body、所有 comment body 原文、最新响应、agent 名、allowedStages、最近 reflector hook）做一次无状态 CEO guardrail 校正；`latestResponse` 仍是本轮唯一待发布的 agent 响应，完整 issue context 只作为理解用户流程、后续覆盖指令、反思 hook 历史和交付规范的背景。CEO 输出统一为 JSON，三态 `action`：`no_change` 直接发原文；`replace` 用改写后的 `body`（末尾必带合法 stage marker）替换原评论，runner 追加 `ceo-corrected` metadata 后发布；`append` 让 runner 先发原评论、再发一条独立评论（前缀与 `role=<as>` metadata 按 `as` 字段决定，`as` 允许 `{ceo, dev, product-manager, hermes-user, reflector}`；独立评论末尾追加 `ceo-corrected` metadata）。CEO 超时、失败、返回非法 JSON / 未知 action / 未知 as / body 空 / stage marker 缺失时 fail-open 发布原文。reflector 确定性 hook 评论不走 CEO，含 `<!-- agent-moebius:ceo-corrected -->` 的响应不会再次校正以避免循环。业务判据（触发条件、模板措辞、`@mention` 与否等）全部由 `agents/ceo.md` 承担，`format-ceo.ts` 只做格式红线校验（合法 JSON、`action` 枚举、`append.as` 已知 role、`replace.body` 末尾 stage marker、非空 body）。persona 层（`agents/ceo.md`）当前只承载 `no_change` / `append` 两种输出（`replace` 保留为代码层能力），并承载协作生态认知：真实可触发 agent 清单、reflector 非真 agent 的机制说明、以及"死锁等待"识别场景（agent 等待不存在 / 不会响应的对象时 CEO 追加评论纠正认知并裁决推进）。
- `agents/ceo.md` 承载 CEO speaker，但不是 mention Codex agent（不在 `availableAgentNames` 内）；`src/conversation.ts` 的 `normalizeComment` 对 `<!-- agent-moebius:role=ceo -->` metadata 特殊处理直接归为 `speaker=ceo`，跳过白名单校验。
- runner 在 mention-codex 分支 `postComment` 完成后会把刚发的评论拼回本地 timeline 并在本轮内再调一次 `resolveTrigger`（同轮自反），命中 reflector stage hook 时立刻发出 hook 评论，不等下一轮 active poll；命中 mention（要再跑 codex）或返回 skip 即停止；同一 issue timeline 中同一 `(source, stage)` 累计触发上限为 `MAX_SELF_REFLECT = 3`（in-tick 与跨 tick 共享同一上限，由 trigger 层按 `stage-hook` metadata 中的 `source`/`stage` 计数实现，`sourceIndex` 仅用于人 / 日志追溯）；最后一次自动反思 hook 会追加收敛指令：无新问题则不要继续输出同一 stage marker、直接按推进计划进入后续步骤；有新问题则说明问题并停下等待人类检查；每分钟 active poll 仍作为兜底。
- runner 写回 agent 评论时使用 GitHub 页面可见的 `<role>:\n${LAST_RESPONSE}` 前缀；comment body 中落 `&lt;role&gt;:\n${LAST_RESPONSE}`，并追加 `<!-- agent-moebius:role=<role> -->` metadata，便于后续归一化 speaker。
- 每个 role 在同一个 issue 内维护独立 Codex thread；状态保存在被忽略的 `.state/role-threads.json`，包含 issue、role、threadId、lastSeenIndex。并发 Codex 成功写回时必须使用 issue + role entry 级别的串行 merge helper，不能用旧 state snapshot 覆盖整文件。
- agent pre script 上下文保存在被忽略的 `.state/agent-contexts.json`；当前 `@dev` 记录 issue、role、preScript、目标仓库、worktreePath 与 preparedFromMessageIndex。并发 pre script context 写回时必须使用 issue + role entry 级别的串行 merge helper。
- GitHub response intake 状态保存在被忽略的 `.state/github-response-intake.json`，记录 repo 闲时扫描时间、issue `updatedAt`、active/idle 模式、active 无变化次数和下次轮询时间。
- Codex stdout/stderr 运行目录格式为 `/tmp/agent-moebius-<ISO>-c<count>-r<sequence>/`；`<sequence>` 是 runner 进程内递增后缀，用来避免并发 runs 在同一 timestamp + count 下复用同一目录。
- 默认工作根目录为仓库同级 `agent-moebius-workdir`，可通过 `AGENT_MOEBIUS_WORKDIR_ROOT` 覆盖；启动日志会打印解析后的路径。
- `github-response-intake.ts`、`local-config.ts`、`conversation.ts` 与 `conversation-interrupt.ts` 只做业务数据操作；`src/triggers/` 封装 mention / stage 等触发规则；`driver-pool.ts` 只承载 driver job 并发策略；`scanner.ts` 只做发现、`issue-dispatcher.ts` 只做派发与折叠、`state-persister.ts` 只做单写者状态持有与落盘；GitHub、Codex CLI、状态文件读写分别由 `github.ts`、`codex.ts`、`state.ts`、`github-intake-state.ts` 适配；`runner.ts` 只做心跳编排与组装。
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
