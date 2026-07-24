# github-issue-runner spec delta

## 新增
- MUST default to an empty watched repository list when no local config file exists.
- MUST read repository whitelist overrides from project-root `config.local`.
- MUST treat `config.local` as a local-only file and ignore it in git.
- MUST parse `config.local` as TOML.
- MUST fail fast when `config.local` exists but cannot be parsed or has an invalid shape.
- MUST require each configured repository entry to contain non-empty `owner` and `repo` strings.
- MUST keep local config file reading separate from local config shape validation, so validation remains unit-testable.

## 修改
- The default watched repository list no longer contains `tranfu-labs/tranfu-agents-app` or `tranfu-labs/moebius`; those repositories are configured locally through `config.local`.
- Startup configuration logging includes the local config path and the resolved watched repositories.
