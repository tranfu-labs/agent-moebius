# marketing-site 规格增量

## 替换：载体与部署
- MUST 以 `sites/marketeam/index.html` 作为当前唯一官网页面和部署入口。
- MUST 保持 HTML、CSS、JavaScript 同文件内联，无构建步骤；静态托管 MUST 将 `sites/marketeam/` 设为发布根目录。
- MUST 在同目录维护 `DEPLOY.md`，记录本地预览、发布输入、上线验证、缓存与回滚方法。
- MAY 访问 Google Fonts 和 Lucide CDN；外部依赖失败时正文与主操作仍 MUST 可读可用。

## 替换：叙事与页面结构
- MUST 以六段连续叙事呈现官网：首屏承诺、旧世界痛点、角色移交、对齐/验收/打回机制、过程底单标准、开始行动。
- MUST 使用 Moebius 品牌和普通人可理解的业务语言，不把内部架构、工作流编辑器或虚构质量数字作为主页主叙事。
- MUST 如实说明当前产品为开源 macOS 桌面应用，依赖用户本机已有可用的 Codex CLI 或 Claude CLI；不得设置注册或邮箱墙。
- MUST 将过程底单明确表达为产品标准/设计图，而不是把尚未兑现的能力伪装成真实产品截图或质量证据。

## 替换：交互与响应式
- MUST 支持页内锚点导航、首屏任务演示、旧世界分镜、角色移交、机制演示和过程底单等页面内交互/动效。
- MUST 支持键盘可达的链接和跳转入口，提供跳到正文的 skip link，并以语义化 section 标注页面结构。
- MUST 在移动端与桌面端保持正文可读且不出现页面横向滚动。
- MUST 尊重 `prefers-reduced-motion`，关闭非必要循环和滚动动效后仍能完整阅读六板块内容。

## 新增：官网设计资料事实链
- MUST 将当前叙事规格、官网文案、用户画像、整站设计方案和动效语义参考集中维护在 `docs/marketing-site/`。
- MUST 将已明确废弃的风格决策稿和旧官网 HTML 隔离在 `docs/marketing-site/archive/` 并显式标记废弃；它们 MUST NOT 作为当前设计依据或进入生产部署目录。
