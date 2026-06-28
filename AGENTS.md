# agent-moebius · AI 项目操作手册

## 项目概览
本项目是一个 Node.js + TypeScript 常驻脚本：运行后定期扫描指定 GitHub Issue 来源，把 issue body 与 comments 归一化为带 speaker 的共享时间线，再通过独立 trigger 决定运行本机 `codex` 或发布确定性 hook 评论。当前首个运行形态固定盯 `tranfu-labs/agent-moebius#4`，并为每个 role 维护独立 Codex thread。

## 项目结构
```text
.
├── agents/
│   ├── dev.md                  # 开发者 agent 角色素材，带 dev worktree pre script
│   ├── hermes-user.md          # Hermes 用户画像素材
│   ├── product-manager.md      # 产品经理 agent 角色素材
│   └── reflector.md            # 通用反思接力 agent 角色素材
├── src/                        # TypeScript 运行时代码
│   ├── runner.ts               # 常驻轮询入口
│   ├── conversation.ts         # 共享时间线、speaker、agent mention、full/resume prompt 纯业务逻辑
│   ├── github.ts               # gh CLI 读取 issue / 发表评论
│   ├── codex.ts                # codex CLI 调用与 jsonl 解析
│   ├── triggers/               # mention / stage 等触发方式
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
  - 会真实读取 `tranfu-labs/agent-moebius#4`；如果该 issue 暂不存在，本轮会记录 skip 并等待后续轮询。最新 issue body/comment 命中 trigger 时，可能调用 Codex 并发表评论，也可能直接发布 hook 评论。
- 测试：`pnpm test`
- 类型检查：`pnpm typecheck`
- lint/格式化：TODO: 当前尚未配置 ESLint / Prettier；改代码时至少运行测试与类型检查。

## 编码规范
- TypeScript 使用 `strict`，ESM + `moduleResolution: NodeNext`，相对导入运行时代码时使用 `.js` 后缀。
- 运行入口使用 `tsx src/runner.ts`；自动化测试使用 Vitest。
- GitHub 认证复用本机 `gh auth login`，仓库内不得保存 token。
- 当前目标仓库、issue 编号、轮询间隔、本地 agent Markdown 目录、role thread 状态文件路径集中在 `src/config.ts`。
- `agents/<name>.md` 对应 issue 消息里的 `@<name>`；当前每轮只看共享时间线最新消息作为触发源，但具体触发方式由 `src/triggers/` 决定。
- `agents/<name>.md` 可通过 frontmatter 声明 `preScript`；路径必须是仓库内 `src/agent-prescripts/` 下的受信任脚本，正文仍作为 persona 传给 Codex。
- `agents/dev.md` 声明 `src/agent-prescripts/dev-workspace.ts`；runner 在调用 Codex 前基于当前 GitHub issue source 创建 / 复用 issue 独占 worktree，并把 Codex cwd 切到该 worktree。
- `agents/dev.md` 可在回复末尾输出 `<!-- agent-moebius:stage=plan-confirmed -->` 或 `<!-- agent-moebius:stage=code-complete -->`，只声明阶段，不直接指定后续 agent。
- `agents/reflector.md` 是通用反思接力展示身份；普通 `@reflector` 不启动 Codex，reflector 由 `src/triggers/reflector-stage-trigger.ts` 根据 stage metadata 触发，并直接发布 hook 评论。
- runner 写回 agent 评论时使用 GitHub 页面可见的 `<role>:\n${LAST_RESPONSE}` 前缀；comment body 中落 `&lt;role&gt;:\n${LAST_RESPONSE}`，并追加 `<!-- agent-moebius:role=<role> -->` metadata，便于后续归一化 speaker。
- 每个 role 在同一个 issue 内维护独立 Codex thread；状态保存在被忽略的 `.state/role-threads.json`，包含 issue、role、threadId、lastSeenIndex。
- agent pre script 上下文保存在被忽略的 `.state/agent-contexts.json`；当前 `@dev` 记录 issue、role、preScript、目标仓库、worktreePath 与 preparedFromMessageIndex。
- 默认工作根目录为仓库同级 `agent-moebius-workdir`，可通过 `AGENT_MOEBIUS_WORKDIR_ROOT` 覆盖；启动日志会打印解析后的路径。
- `conversation.ts` 只做业务数据操作；`src/triggers/` 封装 mention / stage 等触发规则；GitHub、Codex CLI、状态文件读写分别由 `github.ts`、`codex.ts`、`state.ts` 适配；`runner.ts` 只做编排。
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
- MUST NOT 把 issue title/body/author 等外部输入直接拼接到 shell 命令中执行。
- MUST NOT 把 `agents/` 当作运行时状态目录；它只存放可被 mention 寻址的 Markdown 角色素材。
- MUST NOT 允许 issue body/comment 或 agent Markdown 正文指定任意可执行脚本；只有 frontmatter 中指向 `src/agent-prescripts/` 的受信任 registry 脚本可执行。
- MUST NOT 编造尚未存在的运行命令；新增脚本后同步更新本文件、模块地图和相关 OpenSpec。
- 当前 `agents/` 是角色素材，不应被运行时代码隐式改写或当作状态存储目录。
