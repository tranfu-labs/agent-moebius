# 设计：artifact-run-manifest-t3

## 方案

### 1. 显式引用优先的验收截图 discovery
沿用 `src/media-assets.ts` 的 output artifact adapter 边界，不把发布细节放入纯调度模块。

规则：

- `discoverOutputArtifacts` 解析最终回复中的 Markdown image、Markdown link、裸路径和反引号路径，优先收集显式引用。
- 对相对路径按 Codex cwd 解析，并用 `path.resolve` 后的前缀检查拒绝越界路径，如 `../secret.png` 或绝对路径逃逸。
- 只接受既有支持类型和大小限制内的文件；复用现有 MIME / 扩展名 / 目录排除规则。
- 显式引用通过校验后复制到 `runDir/output-artifacts/`，publisher 只读取该目录下副本。
- 未被最终回复引用的 dev worktree 文件不主动发布；既有 mtime 扫描不能覆盖 dev worktree 验收截图契约。

mtime 兼容兜底边界：

- 对 dev issue worktree 下的验收截图与生成媒体，发布意图只认最终回复显式引用。
- 允许保留 mtime fallback 仅用于当前 runDir 内已经由 adapter staging 的 `output-artifacts/` 文件，或未来非 worktree driver cwd 的历史兼容路径；不得扫描 dev worktree 后把未引用新文件主动发布。
- 因此，`cwd` 内新增但未在 final response 引用的 `artifacts/acceptance/*.png` 不进入 `output-artifacts/`。

dev 的最终回复约定使用「验收证据」小节，例如：

```md
## 验收证据
- 验收截图：artifacts/acceptance/t3.png
```

也允许 Markdown image 形式：

```md
![验收截图](artifacts/acceptance/t3.png)
```

### 2. artifact 发布结果进入最终评论
runner 维持既有顺序：

1. Codex 返回 dev 原始最终回复。
2. 解析原始 stage marker，作为 manifest 的 `stage`；artifact markdown 追加和 CEO guardrail 不得影响 manifest stage。若原始 marker 缺失或非法，manifest stage 写入 `"unknown"`，但不扩展 runner stage 枚举或 agent comment stage marker。
3. staging 输出 artifact，发布成功时获得 `PublishedArtifact[]`；发布失败时保留已 staging artifact path。
4. 发布成功时，把 artifact markdown 追加到待发正文，再交给 CEO guardrail。
5. 按既有评论发布与 role thread 语义收尾。
6. 首条可见评论成功后 best-effort 写入 run manifest 主源；写入失败只记录日志，不改变评论发布、artifact 错误评论或 role thread 更新语义。

artifact 发布失败仍走既有可见错误评论路径，不发布声称交付成功的 agent comment，不更新 role thread。此时 manifest 仍记录 Codex 已完成、artifact 已 staging 的事实，`artifacts[].publishedUrl = null`。

### 3. Run manifest 主源与字段
新增 runner 局部默认路径 `.state/run-manifests.jsonl`，通过测试依赖注入或 helper 注入，避免为 T3 扩权改 `src/config.ts`。

每轮完成后追加一行 JSON record：

```json
{
  "issue": { "owner": "tranfu-labs", "repo": "agent-moebius", "number": 48 },
  "role": "dev",
  "stage": "code-verified",
  "artifacts": [
    {
      "path": "output-artifacts/t3.png",
      "publishedUrl": "https://github.com/..."
    }
  ],
  "startedAt": "2026-07-04T00:00:00.000Z",
  "completedAt": "2026-07-04T00:01:00.000Z"
}
```

字段规则：

- `issue`、`role`、`stage`、`artifacts`、`startedAt`、`completedAt` 必须存在。
- `stage` 取 dev 原始最终回复末尾 stage marker，即 artifact markdown 追加前、CEO guardrail 处理前。
- 无产物时 `artifacts` 为 `[]`，不伪造发布链接。
- `artifacts[].path` 记录 runDir 输出副本的相对路径或可稳定识别路径；`artifacts[].publishedUrl` 来自 publisher 返回值。
- artifact staging 已完成但 publisher 抛错时，`artifacts[].path` 记录 staged path，`artifacts[].publishedUrl` 为 `null`。
- 原始 final response stage marker 缺失或非法时，manifest `stage` 写入 `"unknown"`；该值仅属于 manifest schema，不得加入 `src/stages.ts` 或 agent persona 输出契约。
- 主源 `.state/run-manifests.jsonl` append-only；runDir 副本只用于排障。

异常语义：

- `.state/run-manifests.jsonl` 写入失败是 best-effort 失败：runner 记录 `run-manifest-write-failed` 日志，不阻断已成功的 agent comment，不回滚 role thread 更新，不改变 artifact 错误评论路径。
- artifact publisher 失败路径下，runner 仍尝试写入 `publishedUrl: null` 的 manifest，再发布 artifact 错误评论；manifest 写入失败只记录日志，不阻断 artifact 错误评论，且仍不更新 role thread。

### 4. 文档契约
`docs/protocols/github-interaction.md` 新增验收截图引用规则：它描述 GitHub issue 时间线中如何让 runner 稳定识别验收截图，不改变 mention / `#N` / role envelope 规则。

`agents/dev.md` 新增最小引用：实现完成时如有验收截图，放在 issue worktree 内的相对路径，并在最终回复「验收证据」中显式引用；不得引用越界路径、本机绝对路径或未打算发布的临时文件。

## 权衡
- 不把 manifest 路径加到 `src/config.ts`：用户已确认 T3 不扩权改配置模块，runner 局部默认加测试注入即可满足观察页契约。
- 不主动发布未引用 worktree 文件：避免把临时截图、敏感调试图或大文件误上传；显式引用是发布意图。
- 不让 manifest 代替 GitHub 可见评论：manifest 是观察契约，用户可见交付仍以评论和 artifact 链接为准。
- 不新增观察页和目标账本语义：T3 只提供数据契约，后续任务消费。

## 风险
- JSONL append 写入如果失败，观察页会缺记录。最终口径采用 best-effort 记录日志，避免 manifest writer 成为新的主流程失败源；代价是短暂存储故障会让观察页漏记，需要通过日志排障。
- 显式路径解析要严格拒绝越界，同时允许常见 Markdown 写法；测试需覆盖正常引用、越界引用和未引用文件。
- CEO guardrail 可能 append 第二条评论；manifest 只记录 dev 原始 run 与 artifact 发布结果，不记录 CEO 修正文，以免混淆 T3 目标。
