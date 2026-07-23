# 提案：onboarding-high-fidelity-prototype

## 需求基线

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/onboarding.md` | `页面结构` | 把第 3 步从静态占位改为具体团队的连续接力演示 | 已写入 |
| `docs/product/pages/onboarding.md` | `操作与反馈` | 明确重播、播放中继续和减少动态效果语义 | 已写入 |
| `docs/product/pages/onboarding.md` | `指标与验收` | 明确高保真原型为独立、离线、可走通的单 HTML | 已写入 |

## 背景

当前 onboarding 的所谓高保真原型是一组互不相连的 Storybook 静态 Story：按钮没有状态推进，第 3 步仍是占位，也没有采用用户指定的 beUI 动效组件。它既不能验证完整旅程，也把设计探索错误地放进正式组件库源码，造成原型与生产代码边界不清。

## 提案

建立一个仓库级、private 的独立原型沙盒。沙盒使用 React、Motion 与按 copy-source 方式引入的 beUI 动效模式，但禁止导入任何正式产品包；正式产品也不得导入原型。沙盒把 onboarding 构建为一个 CSS、JavaScript 与图形资源全部内联的 HTML，并发布到产品 PRD 同目录供直接打开评审。

原型走通环境硬门、团队选择、约 10 秒的具体团队接力、准备完成和进入新建对话，包含问题修正后的再次复核、持久步骤记录、重新播放、减少动态效果与离线资源门禁。

## 影响

- 新增独立 `prototypes/` workspace 与目录级 `AGENTS.md`。
- 新增 `design-prototypes` 行为规格域。
- 更新 onboarding 产品事实与高保真原型链接。
- 新增可离线打开的 `docs/product/pages/onboarding.prototype.html`。
- 不修改 `desktop`、`packages/console-ui` 或其他生产运行时代码。
