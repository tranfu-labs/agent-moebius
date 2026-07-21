# 任务：console-ui-dark-saas-refresh

- [x] tokens.css：暗色画布/描边/圆角新基线 + 状态色相族令牌（亮暗双主题）
- [x] badge.tsx：原地替换为「状态图标 + tinted 底 + 同色描边」pill，新增 pass variant
- [x] 消费方迁移：run-outcome / agent-teams-page / agent-team-detail / accept-card 及 stories
- [x] 更新语义断言测试（badge / conversation-sidebar / accept-card 相关）
- [x] tokens.test.ts 更新到新令牌集
- [x] typecheck + vitest 全绿，build-storybook 通过，亮暗双主题 Storybook 走查
- [x] desktop 构建通过，T4/T4.5/T5 验收截图重新生成并人工核对（顺带修复 T4 脚本在 main 上已有的 strict-mode 定位失败）
- [x] 删除 src/exp/ 实验目录
