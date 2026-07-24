# github-issue-runner spec delta：support-bidirectional-issue-media

## 新增行为规则
- MUST detect image and video references in GitHub issue body and comments before running a mentioned Codex agent.
- MUST keep media reference extraction as a pure business-data operation that does not call GitHub, Codex, the network, or the filesystem.
- MUST only treat `http:` and `https:` URLs as downloadable issue media references.
- MUST download issue media into the current Codex run directory, not into `agents/`, `.state/`, or the target worktree.
- MUST validate downloaded issue media by supported media kind, response content type, and bounded size before exposing it to Codex.
- MUST pass prepared image files to `codex exec` and `codex exec resume` through repeated `--image <file>` arguments.
- MUST expose prepared video files to Codex through a prompt media manifest containing local file paths, because the Codex CLI image option does not accept videos.
- MUST include media from the full public timeline for first runs and fallback full runs.
- MUST include only media from new external delta messages for resume runs.
- MUST post a visible error comment when required issue media cannot be downloaded or validated, and MUST NOT silently run Codex with missing media.
- MUST NOT update the role thread state when issue media preparation fails before Codex starts.
- MUST treat a deterministic media-preparation error comment as handling the triggering mention for intake purposes, so the same bad media URL does not cause repeated error comments every active poll.
- MUST discover supported SVG, image, and video artifacts produced by Codex before publishing the agent comment.
- MUST NOT commit generated output artifacts to the source repository merely to make them visible in GitHub comments.
- MUST publish generated output artifacts through an artifact publisher boundary that returns GitHub-comment-viewable Markdown references.
- MUST use the same repository's GitHub release tag `moebius-artifacts` as the default artifact publisher storage, without committing generated files to the repository worktree or source branch.
- MUST append published artifact previews to the agent final response before CEO guardrail sees `latestResponse`.
- MUST post a visible error comment when generated artifacts cannot be published, and MUST NOT claim artifact delivery succeeded.
- MUST NOT update the role thread state until the agent comment and any required artifact publication have succeeded.
- MUST keep artifact publishing outside `conversation.ts`, `github-response-intake.ts`, `driver-pool.ts`, and other pure scheduling modules.
- MUST call external commands, if any artifact publisher needs them, through `child_process.spawn(cmd, args[])` with controlled argv arrays and without `shell: true`.
