# 设计：extend-ceo-pr-verification-and-authorization

## 方案

### 1. `agents/ceo.md`（主改动，全部业务判据在 persona 层）

- **新增「PR 真实状态核实」章节**：
  - 触发条件：需要对 PR 下任何判断时（交付规范细则、冲突、交付完成度）。
  - 动作：对上下文（issue body / comments / latestResponse）中出现的完整 PR 链接 `https://github.com/<owner>/<repo>/pull/<n>` 执行 `gh pr view <完整URL> --json title,body,state,mergeable,mergeStateStatus`。必须用完整 URL——CEO 子进程的运行目录不在目标仓库，完整 URL 不依赖 cwd。
  - 红线：禁止仅凭评论文本猜测 PR 内容；`gh` 查询失败或超时，不基于猜测介入，保守输出 `no_change`（纯文本层就能确定的问题除外，例如"评论里 PR 不是链接形式"本来就是对评论文本的检查）。
- **改造「交付规范」章节**：`Closes #N` 的检查对象从评论文本改为核实到的 PR body。
- **新增业务场景「PR 冲突」**：核实到 `state=OPEN` 且 `mergeable=CONFLICTING` 的 PR → `append` 一条 `@dev` 修复冲突的评论；merged / closed 的 PR 跳过；不做去重。
- **新增业务场景「免确认操作放行」**：dev 的 `latestResponse` 在向用户征求以下清单内操作的同意时 → `append as=ceo` 直接授权继续：
  1. 从最新 `origin/main` 创建 feature 分支；
  2. 把方案落盘到 `openspec/changes/`。
  - 明确排除（仍等用户）：进入实现阶段（"开始写代码"是既定闸门）、push、创建 / 合并 PR、任何删除类操作。

### 2. `src/format-ceo.ts`（唯一代码改动）

`DEFAULT_CEO_TIMEOUT_MS`：`60_000` → `300_000`。超时取消子进程、fail-open 发原文的既有语义不变。

### 3. spec-delta

见 `spec-delta/github-issue-runner.md`：识别场景四类扩六类；新增 persona 层 gh 核实要求；澄清第 143 条边界——`format-ceo.ts` 代码层仍 MUST NOT 调用 GitHub，PR 核实发生在 CEO Codex 子进程内部，属 persona 层行为，不经过 runner 的 GitHub adapter；超时默认值更新；新增对应场景。

## 权衡

- **CEO 自查 vs runner 预取注入**：选 CEO 自查（用户确认）。runner 预取确定性强、可单测，但要在 runner 加 PR 链接解析 + gh 拉取 + prompt 字段扩展一整层；CEO 自查代码改动最小（一个常量），且 CEO 本来就以 `--yolo` 运行、具备工具能力。代价是"是否真去查"只能靠 persona MUST 措辞约束。
- **冲突提醒不去重**：用户确认按"dev 提交一次、CEO 验收一次"的节奏，CEO 只在有新 agent 响应待发布时运行，天然不会无评论刷屏。
- **授权边界只写 ceo.md**：不改 dev.md，dev 行为保持保守（照旧询问），由 CEO 统一放行。代价是每次多一轮 CEO append 往返，换取 dev persona 不膨胀。
- **超时 300 秒**：gh 查询 + xhigh reasoning 需要余量；runner 心跳与评论发布本就异步，5 分钟上限可接受。不做成按需动态超时，避免引入新配置面。

## 风险

- **CEO 不执行 gh 就下判断**：persona 用 MUST 措辞 + 明确"禁止凭文本猜测"红线约束；AI 验证用例检查 run 目录 `stdout.jsonl` 中存在 gh 命令事件。回滚：还原 ceo.md 章节与超时常量即可，无状态、无迁移。
- **gh 在 CEO 子进程内不可用/未认证**：与现有 runner 依赖一致（本机已 `gh auth login`），失败路径按"不基于猜测介入"降级为 `no_change`。
- **300 秒超时放大故障窗口**：fail-open 语义不变，最坏情况是评论晚 5 分钟发布，不阻断主流程。
