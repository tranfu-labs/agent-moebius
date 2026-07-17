# 设计：adopt-launch-marketing-site

## 方案
1. 保留既有 `sites/marketeam/` 部署目录，直接用已确认的 www3 `index2.html` 覆盖唯一入口，避免改动任何外部部署路径。
2. 保持页面的 HTML、CSS 与 JavaScript 单文件内联形态；运行时仅访问 Google Fonts、Lucide CDN 以及页面中明确列出的官方文档链接。
3. 将仍然有效的五份上游资料集中到 `docs/marketing-site/`。文件保持原名，便于追溯来源；旧 v1.6.3 由 v1.6.5 取代，不并列保留。两个明确废弃的产物进入 `docs/marketing-site/archive/`，由 README 说明其历史属性。
4. `sites/marketeam/DEPLOY.md` 使用平台无关写法：发布目录、入口、无构建命令、本地 HTTP 预览、上线前检查、缓存/HTTPS/回滚注意事项。部署平台确定后可另补平台配置，但不复制第二个页面。
5. 将现有 marketing-site spec 与线框整体更新为六板块页面事实：首屏、旧世界、角色移交、对齐/验收/打回、过程底单、开始行动。

## 权衡
- 继续沿用历史目录名 `marketeam`，避免破坏潜在部署配置或引用；目录名不再代表页面品牌。
- 不把外部 www3 仓库的 audit 截图、`style-demo.html`、`index.html` 或 Git 元数据带入当前仓库，因为它们不是生产运行依赖；用户指定的两个废案是例外，仅作历史归档。
- 不为纯复制的 73KB 单文件做结构化重写，避免在“采用已确认上线稿”的同时引入新的视觉与交互偏差。
- 页面依赖公共 CDN，断网时字体会回退，Lucide 图标可能不渲染；本次如实记录该运行条件，不擅自改变上线稿。

## 风险
- 公共 CDN 不可用时图标会缺失；部署检查需覆盖浏览器控制台与网络失败表现。
- 单文件体积较大，后续改动需要浏览器回归；本次用桌面与移动视口、无横向滚动、锚点、控制台错误和 reduced-motion 进行验证。
- 回滚方式是恢复上一提交中的 `sites/marketeam/index.html` 与对应事实源，不需要数据迁移。
