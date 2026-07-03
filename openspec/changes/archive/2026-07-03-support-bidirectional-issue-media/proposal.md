# 提案：support-bidirectional-issue-media

## 背景
当前 runner 把 GitHub issue body 与 comments 归一化为纯文本时间线后交给本地 `codex`。当用户在 issue 中粘贴图片或视频时，Codex 只能看到 Markdown / URL 文本，看不到本地 Codex 对话中可直接处理的媒体文件。

输出方向也有缺口：当 Codex 生成 SVG、图片或视频时，runner 只会把最终文本评论回 GitHub。用户需要在评论中直接查看生成结果，而不是只看到本地路径、代码块或需要人工再上传的文件。

GitHub 评论写入路径目前通过 `gh issue comment --body-file -` 完成。该命令只发布 Markdown body，不提供本地文件附件上传参数；GitHub 网页端的拖拽附件能力需要由独立 artifact publisher 承担，不能靠把生成文件提交到业务仓库规避。

## 提案
新增一条双向 issue media 流水线：

1. 在纯业务层解析 issue body / comments 中的图片和视频引用，保留其 timeline index、媒体类型、原始 URL 与展示文本。
2. 在 runner 进入 Codex driver 前下载并校验媒体文件：
   - 图片通过 `codex exec --image <file>` / `codex exec resume --image <file>` 作为原生图片输入。
   - 视频下载到本轮运行目录，以 media manifest 形式写入 prompt，供 Codex 像本地一样通过文件路径和工具处理。
3. 媒体准备失败时发布一条确定性错误评论，说明哪条消息的哪个媒体无法处理；不静默降级成纯文本，也不推进 role thread。
4. Codex 完成后发现本轮生成或最终回复明确引用的 SVG / 图片 / 视频产物，校验后交给 artifact publisher 转成 GitHub comment 可查看的 Markdown 预览；默认 publisher 使用同仓库 GitHub release asset，生成产物不得提交到业务仓库。
5. artifact publisher 失败时发布错误评论，说明产物无法发布；成功时把预览 Markdown 合入 agent 最终评论，再进入 CEO guardrail。

## 影响
- `src/conversation.ts` 或新纯函数模块：增加媒体引用解析与 prompt media manifest 拼接，保持不访问网络 / 文件系统。
- `src/codex.ts`：支持为 full / resume Codex run 传递图片路径参数。
- `src/runner.ts`：在触发后、Codex 前准备输入媒体；在 Codex 后、评论前发布输出 artifact，并把错误路径折叠成不重复刷屏的 issue 处理结果。
- 新增 GitHub/media adapter：负责下载输入媒体、校验 MIME / size、发现本地输出媒体、通过 release asset 发布 artifact URL。
- `openspec/specs/github-issue-runner/spec.md`：补充双向媒体输入输出、错误评论、artifact 不提交仓库等行为事实。
- 测试面：新增媒体解析、下载校验、Codex argv、runner 成功/失败路径与 artifact 发布路径单元测试。
