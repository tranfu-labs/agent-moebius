# 提案:fix-team-builder-resume-sandbox

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| docs/product/pages/onboarding.md | § AI 建队技术约束 / 验收 #20 | AI 建队 execution profile 常态使用只读 sandbox 与隔离 cwd,续轮不能例外 | 已写入 |

## 背景

规则句审计(2026-07-24 增量,在 d310146 合并后)发现:

- **落点**:`src/config.ts:218-226`(`buildTeamBuilderExecOptions`)
- **违反**:`mode="resume"` 分支只保留 `--skip-git-repo-check`,剔除了 `--sandbox read-only` 与 `--cd <isolatedCwd>`;单测 `tests/codex.test.ts:483-485` 明确断言 `expect(resume).not.toContain("--sandbox") / .not.toContain("--cd")`
- **规则句 14 判定**:「execution profile 使用只读 sandbox、隔离且不含项目素材的工作目录」是对整个 profile 的常态保证。续轮完全依赖 codex 内部对 thread sandbox 的继承——这是外部 CLI 行为,不在仓库中可证。一旦 codex 续轮默认回退到 workspace-write 就直接破约,属于**防御深度缺口**

## 提案

让 `buildTeamBuilderExecOptions` 在 `mode="resume"` 时也附加 `--sandbox read-only` 与 `--cd <isolatedCwd>`,与 `mode="full"` 保持一致。相应更新 `tests/codex.test.ts:483-485` 断言(改为 `expect(resume).toContain("--sandbox") / .toContain("--cd")`)。

具体是把 `common` 数组(适用于 full + resume 两模式)扩为完整只读 profile,`isolation` 数组(仅 full 独有)可以清空或删掉,由 codex 实施者判断。

## 影响

- **修改**:
  - `src/config.ts:200-231` — `buildTeamBuilderExecOptions` 的 mode 分支收敛
  - `src/codex.ts:525-576` — 经用户授权扩围,仅在 resume 装配时把 `--sandbox` / `--cd` 参数对提升到 `exec` 子命令之前
  - `tests/codex.test.ts` — resume profile、parent-level 参数顺序与普通 Agent 顺序回归断言
  - `desktop/tests/ai-team-builder-codex-spawner.test.ts` — 同步 AI 建队 spawner 的 resume profile 集成断言
  - 本 change 的 `design.md` / `tasks.md` / `spec-delta/desktop-shell/spec.md` — 记录 CLI 冒烟、扩围决定、实施证据与新增 Requirement
- **不动**:
  - `desktop/src/ai-team-builder/**` — spawner 已用 `buildTeamBuilderExecOptions`,自动获益
  - `mode="full"` 的参数装配
  - 其他 exec options / 普通 Agent codex 参数顺序

## 缘由锚

- 审计发现:`~/dev-loops/agent-moebius/onboarding/audit-findings.md#规则-14` 引句 + 落点 `src/config.ts:218-226`
- rule-binding 更新:该行判定从「已合规」升级为「已承接(经 fix-team-builder-resume-sandbox)」
