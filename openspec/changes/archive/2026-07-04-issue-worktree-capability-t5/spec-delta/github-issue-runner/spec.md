# github-issue-runner Delta：issue-worktree-capability-t5

## Changed Rules
- MUST upgrade issue worktree provisioning from a dev-only preScript behavior to an issue-level built-in workspace capability.
- MUST support agent Markdown frontmatter field `workspaceAccess` with exactly two valid values: `write` and `read-run`.
- MUST treat `workspaceAccess` as a built-in capability selector, not a script path; issue body/comment and agent Markdown MUST NOT be able to name arbitrary executable workspace scripts through this field.
- MUST preserve the existing trusted `preScript` registry for non-workspace deterministic setup such as current-repo workspace and CEO ledger context.
- MUST grant initial workspace access only to these roles: `dev` with `write`; `qa`, `product-manager`, and `hermes-user` with `read-run`.
- MUST NOT grant issue workspace access to `dev-manager`, `ceo`, or `secretary` in T5.
- MUST let all roles with workspace access in the same GitHub issue share the same issue worktree and Codex cwd.
- MUST create new issue worktrees with role-free path and branch names derived only from owner, repo, and issue number.
- MUST keep different GitHub issues isolated in different worktrees even when they target the same repository.
- MUST allow same-repository issue worktrees to reuse the same local bare repo cache.
- MUST create a first issue worktree from freshly fetched `refs/remotes/origin/main`.
- MUST lazily migrate legacy dev role context into issue workspace context by reusing the existing dev `worktreePath` when it matches the current issue and is accessible.
- MUST NOT move, delete, recreate, merge, or rebase a legacy dev worktree during lazy migration.
- MUST preserve legacy role context entries when adding issue workspace context, so existing role-thread and observer assumptions are not clobbered.
- MUST refresh remote main before reusing an existing issue workspace and detect whether latest main is contained by the current worktree `HEAD`.
- MUST NOT automatically delete, rebuild, merge, or rebase an existing issue worktree merely because remote main has advanced.
- MUST expose a main freshness status to logs and Codex prompt context when reusing an existing worktree.
- MUST bound every git operation used by issue workspace preparation, including clone, fetch, worktree add/remove/prune, and merge-base checks.
- MUST terminate or abort a timed-out workspace git child process and settle the prepare promise with a deterministic failure reason.
- MUST release the repo cache keyed lock after a bounded workspace git operation fails, times out, or is aborted.
- MUST return a failed issue processing outcome rather than hang indefinitely when issue workspace preparation times out.
- MUST fail closed when the issue workspace context points at a mismatched path, missing worktree, or missing repo cache; automatic recovery of missing worktrees remains out of scope.
- MUST model `read-run` as a collaboration and prompt constraint rather than an OS-level read-only sandbox: read-run roles MUST NOT intentionally modify source, commit, or push, but MAY run tests, start services, create build caches, create test output, and create acceptance screenshots.
- MUST keep workspace state under ignored `.state/agent-contexts.json` and MUST NOT write runtime workspace state under `agents/`.
- MUST keep issue worktree provisioning out of `goal-ledger`, `conversation`, `github-response-intake`, trigger, driver-pool, observer, and pure business modules.
- MUST keep `secretary` on the current repository workspace preScript and MUST NOT move it into issue worktree provisioning.
- MUST keep no-playbook QA conclusion-line rules out of T5.
- MUST NOT implement T6 roundtable topology, T7 observer changes, T8 goal-intake, T9 dogfood, arbitrary script execution, PR/push/delete actions, or cross-repository orchestration in T5.

## Added Scenarios
### Scenario T5.1: dev creates role-free issue worktree
Given latest non-code message mentions `@dev`
And `agents/dev.md` declares `workspaceAccess: write`
And no issue workspace context exists
When runner prepares the selected agent
Then runner creates or reuses the repository bare cache
And runner fetches `refs/remotes/origin/main`
And runner creates a worktree under `<WORKDIR_ROOT>/worktrees/<owner>__<repo>__<issue>`
And the worktree local branch is `agent/<owner>__<repo>__<issue>`
And Codex runs with that worktree as cwd

