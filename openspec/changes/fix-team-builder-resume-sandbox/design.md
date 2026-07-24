# 设计:fix-team-builder-resume-sandbox

## 覆盖的验收落点

- **规则 14**:execution profile 只读 sandbox 常态 —— `src/config.ts:218-226` resume 分支修补

审计发现原文(from `~/dev-loops/agent-moebius/onboarding/audit-findings.md`):

> 违反: `src/config.ts:218-226` 与 `tests/codex.test.ts:483-485` — 只有 `mode="full"` 时才注入 `--sandbox read-only` 与 `--cd <isolatedCwd>`;`mode="resume"` 分支仅保留 `--skip-git-repo-check`,且单测明确断言 `expect(resume).not.toContain("--sandbox") / .not.toContain("--cd")`。

## 方案

把 `common` 数组扩为完整只读 profile,resume 分支也包含 `--sandbox read-only` + `--cd <isolatedCwd>`。相应更新 `tests/codex.test.ts` 断言(把 `not.toContain` 反转为 `toContain`)。

## 权衡

- codex CLI 续轮的 sandbox 行为可能已通过 thread 继承生效;显式加参数是防御深度,不是修 bug。选它的原因:PRD 规则句是「execution profile 常态」而非「full-only 常态」,规格闸门不允许留想当然
- 不改 `mode="full"` 分支——即使 full-only 有其他独有参数,也应在别处处理

## 风险

- codex CLI 续轮时若 `--sandbox` 与 thread 已有 sandbox 冲突,可能报错——需 implement 段跑真实 resume 冒烟验证
- 若 codex 不允许 resume 时改 `--cd`,退回只加 `--sandbox`;由 codex implement 段判断
