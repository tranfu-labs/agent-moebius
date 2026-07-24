# 提案：new-session-project-switcher

## 背景
本地桌面操作台已经能持久化多个项目，并能按项目创建会话，但当前入口把“新会话”做成侧栏顶部的全局动作，调用时直接绑定当前 `selectedProjectId`。composer 上方虽然显示项目文件夹名称，却只是静态文字。因此用户无法从目标项目行直接新建会话，也无法在空白新会话发送第一条消息前修正项目上下文。

用户已确认两个入口：

1. 左侧栏每个项目文件夹行右侧提供新会话按钮。
2. 空白新会话的 composer 上方文件夹入口可点击，并显示项目下拉菜单。

## 依赖与事实基线
本 change 依赖 `local-console-t46-project-workspace-source` 已落地的多 project 持久化、project API 与 session `project_id` 外键能力。该前置 change 的实现和验收已经进入 `origin/main`，但其 delta 尚未归档，当前 `openspec/specs/local-console/spec.md` 与 `openspec/specs/console-ui/spec.md` 仍残留“单 project”旧规则。

为避免把未归档 delta 当成隐形事实，本 change 的 spec delta 会显式替换本功能触及的“one/single local project”规则，并重述依赖的多 project 最终行为。归档本 change 前必须确认：T4.6 已先归档，或本 change 的冲突替换随归档一并进入事实规格；不能让最终规格同时保留单 project 与多 project 两套冲突规则。

## 提案
1. 把新会话动作下沉到每个项目标题行右侧；点击时显式携带该项目 id 创建并选中新会话，移除容易误解归属的全局“新会话”行。
2. 空白、未运行且没有父子编排关系的新会话把 composer 文件夹上下文渲染为受控项目下拉菜单；切换后保持当前 session id、输入草稿和选中态。
3. 在 local console store/runtime/API 增加“重绑空白 session 项目”能力。事务内同时验证 `sessions.parent_session_id`、反向 child 查询与 `session_edges` 双事实源，且 session 没有任何消息或运行事实；已有历史的会话保持项目不可变。
4. 重绑 API 使用稳定 domain error code：malformed input 为 400，session/project 不存在为 404，已有历史或关系冲突为 409；预期业务拒绝不落入 500，也不靠错误字符串匹配。
5. `console-ui` 继续只通过 props/callbacks 表达交互；desktop renderer 使用显式 selection、request generation 与 AbortController 收敛轮询和 mutation 的乱序响应，并以统一同步 pending gate 串行化 create/open/rebind。任一 selection-changing mutation 未完成时，侧栏选择、项目行新建、打开项目和项目菜单同时禁用，handler 仍二次拒绝迟到或重复意图；重绑期间还禁止发送首条消息。
6. 增加组件、SQLite/store、runtime/server 与 renderer 契约测试，覆盖项目归属、双事实源、HTTP 错误分流、旧 refresh 丢弃及 selection mutation 并发互斥。
7. 把全量 `pnpm test`、typecheck、desktop build、`git diff --check` 与可见交互截图列为最终质量门。

## 影响
- `packages/console-ui/src/console/conversation-sidebar.tsx`：项目行新会话按钮与回调。
- `packages/console-ui/src/console/operator-console.tsx`：移除全局新会话入口；空白会话项目下拉与锁定态。
- `desktop/src/console-page/app.tsx`：按项目创建会话、重绑空白会话并刷新选中态。
- `desktop/src/console-page/state-sync.ts`、`desktop/tests/console-state-sync.test.ts`：可测的显式 selection / generation 请求协调与 deferred fetch 乱序测试。
- `src/local-console/{types,store,runtime,server}.ts`、`src/sqlite-state.ts`、`src/sqlite-state-worker.ts`：受限 session 项目重绑命令与 API。
- 对应 Vitest、local console 集成测试、Storybook/桌面验收产物。
- GitHub runner、已有消息的本地会话归属、workspace direct/worktree 语义不变。

## 验收语句
1. 打开包含两个项目的桌面操作台 → 点击第二个项目文件夹行右侧的新会话按钮 → 应在第二个项目下创建并选中一个空白新会话，且第一个项目不新增会话。
2. 打开一个没有消息和运行记录的新会话 → 点击 composer 上方文件夹并在下拉菜单选择另一项目 → 应看到当前会话保持选中、项目名称切换到目标项目、输入草稿不丢失且该会话移动到目标项目分组。
3. 打开已有消息、运行记录或父子关系的会话 → 查看 composer 上方文件夹上下文 → 应看到项目名称保持可见但没有项目切换菜单，直接调用重绑 API 应失败且原项目、消息与关系不变。
4. 跑 `pnpm --filter @moebius/console-ui test` → 应退出码为 0，并覆盖项目行按钮、项目下拉选择与锁定态。
5. 跑 local console 相关 Vitest → 应退出码为 0，并覆盖目标项目不存在、空白会话成功重绑、已有消息/父子关系拒绝重绑及事务无部分写入。
6. 跑 `pnpm typecheck` 与 `pnpm --filter @moebius/desktop build` → 两条命令都应退出码为 0。
7. 跑 `pnpm test` → 应退出码为 0，且 selection mutation deferred 并发用例证明 pending 期间侧栏选择、项目行新建、打开项目和项目菜单不会造成 selection 回跳或重复 mutation。
