# console-ui spec delta：local-console-t46-project-workspace-source

T4.6 upgrades the operator console presentation from one placeholder project to real persisted project data. `console-ui` remains controlled by props and callbacks; it does not call filesystem, IPC, Git, Codex, or local console APIs directly.

## 新增行为规则

### Real project hierarchy
- MUST render a list of local projects supplied by props.
- MUST render each project title from the real directory title supplied by the local console state.
- MUST render sessions under their owning project while preserving the project -> session hierarchy.
- MUST allow selecting a project and selecting sessions within a project through callbacks.
- MUST expose an open-folder action through a callback, not by calling Electron or filesystem APIs directly.

### Worktree controls
- MUST render a worktree mode toggle for local folder projects through a controlled callback.
- MUST render a visible neutral status when worktree mode is unavailable for the selected project, including the `not-git-repository` reason.
- MUST keep running, waiting, stuck, failed, and interrupted state indicators distinct from project worktree availability.
- MUST keep the operator console compact and work-focused; project controls must not become a marketing-style landing section.

## 新增场景

### 场景 CUI.T4.4：多 project 侧栏
Given the operator console receives two local projects with sessions
When the sidebar renders
Then it shows both project titles
And it shows each session under its owning project
And selecting a project or session calls the supplied callback.

### 场景 CUI.T4.5：worktree 不可用原因可见
Given a project has worktree mode enabled
And its worktree unavailable reason is `not-git-repository`
When the sidebar renders the project row
Then the row shows a neutral worktree unavailable status
And the status is distinguishable from failed, stuck, and interrupted session states.
