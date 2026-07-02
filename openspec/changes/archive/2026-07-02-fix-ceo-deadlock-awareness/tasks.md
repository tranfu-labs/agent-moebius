# 任务：fix-ceo-deadlock-awareness

- [x] 增补 `agents/ceo.md`：协作生态认知章节（真实 agent 清单、reflector 机制、不存在的角色、dev 常犯的错）
- [x] 增补 `agents/ceo.md`：识别场景「死锁等待」+ 事故真实样例
- [x] 修正 `agents/ceo.md` 输出契约：`append` 带 `as` 字段与允许值集合
- [x] AI 验证：用事故真实输入（dev 的 `@reflector` 回复 + reflector hook）调用 `formatCeoComment` 真跑一次 Codex，确认返回合法 `append as=ceo` 而非 fail-open
- [x] 跑既有测试保持绿（`pnpm test`，341 通过）
