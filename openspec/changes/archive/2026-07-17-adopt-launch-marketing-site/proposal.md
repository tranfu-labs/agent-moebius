# 提案：adopt-launch-marketing-site

## 背景
当前仓库的 `sites/marketeam/index.html` 与准备上线的 www3 官网已经分叉，现有 marketing-site spec、线框和叙事文档仍描述上一版紫色角色工牌方案。上线入口、设计依据和部署方式因而没有同一份事实源。

## 提案
- 以 `/Users/wing/Develop/moebius-www3/index2.html` 替换 `sites/marketeam/index.html`，继续保持单文件静态官网。
- 将 www3 整站方案、动画语义参考、叙事规格 v1.6.5、官网文案和用户画像归档到 `docs/marketing-site/`；删除已被 v1.6.5 取代的 v1.6.3 文件。
- 在官网目录新增 `DEPLOY.md`，只描述当前唯一的 `index.html` 如何本地预览、验证和发布到任意静态托管。
- 更新 marketing-site 行为规格、页面线框、flow 与仓库结构说明，使其反映六板块上线版。
- 将已明确废弃的 `website-style-decision-v2.0.md` 和旧 `/Users/wing/Develop/moebius-www/index.html` 隔离保存到 `docs/marketing-site/archive/`，并用 README 标明废弃状态，避免回流为当前依据。

## 影响
- 对外页面：`sites/marketeam/index.html` 的叙事、视觉与交互整体切换到 www3 上线版。
- 运维：官网部署根目录固定为 `sites/marketeam/`，唯一入口为 `index.html`，无构建步骤。
- 文档：`docs/marketing-site/` 成为当前官网叙事、文案、用户画像、整站设计与动效语义资料的集中位置。
- 历史：设计废案与旧 HTML 可追溯，但不进入 `sites/marketeam/` 部署目录。
- 不影响 Node.js runner、Electron、console-ui、数据库或 GitHub issue 处理链路。
