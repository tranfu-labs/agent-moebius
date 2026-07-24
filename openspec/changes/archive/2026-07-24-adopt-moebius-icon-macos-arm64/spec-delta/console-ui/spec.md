# console-ui spec delta

## Requirement: 应用品牌位置复用同一 MoebiusLogo

Source: docs/product/pages/main-left-sidebar.md#品牌标题栏与关闭按钮
Source: docs/product/pages/onboarding.md#应用标题栏每屏

主侧栏品牌行与 onboarding 应用标题栏 MUST 复用同一个 `MoebiusLogo` 组件，并使用品牌脚本生成的 64px 图像在各自槽位中缩放显示。组件 MUST 提供可理解的品牌辅助名称；装饰性重复上下文 MAY 对内部图像隐藏。两处 MUST NOT 各自绘制 SVG、使用图标库 Infinity 图标或引入另一份品牌图形。

### Scenario: 主侧栏与 onboarding 渲染品牌

- GIVEN 分别渲染操作台主侧栏和 onboarding 任一步
- WHEN 查询品牌行
- THEN 两处都显示同一来源的 Moebius 图像与品牌名
- AND DOM 中没有旧的手绘无限 SVG 或 Lucide Infinity 图标

### Scenario: 亮暗主题切换

- GIVEN onboarding 或主侧栏正在显示 MoebiusLogo
- WHEN 主题从亮色切换到暗色
- THEN 图标保持原始黑色符号与白色方形底
- AND 周围布局仍使用当前主题令牌且品牌可辨识
