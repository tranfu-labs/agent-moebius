# 设计:onboarding-shell

## 覆盖的验收落点

从 `~/dev-loops/agent-moebius/onboarding/rule-binding.md` 抄过来的本 change 承接行:

### onboarding.md 验收

- **#1** 首启进第 1 步而不是新建对话页 — 路由分叉 + first-run marker
- **#2** 已完成直进新建对话 — 同上,marker 命中走 `/`
- **#3** codex 缺失时「继续」disabled — 第 1 步 shell 状态机
- **#4** 第 1 步只查 codex,不查 gh / claude / node — env-check 收敛 + `env-doctor.ts` 删 gh
- **#5** 第 2 步默认选中内置开发团队 — 第 2 步 UI 消费现有 team registry
- **#9** 第 4 步单 CTA「开始使用」→ 新建对话页 + 已带上引导所选团队 — 落地传预选团队
- **#10** 步骤点 1..4 与 n/4 同步 — shell 底部操作条
- **#11** 顶部标题 / 底部操作条布局一致,主体 `max-w-lg` — shell layout
- **#12** 引导期间侧边栏不出现 — 路由分叉天然实现
- **#13** 引导中不出现 GitHub / gh / PR / issue 字样 — 文案 + env-check
- **#14** 走 DESIGN.md 令牌,无裸 hex — 样式
- **#15** 亮暗双主题下可读 — 样式
- **#17** 第 2–4 步「上一步」;返回保留环境和团队状态 — shell 状态机

### 相关规则句(rule-binding.md 承接行)

- **规则句 1** 判据换掉 → `sidebar-preference.ts:31` + `app.tsx:2062` + `sidebar-preference.test.ts:28-31`
- **规则句 2 & 4** 引导 shell 独立 view → `operator-console.tsx:574-575, 667-675, 800-801, 995`(去除引导期强制打开 sidebar 的钩子)
- **规则句 3** 引导所选团队传参 → `operator-console.tsx:1805-1816` `resolveNewConversationAgentTeamKey()`;`app.tsx:257, 1894` 状态传递
- **规则句 6 & 18** gh 检查清除 → `env-doctor.ts:12-27, 29-37`、`status.ts:1, 21`、`main.ts:21, 175`、`status-page/index.html:38-43`、`status-page/status.js:85-91`、`env-doctor.test.ts:5-48`

## Clarifying 结论（implement）

- **引导完成判据**：采用 `<dataRoot>/.onboarding-completed` marker 文件；内容为完成时间的 ISO 字符串，文件存在且可读即视为完成，缺失、不可读或内容不是有效 ISO 时间均视为未完成。用户删除 marker 后可重新进入引导。
- **引导所选团队如何等同于 last-used**：采用独立的一次性 pending pick，不写 `last-used-team.json`。第 4 步完成时通过顶层路由 state 传递，主页面消费一次后立即清除；真正成功创建会话时仍由既有逻辑更新 last-used。
- **desktop GitHub runner mode**：本 change 只清理 proposal「影响」已列出的环境诊断和状态页展示，不修改 `runner-launch.ts`、`runner-child.ts` 或 runtime mode。彻底退役 desktop GitHub runner mode 另起 `retire-github-runner-mode` change，避免把启动生命周期变更混入 onboarding shell。
- **中途关闭恢复**：首版不持久化当前步骤、环境结果或团队选择；marker 写入前关闭应用，下次从第 1 步重新开始并重新检查 Codex。
- **env-doctor 收敛**：采用方案 A，`env-doctor.ts` 只导出 `checkCodex()`；引导和状态快照复用同一个检查函数，删除 gh CLI / gh auth 检查及解析逻辑。

## 方案

### 路由分叉

引入 react-router(评估 `react-router-dom` v6/v7 或等价方案),入口:

```
<Router>
  <Route path="/onboarding/*" element={<OnboardingShell />} />
  <Route path="/*" element={<OperatorConsole ... />} />
</Router>
```

启动时读 first-run marker → 决定初始导航 `/onboarding` 或 `/`。onboarding 完成时 `navigate("/", { state: { pendingAgentTeamKey } })` 携带预选。

### First-run marker

采用 clarifying 已确认的 marker 文件方案:

- `<dataRoot>/.onboarding-completed` marker 文件,内容 = 完成时间戳 ISO 字符串
- 读:文件存在、可读且内容为有效 ISO 时间才视为已完成;不存在、损坏或读取失败视为未完成
- 写:第 4 步「开始使用」触发,先写 marker 再 navigate
- `isFirstRunOnboarding()` 换用它,`projects` 参数彻底去掉
- marker 写入前不持久化中间步骤；中途关闭后从第 1 步重走

### 环境检查器(引导专用)

