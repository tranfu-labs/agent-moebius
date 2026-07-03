# 任务：support-bidirectional-issue-media

- [x] 新增纯媒体解析模块，覆盖 Markdown image/link、HTML img/video/source、裸 http(s) URL 与 URL 校验测试。
- [x] 新增媒体准备 adapter，下载到 runDir、校验 MIME / size、生成图片路径与视频 manifest，并覆盖失败路径测试。
- [x] 扩展 `src/codex.ts`，让 full / resume run 都支持 `imagePaths` 参数，并补充 argv 单元测试。
- [x] 调整 prompt 构造或 runner 装饰逻辑，把 prepared media manifest 注入 full / resume / fallback prompt。
- [x] 在 `src/runner.ts` 接入输入媒体准备失败的错误评论路径，确保不更新 role thread 且不重复刷屏。
- [x] 新增输出 artifact 发现与校验逻辑，优先使用 final response 中明确提到的媒体路径，并限制目录 / 类型 / 大小。
- [x] 新增 artifact publisher 边界与 GitHub comment 可查看 Markdown 生成逻辑；publisher 失败时发布错误评论且不更新 role thread。
- [x] 调整 CEO guardrail 调用顺序，确保 CEO 看到包含 artifact preview 的最终待发正文。
- [x] 补充 runner 单元测试：输入媒体成功、输入媒体失败、输出 artifact 成功、输出 artifact 失败、resume fallback 仍携带媒体。
- [x] 更新 `docs/architecture/module-map.md` 的新增模块与依赖边界说明。
- [x] 若新增媒体大小、artifact publisher 或上传命令配置，同步更新项目 `AGENTS.md` 操作手册。
- [x] 运行 `pnpm test` 与 `pnpm typecheck`。
