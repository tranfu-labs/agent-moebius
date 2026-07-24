# 任务：marketeam-landing-sections

- [ ] 在 index.html 首屏之后追加正文容器与分段样式（延续深底+光晕基调，不动首屏）
- [ ] 加滚动进场机制：IntersectionObserver + `data-reveal` → `.is-visible`，只触发一次，尊重 prefers-reduced-motion
- [ ] ① What is moebius：eyebrow + H2 + 副文 + 3 概念芯片（逐字照 design.md）
- [ ] ② How it works：5 步真实闭环流水（横向连接线，窄屏纵向堆叠），文案逐字照 design.md
- [ ] ③ Your AI team：7 角色卡，复用头像卡视觉；hover 弹框显示角色名 + 真实 charter（无复制按钮），charter 逐字照 design.md 表
- [ ] ④ Goal ledger + CTA + footer：goal→milestone→task→phase 链路小图 + 3 事实芯片 + 复用 Start Project 的 CTA + footer
- [ ] 四节响应式随既有断点自适应，验证无横向滚动
- [ ] AI 验证：playwright 滚动到各节核进场动画、核 ② 五步/③ 七角色文案、hover 某角色核 charter 弹框、480/768/1024 各截图核不横滚
