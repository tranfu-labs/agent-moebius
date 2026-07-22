# 任务：align-active-run-content-column

- [x] T1: 对齐主时间线活动运行宿主
  - [x] 复用历史消息的 40px 左缩进
  - [x] 让主时间线 `RunBlock` 填满缩进后的正文列
  - [x] 不修改通用 `RunBlock` 的默认宽度与其他宿主布局

- [x] T2: 补布局回归测试
  - [x] 覆盖含历史消息与 active run 的主时间线组合
  - [x] 断言活动运行宿主与历史消息采用同一缩进
  - [x] 断言主时间线覆盖默认最大宽度，独立 `RunBlock` 默认布局保持不变

- [x] T3: 真实 Electron 视觉验收
  - [x] CDP 读取标题、历史正文、运行中角色名/实时 Markdown 的左边界，误差不超过 1 CSS px
  - [x] CDP 读取「停下」与正文列右边界，误差不超过 1 CSS px
  - [x] 宽窗口与窄窗口截图确认无页面级横向滚动

验证记录：console-ui 21 个测试文件、188 个测试通过；仓库 typecheck 与 desktop build 通过；Electron/CDP 宽窄窗口几何误差均为 0 CSS px。
