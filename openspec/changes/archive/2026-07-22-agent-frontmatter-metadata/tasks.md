# 任务：agent-frontmatter-metadata

- [x] T1：建立共享 Agent frontmatter 解析原语
  - [x] 把 YAML parser 声明为直接依赖，解析文件开头 metadata 与 persona body
  - [x] 覆盖合法 YAML、无 frontmatter、非法 YAML、引号/注释与正文保真
  - [x] 保持 frontmatter 不进入 Codex persona body

- [x] T2：迁移桌面成员身份契约
  - [x] `display_name` + `description` 原子读取并优先于正文
  - [x] 两项均缺失时兼容首个一级标题 + 首段旧格式
  - [x] 半迁移或非法字段映射为 `member-agent-metadata-invalid` 修复态
  - [x] 新建 Agent 模板生成 snake_case frontmatter
  - [x] 覆盖 team model、store、IPC、外部修改与新建成员测试

- [x] T3：迁移 runner capability 字段
  - [x] canonical 读取 `workspace_access` / `pre_script`
  - [x] 兼容 `workspaceAccess` / `preScript`，同值允许、冲突报错
  - [x] 保持 workspace capability 值与受信任 pre script 路径校验不变
  - [x] 迁移仓库内 `agents/*.md` 并覆盖所有角色实际权限

- [x] T4：迁移内置开发团队 seed
  - [x] 三名成员写入规范显示名称与一句话描述 frontmatter
  - [x] 保留完整 persona，正文标题不再承担显示身份
  - [x] seed 指纹升级只替换 `.system`，不触碰用户团队
  - [x] 修复现有两个 `team-seed.test.ts` 失败并增加 frontmatter 身份断言

- [x] T5：迁移活文档与调用引用
  - [x] 更新 `AGENTS.md`、`docs/architecture/module-map.md` 与 persona 正文中的 frontmatter 字段说明
  - [x] 归档时把当前 desktop-shell / github-issue-runner specs 中的 frontmatter 示例与判据迁移到 snake_case，并保留 legacy alias 场景
  - [x] 更新仍在推进、会指导后续实现的 change/roadmap 中的 frontmatter 字面量；不修改 `openspec/changes/archive/**`
  - [x] 审计 TypeScript、SQLite/JSON state、observer、prompt context 与 React/IPC 字段，确认内部 camelCase 未被误改
  - [x] 审计测试 fixture：canonical 用例改 snake_case，legacy 专项用例保留 camelCase

- [x] T6：验证与可见验收
  - [x] `pnpm --filter @agent-moebius/desktop test -- team-model.test.ts team-store.test.ts team-seed.test.ts team-ipc.test.ts team-external-change.test.ts`
  - [x] `pnpm vitest run tests/agent-manifest.test.ts`
  - [x] `pnpm test`
  - [x] `pnpm typecheck`
  - [x] `pnpm --filter @agent-moebius/desktop build`
  - [x] 在运行中的开发态 renderer 隔离注入实际 seed 摘要，确认“开发经理 / 开发 / 软件测试”与主 Agent 文案，“角色”不再作为 UI 身份
  - [x] 用同一临时数据根重复播种，确认内容指纹命中后身份仍稳定，升级替换也不改写用户团队文件
