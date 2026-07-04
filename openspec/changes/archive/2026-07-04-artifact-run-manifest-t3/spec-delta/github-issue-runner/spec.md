# github-issue-runner spec delta：artifact-run-manifest-t3

## 新增行为规则
- MUST treat explicit relative artifact paths in an agent final response as the primary output artifact discovery contract for acceptance screenshots and other generated media.
- MUST resolve explicit relative artifact paths against the Codex cwd and reject paths that escape that cwd.
- MUST NOT proactively publish unreferenced files from the dev worktree as acceptance screenshots; mtime-based discovery MAY remain only as a compatibility fallback.
- MUST copy each accepted output artifact into the current run directory's `output-artifacts/` directory before publishing it.
- MUST publish accepted output artifacts through the existing artifact publisher boundary and append GitHub-comment-viewable links to the agent comment.
- MUST post a visible artifact publishing error comment when required artifact publication fails, and MUST NOT update role-thread state or claim artifact delivery succeeded.
- MUST record a run manifest for each completed Codex run in append-only JSONL format at `.state/run-manifests.jsonl`.
- MUST include `issue`, `role`, `stage`, `artifacts`, `startedAt`, and `completedAt` fields in each run manifest record.
- MUST set run manifest `stage` from the original agent final response stage marker before artifact markdown is appended and before CEO guardrail processing.
- MUST set run manifest `stage` to `unknown` when the original final response stage marker is missing or invalid; this value belongs only to the manifest schema and MUST NOT extend `src/stages.ts` or agent comment stage markers.
- MUST record an empty `artifacts` array when no output artifacts are published.
- MUST include each published artifact's output path and publisher URL in the manifest; MUST NOT fabricate a URL when no publisher URL exists.
- MUST record staged artifact paths with `publishedUrl = null` when Codex completed, artifact staging succeeded, and artifact publisher failed.
- MUST treat run manifest writer failures as best-effort observation failures: runner MUST log `run-manifest-write-failed`, and MUST NOT change successful agent comment publication, role-thread update, or artifact error comment semantics.
- MUST NOT let manifest writer failure block the existing artifact publishing failure comment path; when artifact publisher has already failed, runner MUST still publish the artifact error comment when possible and MUST NOT update role-thread state.
- SHOULD write a per-run manifest copy under the run directory for debugging, but `.state/run-manifests.jsonl` remains the stable contract source.
- MUST document the acceptance screenshot reference contract in `docs/protocols/github-interaction.md` and `agents/dev.md`.

## 新增场景
### 场景 T3.1：显式引用的 dev worktree PNG 被发布
Given dev 在 Codex cwd 下生成 `artifacts/acceptance/t3.png`
And dev 最终回复在「验收证据」中引用 `artifacts/acceptance/t3.png`
When runner 处理输出 artifact
Then 系统将该 PNG 复制到本轮 `runDir/output-artifacts/`
And 通过 artifact publisher 发布该 PNG
And agent 评论体包含 publisher 返回的可查看链接

### 场景 T3.2：未引用 worktree PNG 不主动发布
Given dev 在 Codex cwd 下生成 `artifacts/acceptance/t3.png`
And dev 最终回复没有引用该路径
When runner 处理输出 artifact
Then 系统不因验收截图契约主动发布该 PNG
And 该 PNG 不进入 `output-artifacts/`

### 场景 T3.3：越界相对路径被拒绝
Given dev 最终回复引用 `../secret.png`
When runner 处理输出 artifact
Then 系统拒绝该路径
And 不把 Codex cwd 外文件复制到 `output-artifacts/`

### 场景 T3.4：run manifest 字段齐全
Given 任一 Codex run 完成
When runner 写入 run manifest
Then `.state/run-manifests.jsonl` 追加一条 JSON record
And record 包含 `issue`、`role`、`stage`、`artifacts`、`startedAt`、`completedAt`
And 无产物时 `artifacts` 为 `[]`

### 场景 T3.5：artifact publisher 失败仍记录 staged artifact
Given dev 在 Codex cwd 下生成并引用 `artifacts/acceptance/t3.png`
And artifact staging 已完成
And artifact publisher 抛错
When runner 处理输出 artifact
Then 系统写入 run manifest
And manifest 中该 artifact 包含 staged `path`
And 该 artifact 的 `publishedUrl` 为 `null`
And 系统发布 artifact 错误评论
And 不更新 role-thread state

### 场景 T3.6：成功路径 manifest 主源写入失败不改变发布语义
Given Codex 成功返回 final response
And artifact 发布路径已成功或无产物
And `.state/run-manifests.jsonl` 写入失败
When runner 处理成功发布路径
Then 系统记录 `run-manifest-write-failed`
And 仍发布 agent comment
And 仍按既有语义更新 role-thread state

### 场景 T3.7：artifact 失败路径不被 manifest writer 失败阻断
Given Codex 成功返回 final response
And artifact publisher 抛错
And `.state/run-manifests.jsonl` 写入失败
When runner 处理 artifact 发布失败
Then 系统记录 `run-manifest-write-failed`
And 仍尝试发布 artifact 错误评论
And 不更新 role-thread state

### 场景 T3.8：manifest stage 来自原始 final response
Given dev 原始 final response 末尾 stage marker 为 `code-verified`
And runner 随后追加 artifact markdown
And CEO guardrail 随后处理待发正文
When runner 写入 run manifest
Then manifest `stage` 为 `code-verified`

### 场景 T3.9：manifest stage 缺失或非法时写 unknown
Given dev 原始 final response 缺少合法 stage marker
When runner 写入 run manifest
Then manifest `stage` 为 `unknown`
And `unknown` 不作为 agent comment stage marker 或 `src/stages.ts` 枚举值
