# 任务:ai-team-builder-service

> 主 loop 会在 implement 段前引导 codex 阅读本文件与 proposal.md / design.md。以下 checkbox 由 codex 在自己 worktree 里推进时勾选。

## 1. clarifying(implement 段前必做)

- [ ] 与用户对齐 § PRD 缺口 5 项(团队 writer 拆法、`--yolo` 拆法、execution profile 载体、idle/max timeout、AI 建队状态机的 `TeamStatus` 关系)
- [ ] 与用户对齐 streamdown vs codex function tool 的最终选型(设计输入是 A,允许改)

## 2. execution profile 与 codex spawner

- [ ] 抽出 team-builder 专用 exec options,不复用 `CODEX_EXEC_OPTIONS`
- [ ] 装配独立 profile:只读 sandbox、隔离 cwd、不加载 `AGENTS.md` / MCP / 个人指令、`--output-schema`、有界 idle / max-duration
- [ ] 首 turn 用 `codex exec`,续 turn 用 `codex exec resume <threadId>`
- [ ] thread 丢失时用应用侧保存对话重建一次,revision 清零并显式提示

## 3. output schema 与 validator

- [ ] 定义 `output-schema.ts`(clarifying / proposal 两类)
- [ ] 定义 `validator.ts` 二次业务校验(2-6 成员、唯一 slug、主 Agent 引用、接力成员引用、结构化职责生成 `AGENT.md` frontmatter 可解析)
- [ ] 校验失败最多一次修复 turn,仍失败进入可重试 failed

## 4. 状态机

- [ ] 实现 `state-machine.ts`:`idle → running → clarifying / proposal / failed → committing → selected`
- [ ] proposal revision 递增;`commit(revision)` 只接受 `revision === current`
- [ ] 运行中输入锁定;退出可恢复未确认草稿

## 5. team writer 原子写入

- [ ] tmpDir → 写 team.json + 每个成员的 AGENT.md → 完整重读校验 → rename 到 `teams/<slug>` → `registerUserTeamSnapshot`
- [ ] 任一步失败:清理 tmpDir,回到 committing failed,保留 proposal 与 revision
- [ ] 断言 tmpDir 与 `teams/` 同分区(否则改 copy+fsync+rename+cleanup)
- [ ] **不改 `last-used-team.json`**

## 6. IPC DTO 边界

- [ ] 定义 `AiTeamBuilderState` DTO,含 phase / messages / proposal preview / revision / error / actions
- [ ] 断言不含 threadId / jsonlPath / schemaPath / cwd / 原始 stack
- [ ] IPC channel 命名与既有 `team-ipc.ts` 一致风格

## 7. Console UI 组件(供 onboarding-shell / agent-teams-ai-entry 消费)

- [ ] `team-builder-view.tsx` 主组件(消息流 + 方案卡 + 输入 + 「返回」)
- [ ] `team-proposal-card.tsx` 方案卡(2-6 成员 + 主 Agent + 接力示例 + 「继续调整」/「创建并选中」)
- [ ] 走 streamdown + allowedTags 注册表(或按 clarifying 结论切方案)
- [ ] **对照 `docs/product/pages/onboarding.prototype.html` + `prototypes/src/main.tsx:613-880` 实现视觉/交互**;冲突以 onboarding.md 正文为准
- [ ] 所有色值走 `packages/console-ui/DESIGN.md` 令牌,无裸 hex,亮暗双主题

## 8. spec-delta

- [ ] 在 `openspec/changes/ai-team-builder-service/spec-delta/desktop-shell/spec.md` 写 Requirement:AI 建队 service 的 profile / schema / validator / writer / DTO / 状态机

## 9. 验证

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过(含本 change 新增测试)
- [ ] 单测覆盖:validator 5 类失败、team writer 失败回滚、revision 过期拒绝、DTO 字段白名单
- [ ] 用 codex 在本地跑一次真实 AI 建队(独立 profile),确认无 `--yolo` 泄漏、无 `AGENTS.md` 加载
