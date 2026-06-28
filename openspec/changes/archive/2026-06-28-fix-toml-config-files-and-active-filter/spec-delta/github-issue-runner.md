# github-issue-runner spec delta

## 新增
- MUST provide a committed `config.toml` default/example file with commented repository whitelist examples.
- MUST use `config.local.toml` as the ignored machine-local override file.
- MUST allow a pure-comment or missing `watchRepositories` TOML config to resolve to an empty repository whitelist.
- MUST load `config.toml` before `config.local.toml`, with the local file overriding the default file.
- MUST constrain active issue polling to repositories currently present in the resolved watched repository whitelist.
- MUST constrain active issue limit enforcement to repositories currently present in the resolved watched repository whitelist.

## 修改
- The local override file is renamed from `config.local` to `config.local.toml`.
