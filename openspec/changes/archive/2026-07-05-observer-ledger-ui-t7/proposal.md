# 提案：observer-ledger-ui-t7

## 背景
里程碑 3 T7 要把本地 observer 从 run/debug 视图升级为目标账本视图。当前 observer v0 只能按白名单 issue 聚合 intake、role thread、agent context 与 run manifest，用户仍需要直接读 `.state/goal-ledger.json`、`.state/run-manifests.jsonl` 和多条 GitHub issue 时间线，才能判断一个多子任务目标卡在哪个阶段、哪个任务、哪条证据或哪处人工闸口。

T1 到 T6 已经提供了 goal-ledger schema、active phase projection、child acceptance fact、integration acceptance event、显式 runManifestRefs 和 roundtable child ref 的账本事实。T7 的 v0 质量基准是 `数据正确级`：状态映射必须可信，体验可以保持朴素；操作能力不进入范围，GitHub 仍是对话与确认介质。

## 提案
升级 `src/observer/` 为只读账本 UI：

- 新增 `.state/goal-ledger.json` 只读输入。缺失按空账本诊断；损坏或 shape 非法时只让 ledger 树区域进入读取失败空态，现有 issue/run 视图继续可用。
- ledger 读取必须有界：`.state/goal-ledger.json` read 永不 settle 或超时时，observer HTTP request 仍在配置超时内返回 timeout 诊断，legacy issue/run 区域继续可见。
- 主页面改为目标 → 里程碑 → 任务树。主树只展示与 watched repositories 有关的 ledger goal；完全无白名单关联的 goal 不进入主树，只进入诊断计数。
- 每个 goal、milestone、task 在自身层级展示 phase 摘要：active 高亮，pending/completed 折叠；同一 owner 多个 active 标为该 owner 的 ledger 错误，主树仍渲染，不切到全局 read-failure fallback。
- task detail 展示 readiness、quality baseline、dependencies、scope 摘要、acceptance statements 数量与最新结果、child issue refs、parent issue ref、integration acceptance event、runManifestRefs、active phase projection 和 blocked / waiting reason。
- gate 区域只读展示等待谁、等待什么、依据来自哪个 ledger fact / issue ref / integration event，以及下一步应去哪个 GitHub issue 评论完成。无法定位时显示“闸口不可定位：ledger 缺 parent/child issue reference”。
- run evidence 只使用 `TaskRecord.runManifestRefs` 显式引用。未能挂到 task 的本地 run manifest 进入独立 `Unlinked local runs` 折叠区，不能算作任务证据。
- 识别 task child ref bounded note 中精确 roundtable hidden key 形态，只显示 `roundtable child` badge，不显示 hidden key 原文，不误标近似但非 roundtable 的文本，也不把 roundtable completion 计为 child acceptance pass 或 integration acceptance。
- 保留 observer 只读边界：不提供确认按钮，不写 `.state/goal-ledger.json`，不发 GitHub 评论，不新增 runner 写接口，不调用 `gh` 或 `codex`，不做 file watcher。

## 影响
- 修改 `src/observer/read-state.ts`、`src/observer/model.ts`、`src/observer/render.ts` 与 observer 测试；不改 runner 主链路。
- `openspec/specs/github-issue-runner/spec.md` 归档时补充 T7 observer ledger UI 行为规则与场景。
- `docs/wireframes/pages/observer.md` 与 `docs/wireframes/flow.md` 归档时回流新版 observer 线框和数据流。
- `docs/roadmap/milestone-3-orchestration.md` 实现完成并验收通过后追记 T7 验收证据并勾选任务。
