# 提案：local-console-t4-desktop-operator-console

## 背景

T2 已经证明纯本地通道可以替代 GitHub issue 做最小输入源和输出汇：本地 HTTP 页面写入 SQLite 消息，local intake 复用 mention trigger，Codex final response 经 local sink 回写。T3 已经把会话时间线和 runner state 统一进 `.state/local-console.sqlite`，并保留会话表、会话关系表和 `session_messages` 作为后续多会话基础。

当前缺口是 T4：`console-ui` 仍停在组件库和设计样板，Electron 主窗口仍是状态页；本地通道也只提供单会话快照和提交消息接口。用户在桌面台发起对话时，看不到项目到会话的导航，看不到 Codex 运行过程直播，不能显式中断运行，也不能把本地错误作为一等记录查看。

产品经理已确认 T4 作为单一垂直切片推进，范围不扩到 T5/T6：

- Electron 主窗口升级为操作台主界面；当前 status / observer 仅作为辅助诊断入口。
- 运行直播接受 stdout/jsonl 尾行、runDir、耗时、运行状态；拿不到结构化步骤时降级为单行概括，不能空白；尾流读取必须有 byte/time 边界，避免拖垮 state API。
- 本轮最小支持一个本地项目下的多会话创建和切换；跨多个真实 repository/project 的完整管理不进本轮。
- 点击中断应终止当前 Codex run、释放会话；UI 与持久化记录必须区分“用户中断”“卡住”和“错误失败”。
- 失败验收可用 fake Codex 非零退出或 spawn error；store 写入失败只做补充边界，不作为唯一失败验收。

## 提案

把 T2/T3 本地通道升级为桌面操作台真客户端：

1. 扩展 `src/local-console/` 的会话与运行 API：支持一个本地项目下多会话列表、创建、选择、提交消息、查询运行快照、有界读取 stdout/jsonl 尾流、显式中断当前 run，并把中断、卡住与失败分别持久化。
2. 在 Electron 主进程中把本地操作台作为主窗口数据源：主窗口加载真实操作台 renderer，preload 暴露窄 API；原状态页/observer 作为诊断入口保留，不再是默认主界面。
3. 复用并补齐 `@agent-moebius/console-ui` 的展示组件：项目/会话侧栏、单时间线多角色消息、运行直播块、中断按钮、状态/错误记录和输入框。组件仍保持展示层边界，不直接依赖 IPC、Codex、SQLite 或 runner。
4. 保留 T4 的数据正确级边界：不改核心链路业务语义，不做交棒总线、CEO 兜底、子会话编排、GitHub flag 收口，也不追求跨多真实项目管理。

## 影响

- `src/local-console/`：新增多会话、运行快照、有界输出尾流、中断语义和卡住状态；扩展 SQLite command/store 类型；新增可测的输出摘要解析与运行状态 view model。
- `src/codex.ts`：如有必要只复用现有 `AbortSignal` 中断能力和 stdout/jsonl 文件，不改变 Codex final response 解析语义。
- `desktop/`：新增操作台 renderer 构建与 preload IPC；主窗口默认展示操作台，诊断状态页/observer 通过辅助入口打开。
- `packages/console-ui/`：新增操作台展示组件与测试/Storybook 变体；继续禁止引入 runner/IPC/GitHub/Codex 依赖。
- `openspec/specs/local-console`、`desktop-shell`、`console-ui`：实现归档时合并本 change 的 spec-delta。
- `docs/wireframes/` 与 `docs/roadmap/milestone-4-local-console.md`：实现完成归档时回流 console 页面线框，并把 T4 验收证据追记到 roadmap 且勾选。
