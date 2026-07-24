# 提案：separate-onboarding-orchestration

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/onboarding.md` | `第 2 步 · AI 建队子流程`、`第 3 步 · 团队协作示例`、`AI 建队技术约束`、`页面状态`、`指标与验收` | 明确协作示例是独立引导编排数据；缺失或损坏只产生局部空态 | 已写入 |
| `docs/product/pages/agent-teams.md` | `AI 建队` | 明确独立编排不属于团队核心、身份或真实调度规则 | 已写入 |

## 背景

`onboarding-relay-demo` 为第 3 步接力动画新增 `relayBeats` 后，直接把它加入 `TeamDefinition` 与 `team.json` 的必填字段。升级前的用户团队及 `.agent-team-records.json` 缓存没有该字段，桌面启动时 `listRecordedUserTeamSnapshots()` 会把历史缓存交给最新严格解析器，抛出 `team.json relayBeats must be an array`，导致整个 `agent-teams:list` IPC 失败。

这不只是缺少一次 schema migration。`relayBeats` 只描述首次引导中的一段协作示例，真实本地会话从未读取它；团队成员职责与交接原则来自 `AGENT.md`，主 Agent 应按当前任务灵活调度。把一次性演示数据放进团队核心定义，会让展示元数据影响团队可用性、身份指纹、重定位与全部列表读取，并在成员演化后制造无意义的同步负担。

当前现场同时存在两类兼容输入：

1. 更早的 `team.json` 与记录缓存完全没有 `relayBeats`。
2. 最近版本已经把 `relayBeats` 内嵌进 `team.json`，身份指纹也曾把它算入。

变更必须同时兼容两类数据，不能只修当前一条旧记录。

## 提案

1. 将 `TeamDefinition` 恢复为团队核心：名称、描述、主 Agent slug 与成员顺序；`team.json` 不再保存 `relayBeats`。
2. 新增可版本化的 `<team>/onboarding-orchestration.json`，独立保存第 3 步使用的 `relayBeats`。该文件不参与团队可用性、团队记录缓存、身份指纹或真实会话 roster/prompt。
3. 内置开发团队把现有 6 拍演示移入独立文件；AI 建队继续生成并校验自己的协作示例，提交时与团队核心和成员文件一起在 staging 目录原子写入。
4. 兼容读取最近版本内嵌在 `team.json` / `lastKnownDefinition` 的 `relayBeats`。团队核心解析忽略其缺失或损坏；引导编排读取在独立文件缺失时有界读取合法的内嵌旧数据，并在下一次安全的用户团队定义写入前先写独立文件、再移除内嵌字段。
5. 身份指纹新版本只覆盖团队核心与成员 `AGENT.md`。旧记录若曾把内嵌演示算入，重定位校验同时接受一次旧算法；成功读取或重定位后写回新算法指纹。
6. 第 3 步保持当前节点、连接线、消息、时序、重播与 reduced-motion 体验。编排缺失或损坏时只在演示卡内显示局部空态，保留“上一步”和“继续”，不加载其他团队脚本、不抛出 renderer 崩溃。

## 影响

- `desktop/src/team-model.ts`、`team-store.ts`、`team-record-store.ts`：恢复核心定义边界并兼容两代记录/指纹。
- 新增 desktop 独立编排模型与磁盘 adapter；`team-ipc.ts` 只把可用的编排预览投影给 renderer，失败不改变团队状态。
- `desktop/src/ai-team-builder/*`：输出 schema 仍要求协作示例，team writer 改写独立文件并做原子重读校验。
- `seeds/teams/development/`：把内嵌 6 拍迁到独立文件。
- `packages/console-ui/src/onboarding/relay-demo/*`：正常动画不变；增加缺失/损坏局部空态。
- 行为事实源：`desktop-shell` 与 `console-ui` 两个 spec delta。
- 架构事实源：更新 desktop-shell 的团队数据流说明与图。