引导第 1 步与状态快照复用 `env-doctor.ts` 的 Codex 检查逻辑。clarifying 采用方案 A:

- `env-doctor.ts` 收敛为 `checkCodex()`,引导第 1 步直接通过窄 IPC 调用它
- 删除 `checkGhCliVersion` / `checkGhAuth` / `parseGhAuthAccount` 全部代码
- 状态页继续展示 Codex 一项，不再拥有 gh 相关 DTO 或渲染分支

### 4 步 shell

- **组件树**:`OnboardingShell` 顶层 → `OnboardingStep1Env` / `OnboardingStep2Team` / `OnboardingStep3RelayDemo(slot,由 onboarding-relay-demo 填)` / `OnboardingStep4Ready` → `OnboardingFooter`(步骤点 + 上一步 + 主 CTA)
- **状态**:第 1 步的 codex 通过态、第 2 步的所选团队、第 3 步的重播态,统一在 `OnboardingShell` 顶层 reducer;上一步返回不丢
- **第 2 步 AI 建队入口**:「跟 AI 聊出一支新团队」次卡 → 点开在同一步(不路由跳)内嵌 `<TeamBuilderView>`(来自 ai-team-builder-service 提供的 console-ui 组件);「返回选团队」只退子流程,恢复未确认草稿
- **第 4 步**:大 ✓ + 单 CTA「开始使用」;点击 = 写 marker → `navigate("/", { state: { pendingAgentTeamKey } })`

### 落地传预选团队

见 § PRD 缺口 (b) 推荐方案:走 react-router `location.state.pendingAgentTeamKey`。`operator-console` 在挂载时读一次并作为 `resolveNewConversationAgentTeamKey` 的一次性入参优先级,读完清空。这样不动 `last-used-team.json`,符合 agent-teams.md L397「只有成功创建会话后更新」。

### 清 gh 落地范围

本 change 硬清:
- `env-doctor.ts` 里 gh / ghAuth 相关代码
- `status.ts` 里 `DesktopDoctorResult` 类型收敛
- `status-page/index.html` + `status.js` 里 gh CLI 显示行
- `env-doctor.test.ts` 里 gh 相关三条测试

本 change **不涉及**(由 codex 判断是否顺手清或另起 change):
- `runner-launch.ts:DESKTOP_RUNNER_MODE="github"` / `GITHUB_MODE_FLAG` —— 内部命名,与引导 UI 无直接因果

### 原型对照

高保真原型 `docs/product/pages/onboarding.prototype.html` 是单 HTML 可离线跑,含全部 4 步的最终形态、步骤点、上一步返回、主题切换。**shell 实现必须逐一对照原型**,视觉/交互/间距/圆点数量/分隔线走原型;冲突以 onboarding.md 正文为准。原型明确「不与产品代码共享源码」,所以是**参考**而非源码复制。

## 权衡

- **react-router vs 手写 view switch**:选 react-router,理由:引导只是第一个非 operator-console 的路由,后续可能有更多顶层 view(设置、诊断页升级等);手写 view switch 短期成本低但难扩展。风险:desktop 之前是否已有类似路由方案?若已用其他方案则按现状选型
- **first-run marker 方案 A/B/C**:PRD 待讨论,由 codex 在 clarifying 与用户对齐。所有方案都要能处理「marker 意外损坏」和「用户手动删除 marker 想重跑引导」两个边界
- **落地传预选团队 方案 (a) vs (b) vs (c)**:选 (b) 一次性 pending pick,理由:不违反 `team-conversation-preference.ts:48` 的「只有真正创建会话才更新 last-used」硬约束,且不引入「引导算不算成功事件」的语义模糊
- **不本轮清 runner-launch**:降低本 change 的 blast radius,让 reflect 段更容易核「有无多做」

## 风险

- **react-router 引入影响其他 view 的现有状态**:desktop 现在的 view 切换若是靠 `applicationView` 枚举,加了 router 后要确保 operator-console 内部的 `agent-teams` / `conversation` view 切换不受影响
- **marker 文件跨用户 dataRoot**:多用户 mac 上不同用户各自 dataRoot,marker 各自独立,天然对
- **删 gh 代码影响其他调用点**:清删前必须全库搜 `gh --version` / `gh auth` / `checkGhCliVersion` / `checkGhAuth` / `doctor.gh` / `doctor.ghAuth` 的所有调用点,确保没有引导之外的消费者
- **operator-console 里去除强制打开 sidebar 钩子后**,首启空 projects 状态的显示是否正常需要复测(现在这个钩子在做「首启期禁止折叠 sidebar」的兼容,删了之后 sidebar 折叠状态由用户自己控制)
- **`operator-console.tsx:1805-1816` 修改**签名 → 消费方是否会挂:全库搜 `resolveNewConversationAgentTeamKey` 调用点,确保入参兼容
