# 任务：separate-onboarding-orchestration

- [x] 新增版本化 `onboarding-orchestration.json` 模型、parser/serializer 与 `ready | missing | invalid` 读取 adapter。
- [x] 从 `TeamDefinition`、`team.json` serializer、团队记录缓存与新身份指纹中移除 `relayBeats`。
- [x] 为无字段旧 manifest/记录和内嵌 beats 过渡 manifest/记录实现窄兼容读取与安全迁移。
- [x] 为曾包含内嵌 beats 的旧身份指纹补一次性重定位兼容，成功后收敛到核心指纹。
- [x] 把内置开发团队 6 拍从 `team.json` 移到 `onboarding-orchestration.json`，同步播种校验。
- [x] 调整 AI team writer，在 staging 目录原子写入并重读团队核心、独立编排和成员文件。
- [x] 调整团队列表 IPC / renderer DTO，从独立 adapter 投影显式编排状态，禁止编排错误改变团队状态。
- [x] 保持 RelayDemo 正常播放行为，增加 missing/invalid 局部空态且允许继续。
- [x] 落地设计中的旧数据、迁移、指纹、AI 原子写入与 UI 空态单元测试。
- [x] 运行定向测试、desktop build、`pnpm typecheck` 与完整 `pnpm test`。
- [x] 更新 `docs/architecture/module-map.md` 与根 `AGENTS.md` 的团队文件布局说明。

## 验证记录

- `pnpm typecheck`：通过。
- desktop 定向 74 项、console-ui onboarding 定向 12 项：通过。
- `pnpm --filter @moebius/desktop build`：通过。
- console-ui 全量 271 项：通过。
- desktop 全量 237 项中 236 项通过；既有 `console-app-subtask-tab` 状态等待用例超时，独立复跑仍失败，未经过本变更链路。
- 根 `pnpm test` 已完整执行；582 项中 574 项通过，8 项为 SQLite 初始化 / 长链路时限及 rollout 不可用原因差异，未出现团队定义、编排、AI writer 或 onboarding 相关失败。
- `pnpm exec openspec validate separate-onboarding-orchestration --strict`：仓库未安装 `openspec` 命令；已人工核对 delta 回流、Source 锚点、任务勾选、架构图回流与日期归档。
