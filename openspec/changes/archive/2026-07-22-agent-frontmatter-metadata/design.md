# 设计：agent-frontmatter-metadata

## 方案

### 1. 单一 frontmatter 解析边界

新增共享的 Agent Markdown frontmatter 解析原语，使用正式 YAML parser 读取文件开头的 `---` 块并返回 metadata 与去除 frontmatter 后的 persona body。`desktop/src/team-model.ts` 和 `src/agent-manifest.ts` 复用同一解析结果，避免桌面与 runner 各自维护一套分隔符、引号与字段读取规则。YAML parser 作为直接依赖声明，不能依赖 lockfile 中偶然存在的传递依赖。

共享层只负责 YAML shape 与原始字段；领域校验仍由消费方负责：桌面校验身份字段，runner 校验 capability 值和受信任 pre script 路径。

### 2. 团队成员身份解析

canonical 形式为：

```yaml
---
display_name: 开发经理
description: 负责技术决策、架构选型与质量保证。
---
```

解析按以下确定性优先级执行：

1. frontmatter 同时包含 `display_name` 与 `description`：两者必须是 trim 后非空、无换行的字符串，直接作为身份；正文标题不参与身份计算。
2. 两个字段都不存在：进入 legacy fallback，继续读取 persona body 的首个一级标题与其后首个非标题、非注释的非空段落。
3. 只出现一个字段，或字段不是合法单行字符串：返回结构化 metadata issue，由 team store 映射为 `member-agent-metadata-invalid`，团队进入既有“需要修复”路径。

新建成员模板只生成 canonical frontmatter 和一个可编辑 persona 起始区，不再通过 `# <显示名>` 隐式编码身份。保存现有 legacy 文件时不自动改写整份文档；只有新建模板、内置 seed 与本仓库受控素材主动迁移，避免一次升级无提示地重排用户文件。

### 3. runner capability 迁移

runner 新字段为 `workspace_access` 与 `pre_script`，约束保持不变：workspace access 只接受 `write` / `read-run`，pre script 仍必须落在受信任 registry 路径下。为兼容已有 `agents/*.md` 和用户团队快照，读取时接受旧别名 `workspaceAccess` / `preScript`：

- 只有一种写法时正常读取。
- 新旧写法同时存在且值相同，可读取。
- 新旧写法同时存在但值不同，抛出明确冲突错误，不静默决定优先级。
- 所有仓库内受控文件与新生成文件只写 snake_case。

身份字段不加入 runner 的 persona body；frontmatter 与当前行为一致，在送入 Codex 前剥离。

### 4. 引用迁移边界

实现时对旧名称逐处分类，不能全仓机械替换：

- **必须改成 snake_case**：`agents/*.md` 与 `seeds/teams/**/AGENT.md` 的 YAML 键；这些 persona 正文中对自身 frontmatter 的说明；`AGENTS.md`、`docs/architecture/module-map.md`、当前行为 specs、仍在推进且会指导未来实现的 change/roadmap 中明确写出的 frontmatter 示例或字段名；canonical 路径的测试 fixture。
- **必须保留 legacy 覆盖**：专门验证旧 `workspaceAccess` / `preScript` 和旧“一级标题 + 首段”身份仍可读取的测试 fixture；兼容分支的错误信息可同时指出新旧字段。
- **不能跟着改**：TypeScript `AgentManifest.workspaceAccess` / `.preScript`、runner dependency 参数、agent context SQLite/JSON schema、observer read model、prompt context 的既有内部标签，以及 React/IPC 的 `displayName` 属性。这些是程序内部模型或持久化状态，不是 YAML 外部格式；强行改名会把本次文件格式升级扩大成无关的数据迁移。
- **历史记录不改**：`openspec/changes/archive/**` 保留当时真实写法。运行时数据根 `teams/.system` 也不手改，只由 seed 指纹机制更新。

归档 spec-delta 时，不是简单追加一条新 Requirement：现有 `github-issue-runner` 中所有把 `workspaceAccess` / `preScript` 明确写成 frontmatter 字段的场景要改为 canonical snake_case，同时保留一组 legacy alias 兼容场景；描述 agent context state 或 TypeScript 语义的 camelCase 保持不变。

### 5. 内置 seed 与升级

三名内置成员分别在 frontmatter 声明：

- `dev-manager`：开发经理 / 负责技术决策、架构选型与质量保证。
- `dev`：开发 / 负责方案落地、代码实现与验证。
- `qa`：软件测试 / 负责测试设计、对抗性审查与验收。

现有完整 persona 正文原样保留，只允许调整 frontmatter 与开头身份占位。seed 内容改变后，既有内容指纹机制在下次桌面启动时整体替换 `.system`；用户团队不受影响，运行中的旧会话继续使用其已冻结快照。

## 权衡

**采用 frontmatter，不继续修正文标题。** 只把 `# 角色` 改回 `# 开发经理` 可以立即修绿测试，但 persona 作者以后再次整理标题仍会复发。frontmatter 把机器字段与自由正文分层，代价是需要格式迁移和兼容解析。

**不复制 SKILL 的 `name` 字段。** SKILL 的 `name` 是自身机器标识；团队 Agent 的对应标识已经是成员目录 slug。重复存储会重新引入漂移源，因此只借用 YAML + snake_case 机制，不照搬所有字段。

**采用正式 YAML parser，不扩写逐行正则。** 当前 capability parser 只识别简单单行值，但身份 description 可能包含标点、引号或 YAML 需要转义的字符。正式 parser 增加一个直接依赖，却能给所有消费方统一、可测试的语法边界。

**保留 legacy fallback，不批量重写用户文件。** 立即强制新格式最整洁，但会把所有现有用户团队标记为损坏。只在完全没有新身份字段时回退，既保兼容，也避免半迁移文件静默拼接两个来源。

## 风险

- YAML parser 对过去被简单正则接受的边缘写法可能更严格。通过 legacy capability 别名测试、引号/注释用例和仓库现有 Agent 全量解析测试约束兼容面。
- 将非法 identity metadata 纳入“需要修复”新增一个 issue code，UI 若未对未知 code 使用通用文案可能显示不完整。实现时必须覆盖 list/detail/repair 状态映射。
- root `agents/*.md` capability 字段迁移会影响 GitHub runner。需要用 `tests/agent-manifest.test.ts` 覆盖新旧字段、冲突与所有角色的实际权限，并运行 root 全量测试。
- 旧字段在仓库中既表示 YAML 键，也表示内部状态属性；若使用全局替换会破坏 state compatibility。实现与 code review 都必须按“引用迁移边界”逐类核对。
- 旧会话保存的是选择时内容快照，不会因 seed 更新追溯改名；这是既有快照契约。验收只要求新会话和团队管理页读取新 seed 后显示正确。
- 回滚代码时，新 snake_case capability 不被旧 runner 识别。若需要回滚，必须同时回滚仓库内 Agent frontmatter；用户团队 identity 仍可由新版前的 legacy fallback 内容继续读取。
