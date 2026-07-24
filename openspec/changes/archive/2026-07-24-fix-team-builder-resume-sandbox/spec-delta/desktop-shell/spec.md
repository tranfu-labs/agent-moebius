# spec-delta: desktop-shell / fix-team-builder-resume-sandbox

## Requirement: AI 建队续轮显式保持只读 execution profile
Source: docs/product/pages/onboarding.md#AI-建队技术约束
Acceptance: onboarding#20

系统 MUST 在 AI 建队 `codex exec resume <threadId>` 续轮中显式传入 `--sandbox read-only` 与当前草稿的隔离 cwd。系统 MUST NOT 依赖 Codex thread state 隐式继承 sandbox 或 cwd 来满足隔离约束。

### Scenario: 续轮命令声明只读 sandbox 与隔离 cwd
- GIVEN AI 建队草稿已有 Codex thread id 与独立 isolated cwd
- WHEN 系统为下一轮构造 `codex exec resume <threadId>` 命令
- THEN 参数包含 `--sandbox read-only` 与 `--cd <isolatedCwd>`
- AND 参数不包含 `--yolo` 或其他绕过 sandbox 的选项