### Scenario T5.2: qa shares dev issue worktree
Given an issue workspace context exists for `tranfu-labs/agent-moebius#71`
And latest non-code message mentions `@qa`
And `agents/qa.md` declares `workspaceAccess: read-run`
When runner prepares qa
Then qa receives the same `codexCwd` as dev for that issue
And prompt context states `workspaceAccess = read-run`
And runner does not create a role-specific qa worktree

### Scenario T5.3: different issues stay isolated
Given issue A and issue B belong to the same repository
When both issues prepare workspace-capable agents
Then each issue has a distinct worktree path
And both may share the same bare repo cache

### Scenario T5.4: legacy dev context migrates without moving
Given `.state/agent-contexts.json` contains only legacy `issueKey -> dev` context
And that context matches the current issue and points to an accessible worktree
When any workspace-capable role prepares for that issue
Then runner creates issue workspace context pointing to the existing dev `worktreePath`
And runner does not move, delete, rebuild, merge, or rebase that worktree
And runner preserves the legacy dev context entry

### Scenario T5.5: main advancement does not destroy worktree
Given an issue workspace context points to an accessible worktree
And refreshed `refs/remotes/origin/main` is not an ancestor of the worktree `HEAD`
When runner prepares a workspace-capable role
Then runner returns the existing worktree path
And runner records or prompts that main has advanced
And runner does not call `git worktree remove`
And runner does not call `git worktree add`
And runner does not run merge or rebase

### Scenario T5.6: read-run may create acceptance artifacts
Given `product-manager` or `hermes-user` declares `workspaceAccess: read-run`
When that role runs code acceptance in the issue worktree
Then it may start services, run tests, and create acceptance screenshots or output files
But it must not intentionally modify source code, commit, or push

### Scenario T5.7: missing workspace fails closed
Given issue workspace context exists
And its recorded worktree path is missing or inaccessible
When runner prepares a workspace-capable role
Then runner fails before Codex execution
And runner does not post an agent response
And runner does not update role thread state

### Scenario T5.8: git fetch timeout fails bounded
Given issue workspace preparation is refreshing remote main
And the injected `git fetch` never settles
When the workspace git timeout elapses
Then runner returns a failed processing outcome
And runner does not call Codex
And runner does not update role thread state
And the issue in-flight entry is released by normal job settlement

### Scenario T5.9: repo lock releases after timeout
Given issue A and issue B target the same repository
And issue A enters the repo cache lock
And issue A's workspace git operation never settles
When issue A reaches the workspace git timeout
Then issue A's prepare fails and releases the repo cache lock
And issue B can subsequently enter workspace preparation

### Scenario T5.10: merge-base timeout fails bounded
Given issue workspace context exists
And refreshed remote main must be compared with worktree `HEAD`
And the injected `git merge-base --is-ancestor` never settles
When the workspace git timeout elapses
Then runner returns a failed processing outcome
And it does not assume the worktree is fresh
And it does not delete, rebuild, merge, or rebase the worktree

### Scenario T5.11: workspaceAccess cannot execute arbitrary scripts
Given an agent Markdown frontmatter declares `workspaceAccess: "../../evil.ts"`
When runner loads the agent manifest
Then manifest parsing fails
And no dynamic import or shell command is executed

### Scenario T5.12: secretary remains on current repo workspace
Given latest non-code message mentions `@secretary`
And secretary declares only `preScript: src/agent-prescripts/current-repo-workspace.ts`
When runner prepares secretary
Then Codex cwd is the agent-moebius current repository root
And no issue worktree context is created or modified

### Scenario T5.13: tranfu-agents-app issue 96 live walkthrough is real or explicitly blocked
Given tranfu-agents-app issue 96 asks qa to inspect `/skills`
And qa has `read-run` workspace access
When the scenario is replayed as product acceptance
Then qa's comment contains at least three real findings anchored to concrete page elements or routes
And qa includes screenshot links or explicit acceptance evidence paths
And each finding can be reproduced by a human with an `打开 X -> 做 Y -> 应看到 Z` style check
But if the target app cannot be cloned, installed, started, authenticated, or any of those commands exceed their configured bound, the final dev evidence must state the concrete blocker instead of claiming the walkthrough passed

### Scenario T5.14: local tests cover the external walkthrough contract
Given the external tranfu-agents-app issue 96 environment may be unavailable
When repository tests run
Then local unit or integration tests still verify workspace sharing, read-run prompt context, artifact-capable cwd propagation, non-destructive main advancement behavior, and bounded timeout behavior
