# 任务:onboarding-shell

> 主 loop 会在 implement 段前引导 codex 阅读本文件与 proposal.md / design.md。以下 checkbox 由 codex 在自己 worktree 里推进时勾选。

## 1. clarifying(implement 段前必做)

- [x] 与用户对齐 § PRD 缺口 4 项(first-run marker 方案、pending pick 传参方式、runner-launch 清 github 范围、中途关闭恢复默认)
- [x] 与用户对齐 env-doctor 收敛方案 A vs B

## 2. 路由分叉

- [x] 引入 react-router(或等价方案),定义 `/onboarding/*` 与 `/*` 两条顶层路由
- [x] 应用启动时读 first-run marker → 初始导航到 `/onboarding` 或 `/`
- [x] 确认 operator-console 内部的 `applicationView` 枚举与 router 不冲突

## 3. First-run marker

- [x] 实现 marker 读写(位置 / 格式按 clarifying 结论)
- [x] `sidebar-preference.ts:isFirstRunOnboarding()` 换用 marker,不再看 projects
- [x] `app.tsx:2062` 调用签名更新
- [x] `sidebar-preference.test.ts:28-31` 重写测试

## 4. 环境检查(只 codex)

- [x] `env-doctor.ts` 删除 `checkGhCliVersion` / `checkGhAuth` / `parseGhAuthAccount` 与相关调用
- [x] `env-doctor.ts` 收敛为 `checkCodex()` 或保留旧接口只返回 `{ codex }`(按 clarifying)
- [x] `status.ts` 类型收敛 `DesktopStatusSnapshot.doctor`
- [x] `main.ts:21, 175` 调用点更新
- [x] `status-page/index.html:38-43` 删 gh CLI 行
- [x] `status-page/status.js:85-91` 删 gh 渲染
- [x] `env-doctor.test.ts:5-48` 删 gh 相关三条测试
- [x] 全库 grep `checkGhCliVersion / checkGhAuth / doctor.gh / doctor.ghAuth`,确认无遗漏调用点
- [x] 引导第 1 步 UI 消费 codex 检查,通过前「继续」disabled

## 5. 4 步 shell

- [x] `OnboardingShell` 顶层 reducer(第 1 步通过态 / 第 2 步所选团队 / 第 3 步重播态,上一步不丢)
- [x] `OnboardingStep1Env`(通过态 + 缺失态,含「brew install codex」复制按钮 + 「重新检查」)
- [x] `OnboardingStep2Team`(默认选中内置开发团队,「跟 AI 聊出一支新团队」次卡展开内嵌 `<TeamBuilderView>`)
- [x] `OnboardingStep3RelayDemo` slot(实际 UI 由 onboarding-relay-demo change 填,本 change 只留占位)
- [x] `OnboardingStep4Ready`(大 ✓ + 单 CTA「开始使用」)
- [x] `OnboardingFooter` 步骤点 1..4 + `n/4` + 上一步 + 主 CTA
- [x] **对照 `docs/product/pages/onboarding.prototype.html` 实现视觉/交互**,冲突以 onboarding.md 正文为准
- [x] 所有色值走 `packages/console-ui/DESIGN.md` 令牌,无裸 hex,亮暗双主题
- [x] 引导中所有屏文案不出现 gh / GitHub / PR / issue 字样

## 6. 落地传预选团队

- [x] 第 4 步「开始使用」→ 写 marker → `navigate("/", { state: { pendingAgentTeamKey } })`
- [x] `operator-console` 挂载时消费 `location.state.pendingAgentTeamKey`,读完清空
- [x] `resolveNewConversationAgentTeamKey()` 增加一次性 pending pick 入参,优先级高于 last-used 与 system fallback
- [x] 不动 `team-conversation-preference.ts`(除非 clarifying 定 (a))

## 7. 去除 operator-console 里的引导期强制打开 sidebar 钩子

- [x] `operator-console.tsx:574-575` 引导期强制打开 sidebar 的代码删除
- [x] `operator-console.tsx:667-675, 800-801` 相关 hook / disabled title 清理
- [x] 复测:去掉钩子后首启空 projects 状态 sidebar 折叠正常

## 8. spec-delta

- [x] `openspec/changes/onboarding-shell/spec-delta/desktop-shell/spec.md` 写 Requirement:引导路由 / first-run marker / env-check / 4 步 shell / 落地传预选团队 / 侧边栏与三栏关系 / 清 gh 范围

## 9. 验证

- [x] `pnpm typecheck` 通过
- [x] `pnpm test` 通过(含 sidebar-preference / env-doctor 重写测试)
- [x] 手工路径:全新 dataRoot 启动 → 落到 `/onboarding` → 第 1 步 codex 通过 → 第 2 步默认选内置开发团队 → 第 3 步 slot(relay-demo change 落地后再连) → 第 4 步「开始使用」→ 落到 `/` 新建对话页,团队已带上
- [x] 手工路径:已完成引导的 dataRoot 启动 → 直进 `/`,不见引导
- [x] 手工路径:codex 缺失态 → 「继续」disabled,「重新检查」通过后放行
