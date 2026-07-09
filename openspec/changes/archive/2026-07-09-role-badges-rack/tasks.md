# 任务：role-badges-rack

- [ ] 抽出可复用的「员工工牌」组件样式（打孔/卡槽 + 头像缩写色卡 + 姓名 + charter + agent-moebius 公司标 + 条形码），全息档
- [ ] 全息交互：JS 写 `--mx/--my` → ±6° tilt + 光泽扫过 + foil（mix-blend color-dodge，mask 流动），prefers-reduced-motion 降级
- [ ] ③「Your AI team」7 卡 → 完整工牌网格（charter 并入工牌展示）
- [ ] 首屏圆环 7 节点 → 简化版工牌（缩写色卡+卡槽，小体积不过重），中心 CEO 放大版；hover 仍出 charter
- [ ] 底部技术栈条 → 工牌架：perspective 侧立斜插 + 负 margin 叠放，两端渐隐；侧面露缩写色卡
- [ ] 工牌架 hover：只做 translateY 抬起（+轻提亮/z-index），不转正不放大
- [ ] 工牌架点击：弹详情弹窗，显示正面放大工牌 + 角色名/charter/@用法；Esc/遮罩/按钮可关；键盘可达
- [ ] 无横向滚动、正文①②④不动、零第三方外链
- [ ] AI 验证：playwright 截 ③工牌网格；hover 工牌看 tilt/foil；工牌架截默认(侧立)/hover(仅上移不转正)/点击(弹正面详情)三态；480/768/1024 无横滚
