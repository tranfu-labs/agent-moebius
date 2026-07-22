# 提案：agent-frontmatter-metadata

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/agent-teams.md` | Agent 身份与说明 | 明确身份元数据使用 snake_case YAML frontmatter、目录名独占 slug、旧正文格式有界兼容 | 已写入 |

## 背景

桌面端当前把成员 `AGENT.md` 的首个一级标题与其后首段解析为显示名称和一句话描述。内置开发团队扩充 persona 后，主 Agent 的正文标题从“开发经理”改成了通用的“角色”，首段也变成长篇角色说明；桌面因而把第一名成员显示成“角色”，同时触发两项 seed 文案断言失败。问题不是成员顺序，而是机器元数据与自由正文共享同一语法位置，任何 persona 重排都会意外改变 UI 身份。

现有 agent frontmatter 已承载 `workspaceAccess` 与 `preScript`，但字段采用 camelCase，且桌面身份解析会跳过整个 frontmatter。用户已确认采用与 `SKILL.md` 相同的 YAML 元数据思路，并统一以 snake_case 作为新规范。

## 提案

- 为 Agent Markdown 建立共享的 frontmatter 解析契约。团队成员的新身份字段为 `display_name` 与 `description`；运行能力字段规范为 `workspace_access` 与 `pre_script`。
- 成员目录名继续作为稳定 slug 的唯一事实源，不增加重复的 `name` 字段。
- 桌面身份解析优先读取合法的 `display_name` + `description` 原子字段对；两项均缺失时回退现有“首个一级标题 + 首段”旧格式；只出现一项、类型错误、空值或多行值时把成员标记为需要修复。
- runner 读取新 snake_case 能力字段，同时兼容既有 camelCase `workspaceAccess` / `preScript`。同一语义的新旧字段并存且值冲突时明确失败；相同值可兼容读取但新写入内容只生成 snake_case。
- 新建成员模板、内置开发团队 seed 和仓库内现有 capability frontmatter 迁移到新格式。完整 persona 正文保留，正文标题不再决定桌面显示名。
- 通过内容指纹重播种更新 `.system`，不直接修改运行时数据根中的内置团队，也不重写用户团队文件。

## 影响

- `desktop/src/team-model.ts`、`desktop/src/team-store.ts` 与团队 IPC/list 状态：身份解析、模板生成、非法元数据的修复态映射。
- `src/agent-manifest.ts`：runner capability 字段迁移兼容与冲突检测。
- `seeds/teams/development/**/AGENT.md`、`agents/*.md`：canonical frontmatter 文案迁移。
- desktop 与 root 测试：解析、兼容、冲突、模板、播种和 runner capability 回归。
- `AGENTS.md`、`docs/architecture/module-map.md`、当前 specs 与仍在推进的 change/roadmap：凡明确引用 frontmatter 键名的活文档迁移到 snake_case；archive 历史记录保持原样。
- TypeScript 接口、SQLite/JSON state、observer 字段、prompt context 与 UI props 中的 `workspaceAccess` / `preScript` / `displayName` 属于内部模型，不因磁盘 YAML 命名变化而重命名或迁移。
