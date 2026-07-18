# marketeam 目录说明

本目录包含正式营销页、视觉样张和隔离的页面实验。

## 正式文件

- `index.html`：当前正式营销页。任何实验不得直接覆盖它。
- `DEPLOY.md`：静态站点部署说明。

## 去框实验（2026-07-18）

下面三个文件都从 `index.html` 复制，专门验证“减少闭合容器、改用排版与留白建立层级”是否可行。它们不是生产入口，不替代 `index.html`，也不应被发布流程引用。

- `index-cardless-editorial.html`：开放式编辑排版。重点用编号、标题、顶线、留白和普通列表代替卡片。
- `index-cardless-rulebook.html`：单线规则书。重点用横向规则、列对齐和少量背景带组织内容。
- `index-cardless-field.html`：空间接力场。重点用宽窄错位、大留白和连续叙事场建立节奏。

### 当前评审结论

`index-cardless-field.html`（方案 C）当前评价为“方向不错”，可作为下一轮收敛的优先参考。它没有把卡片简单替换成更多分隔线，而是用全宽色场、宽窄错位、显著留白、连续的接力叙事和更强的文字层级建立关系；闭合边界只留给过程底单、终端、聊天窗口和首屏中心作品等真实对象。这个结论只代表实验方向获认可，正式 `index.html` 仍须在明确决定收敛时再单独修改。

### 外部方法来源

- [OpenAI frontend skill](https://github.com/openai/skills/blob/main/skills/.curated/frontend-skill/SKILL.md)：采用“默认无卡片，先用 section、columns、lists、dividers、留白和对比”的组合原则。
- [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)：采用“结构必须编码真实信息”的原则，让阶段编号、错位和色场分别表达顺序、接力与责任变化，而不是纯装饰。
- [Emil Kowalski apple-design](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md)：采用克制、清晰层级和先做可操作原型再复查的思路。
- [Vercel web-design-guidelines](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md)：用于复核响应式、键盘焦点、动效降级和界面基础规则。

三案都必须保留正式页的文案、语义结构、核心 JavaScript 交互、状态色含义、键盘可用性、移动端纵向阅读和无横向滚动。只有真正代表独立对象或真实界面的区域（例如过程底单、终端、聊天窗口、首屏中心作品）可以保留闭合边界；同一信息簇最多保留一层闭合外框。

实验收敛前，不要把三案中的任一 CSS 或结构反向合并进 `index.html`。
