# spec-delta: github-issue-runner (codex-model-upgrade-5-6-sol)

本 delta 更新既有 "Codex provider 覆盖" 小节里的默认模型字面量（`gpt-5.5` → `gpt-5.6-sol`），并新增一条 model 覆盖能力的 REQUIREMENT。归档时合入 `openspec/specs/github-issue-runner/spec.md` 的同一节。

## MODIFIED Requirements

### Requirement: subscription baseline argv equivalence

- MUST default to the subscription mode when the `[codex]` table is absent or `provider` is missing/empty; in this mode the `codex exec` argv MUST be byte-for-byte equivalent to the baseline (`--yolo`, `--json`, `-m gpt-5.6-sol`, `-c service_tier="fast"`, `-c features.fast_mode=true`, `-c model_reasoning_effort="xhigh"` and no additional `-c` entries).

## ADDED Requirements

### Requirement: `[codex].model` overrides the `-m` value

- MUST accept an optional `model` string on the same `[codex]` table already carrying `provider`; the two keys are independent and MUST NOT interact with each other.
- MUST use `gpt-5.6-sol` as the default `-m` value whenever `[codex].model` is absent, an empty string, or whitespace-only after trim.
- MUST use the trimmed literal string of `[codex].model` as the `-m` value whenever it is a non-empty string; this replaces only the value following `-m` and MUST NOT reorder, remove, or duplicate any other baseline argv element.
- MUST reject startup with a visible error (via the existing local-config shape validator) when `[codex].model` is present but not a string; MUST NOT spawn `codex` under this condition.
- MUST keep the five provider `-c` overrides untouched when `provider` and `model` are set together — the model value only affects the base `-m` slot, provider overrides remain byte-for-byte identical to the provider-only case.
