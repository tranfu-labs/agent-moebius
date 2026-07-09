# 任务：landing-hero-agent-moebius

- [ ] Header 改品牌：logo → agent-moebius；nav → Overview/How it works/Docs/GitHub（前两锚正文①②）；右侧 → GitHub + Get started
- [ ] 打字机主标题换 `@mention a role. Your AI team ships it.`（第一句深色/第二句白 + 紫光标）+ 新增副文一行
- [ ] Start Project → `Get started →`；David 徽章 → `@ceo` mention 芯片
- [ ] 圆环中心：换成 CEO 卡 + `orchestrates & guards`，移除 20k+ count-up（清 useCountUp 在 hero 的调用）
- [ ] 6 角色绕轨（SEC/DEV/DM/PM/QA/HU）：复用 6 个极坐标位，渐变卡+缩写+光晕色，反向自转正立，错峰 fly-in；hover 出 charter（无复制按钮，逐字照 design.md 表）
- [ ] 删掉多余的 3 个原 persona 头像位，确认无空槽、无横滚
- [ ] 底部 ticker：技术栈条 Node.js·TypeScript·Codex·gh·Electron 替换虚构 logo
- [ ] 首屏下方 4 节正文一行不改；机制（背景/入场/断点/描边/tooltip）全保留
- [ ] AI 验证：playwright 截首屏核品牌/标题/中心 CEO/6 角色；hover 某角色核 charter；技术栈条滚动；480/768/1024 无横滚；正文 4 节未受影响
