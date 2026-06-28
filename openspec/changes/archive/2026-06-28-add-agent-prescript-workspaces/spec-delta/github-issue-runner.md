# github-issue-runner spec delta

## 新增
- MUST allow an agent Markdown file to declare a trusted `preScript` in frontmatter, used by runner before Codex execution.
- MUST restrict declared pre script paths to known repository-owned scripts under `src/agent-prescripts/`; issue body/comment content MUST NOT become an executable script path.
- MUST execute an agent pre script after selecting an agent and before calling Codex.
- MUST stop the current cycle without calling Codex, posting a comment, or updating role thread state when a pre script fails.
- MUST support a `dev` pre script that prepares a Codex working directory from the currently processed GitHub issue source (`owner`, `repo`, `issueNumber`), not from links inside issue body/comments.
- MUST create one persistent `dev` worktree per source issue and reuse it for subsequent `@dev` runs in the same source issue.
- MUST create distinct `dev` worktrees for distinct source issues, even when they belong to the same repository.
- MUST allow repository cache reuse across issue worktrees while preserving issue-level worktree isolation.
- SHOULD refresh an existing repository cache before creating a new issue worktree.
- MUST store agent pre script context in local ignored state outside `agents/`, including at least issue, role, preScript, target repository, worktree path, and prepared message index.
- MUST fail closed when an existing `dev` context points to a missing or inaccessible worktree.
- MUST run Codex with an explicit `cwd` when a pre script returns a working directory.
- MUST log the resolved workdir root at startup.

## 修改
- Agent Markdown files are no longer pure persona-only inputs when they contain trusted frontmatter; frontmatter config is runner-readable metadata, while the Markdown body remains the Codex persona text.
- Runner orchestration changes from "selected agent -> Codex" to "selected agent -> optional pre script -> Codex".
- Configuration now includes a workdir root and an agent context state path in addition to the existing issue, agents, temp, and role thread settings.
