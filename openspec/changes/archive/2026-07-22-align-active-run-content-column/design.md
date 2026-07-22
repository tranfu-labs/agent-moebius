# 设计：align-active-run-content-column

## 现状几何

主时间线的外层宽度上限为 760px：

- 会话标题：`max-w-[760px] pl-10`，文字从容器左侧 +40px 开始。
- 历史消息：`TimelineEntry` 使用 `pl-10`，正文同样从 +40px 开始，剩余正文列宽 720px。
- 活动运行：`RunBlock` 是消息列表后的独立兄弟节点，宿主无缩进；组件默认 `max-w-[680px]`，所以左右边界都没有复用正文列。

偏差来自宿主组合，而不是 `RunBlock` 内部的 Markdown renderer。

## 方案

在 `operator-console.tsx` 的主时间线活动运行宿主上建立正文列：

1. 宿主使用与 `TimelineEntry` 相同的 40px 左缩进。
2. 传给 `RunBlock` 的主时间线上下文样式覆盖通用 `max-w-[680px]`，让块级元素占满缩进后的可用宽度。
3. 保持 `RunBlock` 源组件默认样式不变；其他宿主若要采用同一正文列，必须由各自的容器显式决定。

这样运行角色名、实时 Markdown 和左边线从正文列左侧开始，「停下」通过 `ml-auto` 到达正文列右侧；宽度计算全部由现有响应式容器完成，不引入固定像素宽度或 viewport 分支。

## 测试与 AI 验证

本改动没有业务逻辑，单元测试豁免理由是它只调整宿主布局类；但必须补布局契约测试与真实渲染验证：

- Vitest/Testing Library：渲染含历史消息与 `activeRun` 的 `OperatorConsole`，断言活动运行宿主具有与消息相同的左缩进，主时间线里的 `RunBlock` 覆盖默认最大宽度；独立 `RunBlock` 测试继续证明默认 `max-w-[680px]` 未被改动。
- Electron/CDP：制造一条可控运行态，读取标题文字、历史消息正文、运行中角色名、实时输出、停止按钮的 `getBoundingClientRect()`；左边界允许不超过 1 CSS px 误差，停止按钮右边界与正文列右边界允许不超过 1 CSS px 误差。
- 截图人工核对：宽窗口与窄窗口各一张，确认无页面级横向滚动，长实时 Markdown 只在自身容器按既有规则处理。

实测结果：宽窗口与窄窗口的左、右边界误差均为 0 CSS px，两个窗口宽度下 `documentElement.scrollWidth === clientWidth`。

## 权衡

不直接修改 `RunBlock` 默认宽度或添加内置左缩进。`RunBlock` 是通用组件，内部并不知道宿主是否位于 760px 主时间线、子会话面板或 Storybook 画布；把主时间线的 40px 结构写进组件会把宿主规则泄漏到所有使用点。

不只增加 `margin-left: 40px` 并保留 680px 最大宽度。那只能修正左边界，右边界仍比 720px 正文列短 40px，与用户确认的双边对齐目标不符。

## 风险

- `main-conversation-evidence-outlets` 后续也会修改运行操作条。对齐放在主时间线宿主，不触碰按钮结构，可降低并行 change 的代码冲突。
- Tailwind class 合并顺序若失效，默认 `max-w-[680px]` 可能继续生效。组件测试必须断言最终类契约，CDP 验收必须测真实边界。
- 回滚只需撤销主时间线宿主的缩进/宽度覆盖及相应测试，不影响运行数据和中断行为。
