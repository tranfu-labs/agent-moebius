# 任务：orphan-run-surfaces-as-stuck

- [ ] 抽出孤儿判定纯函数：输入「SQLite running 记录集合 ＋ 当前进程 activeRun 集合」，输出需落 stuck 的孤儿集合；已 stuck/failed/interrupted 幂等跳过。
- [ ] 在 local-console 启动 catch-up 路径接入该判定，对每条孤儿运行复用既有 stuck 落地：写带 `orphaned-by-restart` 原因的可见系统记录、标 stuck、释放/恢复会话 cursor。
- [ ] 前端核验：`activeRun` 为空且该 run 历史为 stuck 时渲染「一步卡住了 ＋ 重试」，不再出现假活运行块或空白运行态；侧边栏该会话不再闪烁运行点（对齐 LC.T4.1 not blank running）。
- [ ] 单测（纯函数）：重启后 running 记录 → 判为孤儿；正常持有 activeRun → 不动；已 stuck/failed/interrupted → 幂等不重复写；无 running 记录 → 空结果。
- [ ] AI 验证：沿用 `scripts/acceptance/local-console-t4.ts` / `t45` 的 fake server 套路，构造「重启后遗留 running」场景，截图应出「一步卡住了」，侧边栏无闪烁点，刷新/重启后仍在。
