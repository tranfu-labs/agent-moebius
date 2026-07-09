# 任务：rack-badge-fly-transition

- [x] CSS：`rmIn` 保持纯 opacity 淡入；`.fly-layer`（fixed 幽灵层 + perspective）与幽灵卡面定位；`.rack-item.is-away`（架上原卡隐位占位）；`.rack-modal.is-closing`（遮罩淡出）
- [x] JS：改造 rack-modal IIFE——打开编排（量卡片足迹与面板终点、克隆幽灵卡面、幽灵转正放大淡出 + 面板 FLIP 放大淡入的双层动画）
- [x] JS：关闭编排（双层逆向：面板缩回足迹淡出、幽灵淡入落回架上，恢复原卡与焦点），关闭前重新测量原位
- [x] JS：防重入（`animating` 期间忽略 open/close）；`prefers-reduced-motion` / 无 WAAPI 降级为现行为；动画完成后 `cancel()` 释放填充
- [x] 保持不变项自查：工牌架 hover 只抬起不转正、弹窗内容结构、键盘可达（focus + Enter / Esc）、无横向滚动、零第三方外链
- [x] AI 验证（浏览器实跑）：点击工牌→变形中幽灵层存在、面板在动、原卡隐位→落定后幽灵移除、面板/详情完整可见且焦点在关闭钮（截图）；关闭→逆向变形→弹窗隐藏、原卡恢复、焦点回到触发卡；变形中连点防重入不叠加；console 无错误（仅临时静态服务器 favicon 404，与页面无关）
