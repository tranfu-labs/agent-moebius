# 官网部署

当前官网只有一个静态页面：[`index.html`](./index.html)。HTML、CSS 和 JavaScript 均已内联，不需要安装依赖、执行构建或启动 Node.js 服务。

## 部署输入

| 配置项 | 值 |
| --- | --- |
| 站点类型 | 静态站点 / Static site |
| 项目根目录 | 仓库根目录 |
| 构建命令 | 留空 |
| 发布目录 | `sites/marketeam` |
| 首页 | `index.html` |
| SPA fallback / rewrite | 不需要 |
| 环境变量与密钥 | 不需要 |

部署时只发布 `sites/marketeam/`。不要把仓库根目录或 `docs/marketing-site/` 设为发布目录；后者包含设计资料和已明确废弃的历史产物，不属于线上内容。

## 本地预览

从仓库根目录执行：

```bash
python3 -m http.server 4173 --directory sites/marketeam
```

然后打开 <http://127.0.0.1:4173/>。不要只用 `file://` 双击作为上线验收，因为 HTTP 预览更接近静态托管环境，也更容易发现资源与控制台错误。

## 外部运行依赖

页面本体自包含，但浏览器会访问以下公共资源：

- Google Fonts：JetBrains Mono、Noto Sans SC
- Lucide UMD：`https://unpkg.com/lucide@1.0.0/dist/umd/lucide.min.js`
- 页面中的 Codex CLI 与 Claude CLI 官方文档链接

CDN 不可用时正文和主要链接仍应可读；字体会回退到系统字体，Lucide 图标可能缺失。若部署环境设置了 Content Security Policy，需要允许上述字体和脚本来源，否则不要添加会拦截它们的 CSP。

## 上线前检查

1. 确认部署产物只有当前目录中的 `index.html` 和本说明文件，没有复制 `docs/marketing-site/archive/`。
2. 用本地 HTTP 服务打开页面，分别检查桌面宽屏和约 375px 移动端。
3. 点击页头的“为什么 / 怎么做 / 过程底单 / 开始”，确认锚点都能到达对应板块。
4. 检查首屏、旧世界、角色移交、对齐/验收/打回、过程底单和开始行动六段内容完整。
5. 在浏览器 DevTools 中确认没有未预期的 JavaScript 错误、404 或页面横向滚动。
6. 开启系统“减少动态效果”后刷新，确认内容仍完整可读。
7. 在预发布 URL 上检查：

   ```bash
   curl -fsS https://<预发布域名>/ | grep -F '<title>'
   curl -fsSI https://<预发布域名>/
   ```

   首页应返回 `200`，响应类型应为 `text/html`。

## 缓存、HTTPS 与回滚

- 正式域名必须启用 HTTPS。
- `index.html` 建议使用可重新验证或较短的缓存策略，避免单文件更新后用户长期看到旧版。
- 当前没有带内容哈希的本地静态资源，不需要额外的长期缓存规则。
- 回滚时恢复上一稳定提交中的 `sites/marketeam/index.html` 并重新部署同一发布目录；没有数据库迁移或服务端状态需要处理。

## 当前不包含

- 多页面路由
- SSR、API 或服务端进程
- npm/pnpm 构建步骤
- 注册、邮箱收集或环境密钥
- `www3` 外部目录中的 audit 截图、style demo 和其他实验页面

部署平台一旦确定，只需在本文件补充该平台的项目设置或命令；不要再复制一份官网页面。
