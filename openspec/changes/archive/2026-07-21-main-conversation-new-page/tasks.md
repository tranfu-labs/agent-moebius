# 任务：main-conversation-new-page

任务编号 `T\d+` 是 loop 调度器识别 id 的固定契约。`覆盖验收 #N` 指 `docs/product/pages/main-conversation.md`「验收标准」的编号。

- [x] T1: 标题取首句的纯函数
  - [x] 新增 `src/local-console/title.ts`，导出 `deriveSessionTitle(body)`：折叠连续空白、只取首行、按显示宽度截断、全空白或全符号时兜底
  - [x] 新增 `tests/local-console-title.test.ts`：普通首句 / 超长截断 / 含换行只取首行 / 纯空白与纯符号兜底 / 首尾空格
  - [x] 覆盖验收 #3（标题部分）

- [x] T2: 会话创建与首条消息原子化
  - [x] `POST /api/local-console/sessions` 接受可选 `initialMessage`
  - [x] `runtime.createSession` 在同一事务内 INSERT session（title 由 T1 导出）+ INSERT 首条 user message + 触发本轮路由
  - [x] 不带 `initialMessage` 时行为不变；子会话创建路径不依赖该字段
  - [x] 新增 `tests/local-console-create-session.test.ts`：原子落盘 / 中途失败不留半个会话 / 子会话路径不受影响
  - [x] 覆盖验收 #3

- [x] T3: renderer 本地草稿持久化
  - [x] 新增 `desktop/src/console-page/draft-store.ts`：`read` / `write` / `clear`，key 为 `draft:new` 与 `draft:<sessionId>`
  - [x] 会话创建成功后先 `commitSelection` 再清 `draft:new`
  - [x] 新增 `desktop/tests/draft-store.test.ts`：两种 key 隔离 / 创建后清 `draft:new` / 已有会话草稿不被新对话覆盖
  - [x] 覆盖验收 #19

- [x] T4: 新对话页组件取代模态弹窗
  - [x] 新增 `packages/console-ui/src/console/new-conversation-page.tsx`：引导语 + 上下文按钮 + composer，纯展示不含创建逻辑
  - [x] 项目未选定时不显示工作空间与分支，发送禁用，输入框下方常驻一行禁用原因
  - [x] 删除 `operator-console.tsx` 的 `NewConversationDialog` 与 `applicationOverlay` 的 `new-conversation` 分支
  - [x] 主内容区按有无选中会话在会话视图与新对话页之间切换
  - [x] `operator-console.test.tsx` 中针对旧弹窗的用例重写为新对话页用例，不留死代码
  - [x] 新增共置 Story
  - [x] 覆盖验收 #1 #2 #4

- [x] T5: 顶部进入不预选项目，项目行进入带上项目
  - [x] 侧边栏顶部「新建对话」进入时 `projectId` 为空，且侧边栏顶部呈现选中态、项目列表不新增行
  - [x] 项目行新建入口进入时带上该项目，与顶部进入是同一个页面
  - [x] 覆盖验收 #1 #2

- [x] T6: 新对话页草稿状态机
  - [x] `desktop/src/console-page/new-conversation.ts` 改造为草稿状态机：项目 / 团队选择、草稿文本、能否发送、提交
  - [x] 相关状态从 `app.tsx` 迁出；不重构 `app.tsx` 中与本片无关的部分
  - [x] 团队按上次成功创建对话时使用的团队预选；无历史或已不可用时回退到自带的第一支团队
  - [x] 覆盖验收 #4

- [x] T7: 创建时序改造
  - [x] `state-sync.ts` 的 `createSession` 改为 `createSessionWithFirstMessage`，单个 mutation token 内完成建会话 + 落首条 + 提交选中
  - [x] 创建过程中防止重复提交；创建失败时保留全部已填内容并显示可理解的原因
  - [x] 现有 mutation 序列化回归用例保持绿
  - [x] 覆盖验收 #3

- [x] T8: 添加项目移入项目按钮
  - [x] 项目下拉列出全部可用项目，末尾分隔线 + 「添加项目…」，复用 `onOpenProject`
  - [x] 添加成功后直接成为这段对话的项目；取消或失败时不创建项目、不改变当前选择、页面其他输入保留
  - [x] 所选文件夹已绑定活动项目时不重复添加，提示该文件夹已被使用
  - [x] 覆盖验收 #4

- [x] T9: 项目发出首条后锁定
  - [x] 已有消息的会话，项目显示为不可点击文本
  - [x] 覆盖验收 #5（项目锁定部分）

- [x] T9.5: 页面标题呈现
  - [x] 还没有消息时页面标题显示「新对话」
  - [x] 发出首条后显示由该条消息导出的标题，之后不随对话内容变化
  - [x] 长标题单行截断，悬停显示完整标题
  - [x] 本版不提供手动修改标题的入口（PRD 对是否允许改标题明确不作答）
  - [x] 覆盖验收 #3

- [x] T10: 旧事实源退役标注
  - [x] `docs/wireframes/pages/console.md` 顶部声明主内容区事实已由 `docs/product/pages/main-conversation.md` 接管
  - [x] `docs/product/pages/new-conversation.md` 顶部声明已被 `main-conversation.md` 取代
  - [x] 只加声明，不删历史内容
  - [x] 作废：跨页面 PRD 改动，另开文档 change 处理；本 change 不修改 `docs/product/pages/main-sidebar.md`

- [x] T11: 真实桌面窗口验收
  - [x] `pnpm desktop` 起开发态，经 CDP `9222` attach 真窗口
  - [x] 顶部进入 → 项目未选定、工作空间与分支不显示、发送禁用且原因可见
  - [x] 选项目 → 四项上下文出现、发送可用
  - [x] 发首条 → 侧边栏出现该行并选中，标题为首句开头
  - [x] 进入又退出 → 侧边栏无新增行
  - [x] 写草稿 → 重启 `pnpm desktop` → 草稿还在
  - [x] 项目按钮展开 → 有「添加项目…」；环境限制放行：真实窗口已验到原生目录 IPC 等待态，返回后的选中行为由 state-sync 装配测试覆盖
  - [x] 覆盖验收 #1 #2 #3 #4 #19
