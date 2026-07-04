# 提案：harden-runner-stability-t1

## 背景

里程碑 2 T1 要求系统性消除 runner 的"卡死"类故障：GitHub CLI 调用必须有界，持续失败必须进入可见死信或恢复；Codex 子进程必须有 watchdog，超时后释放 driver pool 名额；所有失败分支不能出现既不推进也不报告的状态；已合入的 `src/issue-media.ts` SVG 输入过滤 hotfix 需要补齐 OpenSpec 与测试。

现状已有部分基础：

- `src/retry.ts` 已提供有限次数 retry 与 `AbortSignal` 支持。
- `src/github-response-intake.ts` / `src/runner.ts` 已有失败计数与死信折叠。
- `src/config.ts` 已有 `GITHUB_CLI_RETRY_POLICY` 与 `CODEX_RUN_MAX_DURATION_MS` 并进入启动日志。
- `src/runner.ts` 已有 Codex watchdog 逻辑。
- `src/issue-media.ts` 已过滤 `.svg` issue 输入引用，但 `tests/issue-media.test.ts` 仍保留旧期望，缺少正规测试。

剩余风险集中在三点：单次 `gh` 子进程本身仍可能无限挂起；Codex watchdog / driver pool 释放缺少故障注入验收测试；SVG hotfix 缺 OpenSpec 归档链路与测试证明。

## 提案

本变更按 T1 最小范围补齐稳定性闭环：

1. 在 `src/github.ts` 内为每次 `gh` 子进程执行增加显式超时 / abort 终止路径；读操作与幂等 reaction 仍走有限 retry，写评论 / release upload 仍不自动重试，避免重复可见副作用。
2. 补充 gh 持续失败的故障注入测试，证明有限尝试后进入 intake 失败记账、最终可达死信或恢复，且心跳派发不被阻塞。
3. 补充 Codex 卡死故障注入测试，证明 watchdog 触发后返回失败、issue 从 in-flight 释放、driver pool 名额归还；初始测试暴露必须改 `src/runner.ts` 才能覆盖 fake driver promise 永不返回路径，已按后续授权最小触碰 runner 编排层。
4. 正规化 SVG 输入过滤：更新 / 增补 `tests/issue-media.test.ts`，覆盖 Markdown image、Markdown link、HTML image 与 bare URL 中的 `.svg` 均不进入 issue media references；保留 output artifact 对 SVG 的发布支持不变。
5. 实现后归档本 change，把 spec-delta 合回 `openspec/specs/github-issue-runner/spec.md`，并把验收证据追记到 `docs/roadmap/milestone-2-stability-oracle.md` 的 T1 下方后勾选。

## Scope gate

PM 初始确认本任务不授权修改 `src/runner.ts` 与 `src/config.ts`。实现阶段已停下说明“fake driver promise 永不返回也释放名额”需要 runner 编排层 timeout race；loop watcher 授权最小触碰 runner.ts 后，本 change 仅为验收语句 2 增加必要 watchdog 兜底，不扩展其它调度或轮询逻辑。`src/config.ts` 与 `agents/` 仍不在 scope 内。

## 影响

- 运行时模块：`src/github.ts`、`src/retry.ts`、`src/codex.ts`、`src/driver-pool.ts`、`src/github-response-intake.ts`、`src/issue-media.ts` 中按需最小改动。
- 测试：对应更新 `tests/github.test.ts`、`tests/retry.test.ts`、`tests/codex.test.ts`、`tests/driver-pool.test.ts`、`tests/github-response-intake.test.ts`、`tests/issue-media.test.ts`、`tests/runner.test.ts` 中与 T1 直接相关的用例。
- 文档 / 规格：新增并最终归档本 OpenSpec change；实现验收后更新 `openspec/specs/github-issue-runner/spec.md` 与 `docs/roadmap/milestone-2-stability-oracle.md`。
- 明确不改：`agents/`、Figma / issue 编排 / PR 预览相关能力。

## 验收语句

1. 跑注入 gh 网络故障的测试（fake adapter 持续报错）→ 应看到限期内进入死信或恢复，心跳不中断，无无限重试。
2. 跑注入 Codex 卡死的测试（fake driver 永不返回）→ 应看到 watchdog 超时强杀、按失败路径记录、driver pool 名额释放。
   - 已按 loop watcher 授权最小触碰 `src/runner.ts`，覆盖 fake driver promise 永不返回时 watchdog synthetic failed result 先 settle，随后按失败路径折叠并释放 driver pool 名额。
3. 跑 `rg -n "svg" tests/` 与 `git log --oneline -- src/issue-media.ts` → 应看到 SVG 过滤已有测试覆盖且已提交，对应 OpenSpec change 已归档。
4. 跑 `pnpm test` 与 `pnpm typecheck` → 应输出退出码 0。
