# marketing-site spec delta

## Requirement: 官网使用统一 Moebius 品牌图标

Source: docs/product/prd.md#品牌与发行平台

正式 `sites/marketeam/index.html` MUST 在页头显示由全局品牌母版派生的 64px 图标，并声明 32px PNG favicon 与 180px Apple Touch Icon。三个文件 MUST 位于 `sites/marketeam/` 发布目录内并通过品牌资产检查。官网 MUST NOT 使用空 favicon、另一枚无限符号或引用发布目录之外的品牌文件。

### Scenario: 静态站点直接部署

- GIVEN 静态托管只发布 `sites/marketeam/`
- WHEN 浏览器请求首页、favicon 和 Apple Touch Icon
- THEN 三个请求都返回 200
- AND 页头图标、favicon 与 touch icon 来自同一品牌母版

## Requirement: 官网明确仅支持 Apple Silicon Mac

Source: docs/product/prd.md#品牌与发行平台

官网页头、首屏、开始行动与页脚 MUST 把正式产品描述为 macOS Apple Silicon 应用。下载尚未开放时按钮 MUST 继续禁用并如实说明状态；页面 MUST NOT 暗示 Windows、Linux、Intel Mac 或 universal 版本存在或即将提供。

### Scenario: 访客查看发布范围

- GIVEN 访客从官网首屏滚动到开始行动
- WHEN 阅读品牌说明、环境前提和下载状态
- THEN 页面持续明确 Apple Silicon Mac 是唯一正式平台
- AND 不出现其他操作系统或 CPU 架构的下载承诺
