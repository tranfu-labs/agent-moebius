# 设计:fix-team-builder-resume-sandbox

## 覆盖的验收落点

- **规则 14**:execution profile 只读 sandbox 常态 —— `src/config.ts:218-226` resume 分支修补

审计发现原文(from `~/dev-loops/moebius/onboarding/audit-findings.md`):

> 违反: `src/config.ts:218-226` 与 `tests/codex.test.ts:483-485` — 只有 `mode="full"` 时才注入 `--sandbox read-only` 与 `--cd <isolatedCwd>`;`mode="resume"` 分支仅保留 `--skip-git-repo-check`,且单测明确断言 `expect(resume).not.toContain("--sandbox") / .not.toContain("--cd")`。

## 方案

把 `common` 数组扩为完整只读 profile,resume 分支也包含 `--sandbox read-only` + `--cd <isolatedCwd>`。相应更新 `tests/codex.test.ts` 断言(把 `not.toContain` 反转为 `toContain`)。

## 权衡

- codex CLI 续轮的 sandbox 行为可能已通过 thread 继承生效;显式加参数是防御深度,不是修 bug。选它的原因:PRD 规则句是「execution profile 常态」而非「full-only 常态」,规格闸门不允许留想当然
- 不改 `mode="full"` 分支——即使 full-only 有其他独有参数,也应在别处处理

## 风险

- codex CLI 续轮时若 `--sandbox` 与 thread 已有 sandbox 冲突,可能报错——需 implement 段跑真实 resume 冒烟验证
- 若 codex 不允许 resume 时改 `--cd`,退回只加 `--sandbox`;由 codex implement 段判断

## Implement 冒烟结论(2026-07-24)

- 环境:`codex-cli 0.144.1`
- 首轮以 `codex exec --sandbox read-only --cd <isolatedCwd>` 创建 thread `019f9244-e18b-7f02-b5d0-633942979386`,成功返回 `full-ok`
- 按当前 `buildCodexArgs` 顺序执行 `codex exec resume --sandbox read-only --cd <isolatedCwd> ...` 时,CLI 在运行 thread 前以 `unexpected argument '--sandbox'` 退出
- 按设计退回仅传 `--sandbox read-only` 后仍得到同一解析错误,因此不能在 `buildTeamBuilderExecOptions` 内安全降级
- 对照实验把 `--sandbox read-only --cd <isolatedCwd>` 放在 `resume` 子命令之前,同一 thread 成功返回 `resume-parent-flags-ok`;说明两项隔离参数与 thread state 不冲突,冲突来自参数层级

决定:不保留会让全部 AI 建队续轮在参数解析阶段失败的 config-only 改动。完整修复需要让 `src/codex.ts` 在 resume 模式把 exec 级 `--sandbox` / `--cd` 放到 `resume` 子命令之前,并补相应参数顺序测试;该范围超出本 change 明确锁定的 `src/config.ts:200-231` 与 `tests/codex.test.ts:466-487`,等待 review 决定是否扩围。

## 扩围实施结论(2026-07-24)

用户按 `loop-recommend-dont-ask` 明确允许扩围到 `src/codex.ts:525-541`。最终实现:

- `buildTeamBuilderExecOptions` 的 full 与 resume 都返回 `--sandbox read-only`、`--cd <isolatedCwd>`;full 参数顺序不变
- `buildCodexArgs` 仅在 resume 模式提取 `--sandbox` 与 `--cd` 的参数对,放到 `exec` 子命令之前;其余 exec options、图片、thread id 与 prompt 保持原顺序
- 默认普通 Agent profile 不含这两个参数,其 resume 仍以 `codex exec resume` 开头
- 新建 thread `019f9253-790e-7c42-abeb-287c7a423589` 后,full 返回 `full-parent-smoke-ok`;按目标形态续轮同一 thread 返回 `resume-parent-smoke-ok`

决定:保留 `--sandbox read-only` + `--cd` 两项隔离参数,不采用只加 sandbox 的降级。
