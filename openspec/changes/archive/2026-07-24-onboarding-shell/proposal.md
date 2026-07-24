# 提案:onboarding-shell

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/product/pages/onboarding.md | 全文(除 §AI 建队技术约束 + 第 3 步接力演示) | 定义 4 步引导 shell + 首启判据 + 环境检查(只 codex)+ 第 1/2/4 步 UI + 落地传预选团队 | 已写入 |
| docs/product/pages/onboarding.md | 验收 #1 #2 #3 #4 #5 #9 #10 #11 #12 #13 #14 #15 #17 | 承接的验收编号 | 已写入 |
| docs/product/pages/onboarding.prototype.html | 全文 | 高保真原型,4 步的完整视觉 / 交互 / 步骤点 / 上一步返回 / 主题切换。**实施时必须对照原型来实现**,冲突以 onboarding.md 正文为准 | 参考 |
| docs/product/pages/agent-teams.md | 「新建对话中的团队预选」 L390-401 | 引导选中团队要能作为落到新建对话页的默认预选 | 已写入 |

## 背景

现有 desktop 冷启动直接渲染 `operator-console` 三栏的新建对话形态。用户明确本 change 走 **react-router 独立路由**,onboarding 是完全独立于 operator-console 的一层。缺口:

- 无引导页 / 无路由分叉:主窗直进新建对话页
- 首启判据不稳:`desktop/src/console-page/sidebar-preference.ts:31` 用「projects 空」当首次,加删项目会反复触发
- 环境自检沉默:`desktop/src/env-doctor.ts` 查 codex + gh + gh-auth,结果只进独立诊断页,主窗对 codex 缺失零提示
- 用户明确:**gh / github 相关代码彻底删除**,`env-doctor` 只保留 codex,`status-page` 一并清 gh;`runner-launch.ts:DESKTOP_RUNNER_MODE="github"` 是否连带清由 codex 在 implement 段判断(可能溢出到独立 change)
- 无「引导选中团队 → 新建对话页预选」传参链路

## 提案

1. **路由分叉**:引入 react-router(或等价方案),`/onboarding` 独立层,完全不复用 `operator-console` 三栏;应用启动时根据「本机曾完成引导」判据分叉到 `/onboarding/*` 或 `/`
2. **首启完成 marker**:PRD 待讨论,留待 codex 在 implement 段前 clarifying(见 § PRD 缺口)
3. **环境检查器**:引导专用,只查 codex(是否安装、是否可运行);`env-doctor.ts` 彻底删除 gh / ghAuth 相关代码;`status-page` 里的 gh CLI 行一并去
4. **4 步 shell**:第 1 步(环境硬门)、第 2 步(团队选择,含「跟 AI 聊出一支新团队」入口,消费 ai-team-builder-service)、第 4 步(准备就绪);第 3 步 UI 归 `onboarding-relay-demo` change,本 change 只留 slot
5. **步骤点 / 上一步 / 布局一致 / 主题**:按 onboarding.md § 区域与信息 + § 操作与反馈,对照 onboarding.prototype.html 实现
6. **落地传预选团队**:`/onboarding` 完成 → `/` 新建对话页时携带引导中所选团队 id;新建对话页把它作为默认预选(具体传参方式见 § PRD 缺口)
7. **侧边栏消失**:引导路由不渲染 `operator-console`,天然不出现 sidebar;引导完成后 `/` 恢复三栏
8. **文案清 GitHub**:引导任何屏都不出现 gh / GitHub / PR / issue 字样

## 影响

- **新增**:
  - `desktop/src/onboarding/` view 目录(路由、first-run marker、env-check、4 步组件、传预选团队)
  - `packages/console-ui/src/onboarding/` UI(4 步 shell、步骤点、上一步、主题切换)
- **修改**:
  - `desktop/src/env-doctor.ts` — 删除 gh / ghAuth 检查代码;类型收敛为 `{ codex }`
  - `desktop/src/status.ts` — `DesktopStatusSnapshot.doctor` 类型收敛
  - `desktop/src/status-page/index.html` + `status.js` — 删除 gh CLI 行
  - `desktop/tests/env-doctor.test.ts` — 删除 gh 相关三条测试
  - `desktop/src/console-page/sidebar-preference.ts` — `isFirstRunOnboarding` 换用新 marker,不再看 projects
  - `desktop/tests/sidebar-preference.test.ts` — 重写测试
  - `desktop/src/console-page/app.tsx` — 加路由分叉;调用签名更新
  - `packages/console-ui/src/console/operator-console.tsx:574-575, 667-675, 800-801` — 去除引导期强制打开 sidebar 的钩子(路由分叉后不再必要)
  - `packages/console-ui/src/console/operator-console.tsx:1805-1816` — `resolveNewConversationAgentTeamKey()` 增加一次性 pending pick 入参
- **不动**:
  - `desktop/src/team-conversation-preference.ts`(引导选团队走独立传参,不写 last-used;除非 § PRD 缺口 (a) 拍板走 last-used)
- **依赖前置**:`ai-team-builder-service`(第 2 步「AI 建队」入口消费)

## PRD 缺口(供 codex 在 implement 段前 clarifying)

- **规则句 1 · 引导完成判据**:marker 文件(如 `<dataRoot>/.onboarding-completed`)/ SQLite 时间戳 / 组合。PRD L328 显式待讨论
- **规则句 3 · 引导所选团队怎样等同于 last-used**:(a) 引导结束写 `last-used-team.json`(需绕过 `team-conversation-preference.ts:48` 的 sessionExists 门禁);(b) 独立一次性 pending pick 参数(不落盘,仅用于新建对话页首次渲染);(c) 允许「引导选中」算成功事件。**推荐 (b)**
- **规则句 18 · `runner-launch.ts:DESKTOP_RUNNER_MODE="github"` 是否连带清**:用户已明确「不再需要 github」,但落地范围由 codex 判断:是否本 change 顺手清,如果不清则新起 `retire-github-runner-mode` change
- **onboarding.md 「中途关闭恢复」**:PRD 明确留白。默认按「从头重走」实现(简单),回头改
