# github-issue-runner spec delta

## 新增
- MUST support watching multiple configured GitHub repositories without requiring a webhook endpoint.
- MUST separate GitHub response intake business rules from external GitHub and filesystem adapters.
- MUST keep issue source discovery and polling cadence outside conversation, trigger, prompt, Codex, and role-thread state modules.
- MUST poll watched repositories in idle mode at a configurable interval; the default idle interval is 5 minutes.
- MUST scan only a bounded recent open issue window per repository during idle scans; the default window is 20 issues per repository.
- MUST promote an issue to active mode only after a runner-relevant change is successfully processed.
- MUST poll active issues at a configurable interval; the default active interval is 1 minute.
- MUST demote an active issue back to idle after 5 consecutive active polls observe no GitHub `updatedAt` change.
- MUST reset an active issue's no-change counter when a new `updatedAt` is observed and successfully processed.
- MUST bound the number of active issues; when the bound is exceeded, the runner MUST degrade excess issues to idle and log the reason.
- MUST record GitHub response intake state in a local ignored state file, including repository idle scan timing and per-issue `updatedAt`, mode, no-change count, and next poll timing.
- MUST use GitHub issue `updatedAt` as the primary change detector for repository summaries and active issue polls.
- MUST avoid processing historical issues during first repository baseline scan by default, to prevent bulk replies to old mentions.
- SHOULD allow explicitly configured seed issue sources when a specific issue should be checked immediately after startup.
- MUST update intake state after `no-trigger` so unchanged issues are not repeatedly fetched.
- MUST keep an already active issue active after a `no-trigger` change, resetting its no-change counter and scheduling the next active poll.
- MUST NOT advance the processed `updatedAt` when pre script execution, Codex execution, or GitHub comment posting fails.
- MUST pass the current issue source into GitHub fetch/comment operations, agent pre scripts, role thread state lookup, and logs.
- MUST continue to key role thread state and agent context state by `issueKey`, so multiple repositories and issues remain isolated.
- MUST continue to call external commands with `child_process.spawn(cmd, args[])`; issue title/body/comment content MUST NOT be interpolated into shell commands.

## 修改
- The runner is no longer limited to one globally configured issue source; it receives issue sources from the GitHub response intake layer.
- `src/github.ts` changes from a singleton issue client into a parameterized GitHub adapter.
- Startup configuration logging includes watched repositories, idle interval, active interval, issue scan limit, active issue limit, and existing workdir/state paths.
