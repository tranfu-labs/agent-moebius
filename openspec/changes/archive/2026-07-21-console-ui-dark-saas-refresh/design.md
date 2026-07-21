# 设计：console-ui-dark-saas-refresh

## 方案

以 worktree 实验 `packages/console-ui/src/exp/`（v2）为基样提升为正式语言，四步推进：

1. **tokens.css 合入**（亮暗双主题同时定义）：
   - 暗色画布加深（canvas `#0A0B0D`、card `#15161A`），描边 alpha 0.07→0.12 / 0.11→0.20；亮色对应微调保持既有对比关系。
   - `--radius` 6px→14px（lg/md/sm 仍由 calc 派生）。
   - 新增状态色相族令牌：`--status-{run,info,violet,neutral}-{fg,bg,line}`，亮色主题为同族压深 fg + 浅 tint bg，不允许只定义单主题。
   - accent 保持 `#5E6AD2` 双主题不变，focus ring、hover 方向不变。
2. **Badge 原地替换为 pill**：`src/ui/badge.tsx` 改为「12px 状态图标 + tinted 底 + 同色描边 + `rounded-full`」，`h-6 px-2.5 text-xs font-medium`；variant 集合不变（九状态），新增 `pass` variant 供裁决面使用。图标映射：running 半满饼图（自绘 12px SVG）、pending `Clock`、waiting `Circle`、interrupted/idle `CircleDashed`、completed/displayed 实心圆、failed/stuck `CircleX`、pass `CircleCheck`。
3. **消费方迁移**：`run-outcome`、`agent-teams-page`、`agent-team-detail`、`accept-card`（DecisionSegment 改 pass/failed pill）等逐文件过一遍；侧栏 `StatusIcon` 的 red/blue/blink 会话信号体系不属于 Badge，保持不变。stories 与语义断言测试同步更新。
4. **验证与收尾**：typecheck + vitest 全绿、`build-storybook` 通过、桌面 T4/T4.5/T5 验收截图重新生成、`DESIGN.md` 已在落盘时重写、归档时合并 spec-delta。
5. **清理**：删除 `src/exp/` 实验目录。

## 权衡

- 放弃「waiting 保持中性结构信号」纪律换参考图的 Todo 紫辨识度——用户已拍板接受；红/绿仍独占裁决与危险（红角标计数为唯一登记例外）。
- Badge 原地替换而非并存迁移：避免双形态共存的语义漂移，代价是所有消费方与测试同一 change 内必须过完。
- 不改侧栏会话状态点体系：它是 `needsHuman/hasUnreadResult/isRunning` 三事实推导的独立信号，与 Badge 运行状态语义不同源，混进本次会扩大变更面。

## 风险

- 亮色主题的状态 tint 与既有近单色亮色面可能对比不足：以 Storybook 亮暗双主题走查为准，不达标先调令牌再迁移组件。
- desktop 验收截图全部变化属预期；重生成后需人工核对关键页面无布局破版（pill 比圆点宽，行内空间可能挤压长文本，必要时允许 pill 收缩截断）。
- 回滚：整个 change 收敛在 `packages/console-ui` 与验收截图，git revert 即可。
