# 提案：desktop-console-t65-integration-closeout

## 背景

T6.5 要把 `conversation-console` 已确认的复合组件设计接入真实桌面操作台，而不是停留在独立 Story。并行任务 #143 与 #144 分别负责消息／运行人话化组件，以及侧栏／角色 composer／空状态／会话上下文组件；两者明确不修改 `packages/console-ui/src/console/operator-console.tsx` 和 `packages/console-ui/src/index.ts`，因此本 change 是这两个共享出口的唯一串行整合点。

当前真实主界面仍直接展示英文作者标签、workspace 模式、运行目录、工作目录和机器错误串；侧栏仍按会话树渲染，输入框要求用户手写完整角色句柄。原始信息具有诊断价值，不能删除，但普通用户默认可见区不应承担调试器职责。

需求侧已确认：

- #143、#144 未合并前只允许写方案；实现、commit 和 PR 必须等待两者均合并，并由真人在 #145 再次通知解阻。
- `docs/roadmap/milestone-4-local-console.md` T6.5 场景 (a)–(f) 是唯一行为验收事实源。
- 截图走查使用现有 fake／固定验收数据，不需要运行真实 Codex。
- 机器词硬门只豁免源码层标识符及用户主动展开的原始信息面板；时间线、侧栏、运行概览和错误概括等默认可见区域必须零命中。
- 现有三条验收语句原样保留，不增删、不改写。
- 第 7 条评论提出的五项 QA 建议不新增为正式验收语句；需求侧已确认将其作为原三条之下的验证可靠性防护：有界执行与强制清理、artifact 新鲜度、完整可访问树检查、PR 模糊成功恢复、字段级唯一哨兵。
- 第 11 条评论提出的三项 QA 建议仍不新增为正式验收语句；本方案将其作为原三条之下的验证可靠性防护：被测工作树身份绑定、无自引用 evidence 摘要、跨平台进程树清理和立即重跑裁决。

## 提案

依赖合并并收到真人解阻后，按以下三个与正式验收语句一一对应的功能切片完成 T6.5：

1. **真实主界面复合组件整合与截图走查**：先核对 #143、#144 合并后的真实共享出口、props、Story 和测试，再在 `OperatorConsole` 中接入 agent 折叠消息、运行块、运行结局、会话侧栏、角色 composer、空状态和会话上下文顶栏；保持现有打开项目、新建会话、选择会话、切换 workspace、中断、发送与诊断回调不退化。使用 fake／固定数据逐条走查 T6.5 (a)–(f)，由结构化 DOM 断言证明交互，以截图作视觉证据；所有浏览器、服务器和子进程操作有界，失败时强制清理且非零退出。
2. **默认可见文案人话化与自动门禁**：用纯呈现 adapter 把现有 `OperatorProject`、`OperatorSession`、`OperatorMessage`、`OperatorRunSnapshot` 映射到复合组件最小模型；默认可见区只出现中文角色、状态和错误概括，机器原文完整进入默认关闭的原始信息详情。硬门同时扫描浏览器可见文字与完整可访问树；body、error、cwd、runDir、workspace mode、dead-letter reason、handoff 原文各用本轮唯一哨兵验证默认隐藏、对应详情展开后逐字命中且不串位。证据运行先清场并在成功后记录 run id、时间、`baseHead`、`testedSourceDigest`、payload artifact SHA-256 和 `t65-evidence.sha256`。
3. **roadmap 与 GitHub 收尾**：全部验收通过后才勾选 T6.5，并在 `docs/roadmap/milestone-4-local-console.md` 追记本轮证据；提交前重新核对被测源码 manifest，提交后从 commit blob 重算同一组摘要，均必须匹配 evidence。提交信息包含 `Closes #142`，推送当前 issue 分支。PR 收尾先按当前分支有界查询：唯一命中则复用、零命中才创建、多命中 fail-closed；创建超时或响应丢失后只重新查询找回，不盲目再次创建。最终回读 PR body，确认 `Closes #142`、本轮 run id、commit SHA、`testedSourceDigest` 和验收证据摘要。

## 影响

计划影响：

- `packages/console-ui/src/console/operator-console.tsx`、共置测试和 Story：真实整页组合与呈现 adapter。
- `packages/console-ui/src/index.ts`：统一导出 #143、#144 交付的复合组件及其公共类型。
- `desktop/src/console-page/app.tsx`：仅当合并后的真实 props 无法由 `OperatorConsole` 内部适配时，做最薄的回调／字段装配；不复制展示规则。
- `scripts/acceptance/local-console-t65.ts`：复用现有 fake local console 与 desktop 静态 renderer，提供统一有界执行、跨平台进程树清理、故障清理、artifact staging／新鲜度校验、被测源码 manifest、T6.5 (a)–(f)、完整可访问树、字段哨兵、截图和结构化证据。
- `artifacts/acceptance/`：实现验收时生成 T6.5 截图、可见文字和 JSON 证据。
- `docs/roadmap/milestone-4-local-console.md`：仅在实现和验证全部通过后勾选 T6.5 并追记证据。
- `openspec/changes/desktop-console-t65-integration-closeout/`：记录方案、任务与 `console-ui`／`desktop-shell` 行为增量。

明确不在范围内：

- #143、#144 合并前不修改源码、roadmap，不提交、不推送、不创建 PR。
- 不修改 runner、local-console server/store/runtime、SQLite schema、Codex、GitHub 模式或后端业务语义。
- 不把静止会话推断为已完成；只有上游明确提供完成事实时才进入已完成折叠组。固定验收数据可以验证该展示能力，但生产映射不得伪造完成态。
- 不删除 cwd、runDir、workspace mode、dead-letter reason、handoff 原文或其他机器证据；只改变默认披露层级。
- 不回迁旧 HTML 原型，不创造第二套设计事实源。

## 验收语句

以下三条原样沿用 issue 已确认验收清单；本 change 不改写、合并、替换、删除或扩展其目标：

1. 打开真实桌面台并逐条执行验收场景 (a)-(e) → 所有复合组件行为与 conversation-console 设计一致，并产出可核查截图 artifact。
2. 对主界面普通用户可见文案检查 worktree、direct、cwd、runDir、dead-letter、handoff 及英文作者标签 → 折叠详情和代码标识符之外命中 0；运行 console-ui test、desktop build、typecheck → 均退出码 0。
3. 检查 milestone-4-local-console.md、Git 提交和 PR → T6.5 已勾选并追记验收证据，提交含 Closes #142，分支已推送，PR body 含 Closes #142 与验收证据摘要。
